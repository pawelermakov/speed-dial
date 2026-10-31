import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { openExtension, selectedBrowsers } from '../helpers/extension-driver.mjs';
import { wallpaperFixture } from '../helpers/wallpaper-helpers.mjs';
import { scenarioReportPath, validateScenarioReport } from '../../scenarios.mjs';

async function check(driver, cases) {
  const { evaluate, poll } = driver;
  let artifactCount = 0;
  const out = resolve('.browser-test/wallpaper-startup', driver.browser);
  await mkdir(out, { recursive: true });
  const errors = async () => assert.deepEqual(await evaluate(() => window.wallpaperErrors), []);
  const reload = async () => {
    await errors();
    await driver.reload();
  };
  const shot = async (name) => {
    const path = resolve(out, name + '.png');
    await rm(path, { force: true });
    await driver.screenshot(path);
    const png = await readFile(path);
    assert.ok(
      png.length > 24 && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    );
    assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0);
    artifactCount++;
  };
  const background = () =>
    evaluate(() => document.querySelector('.page-background')?.style.backgroundImage);
  const previewValue = () => evaluate(() => localStorage.getItem('speed-dial-background-preview'));
  const css = (selector, property) =>
    evaluate(
      ({ selector, property }) => getComputedStyle(document.querySelector(selector))[property],
      { selector, property },
    );
  const open = async () => {
    await driver.ready();
    await evaluate(() => document.querySelector('.settings-trigger').focus());
    await driver.key('Enter');
    await poll(() =>
      evaluate(
        () =>
          !!document.querySelector('.settings') &&
          !document.querySelector('.settings-panel-enter-active'),
      ),
    ).toBe(true);
  };
  const close = async () => {
    await driver.click('[aria-label="Закрыть настройки"]');
    await poll(() => evaluate(() => document.querySelectorAll('.settings').length)).toBe(0);
  };
  const upload = async (color) => {
    const png = await evaluate((color) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const context = canvas.getContext('2d');
      context.fillStyle = color;
      context.fillRect(0, 0, 1920, 1080);
      return canvas.toDataURL('image/png').split(',')[1];
    }, color);
    const path = resolve(out, 'wallpaper-' + crypto.randomUUID() + '.png');
    await writeFile(path, Buffer.from(png, 'base64'));
    await driver.setInputFiles('#background', path);
    await poll(background).toContain('blob:');
    await poll(previewValue).toMatch(/^data:image\/jpeg;base64,/);
  };
  await driver.releaseApp();
  await open();
  await upload('#247a49');
  await close();
  const preview = await previewValue();
  assert.ok(preview.length <= 300000);

  // Keep the production app entry inert while the original bootstrap and CSS run.
  await reload();
  await evaluate(() => {
    window.holdWallpaperDecode = true;
  });
  await poll(() => css('html', 'backgroundImage')).toContain('data:image/jpeg');
  assert.equal(await evaluate(() => document.querySelectorAll('.page').length), 0);
  await shot('before-app');
  cases.push('preview-before-app');

  await driver.releaseApp();
  await poll(() => evaluate(() => typeof window.releaseWallpaperDecode)).toBe('function');
  await poll(() => css('.page', 'backgroundColor')).toBe('rgba(0, 0, 0, 0)');
  await poll(() => css('.page-background', 'backgroundColor')).toBe('rgba(0, 0, 0, 0)');
  await poll(() => css('.page-background', 'opacity')).toBe('0');
  await shot('during-decode');
  await evaluate(() => window.releaseWallpaperDecode());
  await poll(background).toContain('blob:');
  await poll(() => css('.page', 'backgroundColor')).toBe('rgba(0, 0, 0, 0)');
  await poll(() => css('.page-background', 'position')).toBe('fixed');
  await poll(() => css('.page-background', 'opacity')).toBe('1');
  assert.equal(await css('.page-background', 'transitionDuration'), '0s');
  await shot('after-load');
  cases.push('decode-handoff');

  await open();
  await upload('#9b354a');
  await poll(previewValue).not.toBe(preview);
  await driver.click('[aria-label="Удалить фон"]');
  await poll(previewValue).toBe(null);
  assert.equal(
    await evaluate(() => document.documentElement.style.getPropertyValue('--startup-background')),
    '',
  );
  await close();
  await reload();
  await driver.releaseApp();
  assert.equal(await css('html', 'backgroundImage'), 'none');
  cases.push('wallpaper-replacement-removal');

  await evaluate(
    (preview) => localStorage.setItem('speed-dial-background-preview', preview),
    preview,
  );
  await reload();
  await driver.releaseApp();
  await poll(previewValue).toBe(null);
  await errors();
  cases.push('stale-preview-cleanup');
  return artifactCount;
}

const runId = process.env.SPEED_DIAL_TEST_RUN_ID ?? crypto.randomUUID();
for (const browser of selectedBrowsers()) {
  const cases = [];
  const extension = await wallpaperFixture(browser);
  const driver = await openExtension(browser, { extension, gated: true });
  await mkdir('.browser-test/parity-reports', { recursive: true });
  const path = scenarioReportPath('wallpaper-startup', browser);
  try {
    const artifactCount = await check(driver, cases);
    const report = {
      id: 'wallpaper-startup',
      browser,
      runId,
      status: 'passed',
      cases,
      artifactCount,
    };
    validateScenarioReport(report, { id: 'wallpaper-startup', browser, runId });
    await writeFile(path, JSON.stringify(report));
    console.log(
      'PASS ' +
        browser +
        ' wallpaper-startup: ' +
        cases.join(', ') +
        '; native file upload and three screenshots',
    );
  } catch (error) {
    await writeFile(
      path,
      JSON.stringify({ id: 'wallpaper-startup', browser, runId, status: 'failed', cases }),
    );
    throw error;
  } finally {
    await driver.close();
  }
}
