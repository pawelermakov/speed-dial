import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { openExtension, selectedBrowsers, startupFixture } from '../helpers/extension-driver.mjs';
import { scenarioReportPath, validateScenarioReport } from '../../scenarios.mjs';

async function check(driver, cases) {
  const { evaluate, poll, releaseApp, ready, media } = driver;
  await releaseApp();
  const initialMedia = await media();
  await driver.openPeer();
  await releaseApp('peer');
  const setTheme = async (mode) => {
    await evaluate(async (mode) => {
      const api = globalThis.browser ?? chrome;
      const { settings } = await api.storage.local.get('settings');
      await api.storage.local.set({ settings: { value: { ...settings?.value, theme: mode } } });
    }, mode);
    await poll(() => evaluate(() => localStorage.getItem('speed-dial-theme'))).toBe(mode);
  };
  await setTheme('dark');
  await poll(driver.peerTheme).toBe('dark');
  await driver.closePeer();
  cases.push('native-second-tab');
  for (const [mode, os, resolved] of [
    ['dark', 'light', 'dark'],
    ['light', 'dark', 'light'],
    ['system', 'dark', 'dark'],
    ['system', 'light', 'light'],
  ]) {
    await media({ colorScheme: os });
    await setTheme(mode);
    await evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 2;
      c.height = 2;
      c.getContext('2d').fillRect(0, 0, 2, 2);
      localStorage.setItem('speed-dial-background-preview', c.toDataURL('image/jpeg'));
    });
    await driver.reload();
    assert.equal(
      await evaluate(() => document.querySelectorAll('.page').length),
      0,
      'app must remain gated',
    );
    const state = await evaluate(() => ({
      scheme: document.documentElement.style.colorScheme,
      background: getComputedStyle(document.documentElement).backgroundColor,
      paint: getComputedStyle(document.documentElement).backgroundImage,
      mode: document.documentElement.dataset.themeMode,
      theme: document.documentElement.dataset.theme,
    }));
    assert.equal(state.theme, resolved);
    assert.equal(state.scheme, resolved);
    assert.equal(state.mode, mode);
    assert.equal(state.background, resolved === 'dark' ? 'rgb(22, 25, 31)' : 'rgb(233, 237, 242)');
    assert.ok(
      state.paint.includes(resolved === 'dark' ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0)'),
      state.paint,
    );
    await driver.screenshot(
      resolve('.browser-test/themes', driver.browser + '-before-app-' + mode + '-' + os + '.png'),
    );
    await releaseApp();
    await ready();
    assert.equal(await evaluate(() => document.documentElement.dataset.theme), resolved);
    cases.push('before-app-' + mode + '-' + os);
  }
  await setTheme('dark');
  await driver.key('Tab');
  await evaluate(() => {
    document.querySelector('.settings-trigger').focus();
    const e = document.querySelector('.page-background');
    e.style.backgroundColor = '#fff';
    e.style.opacity = '1';
  });
  await poll(() =>
    evaluate(() => getComputedStyle(document.querySelector('.settings-trigger')).boxShadow),
  ).not.toBe('none');
  await driver.screenshot(
    resolve('.browser-test/themes', driver.browser + '-dark-focus-bright-wallpaper.png'),
  );
  await driver.click('.settings-trigger');
  await evaluate(() => document.querySelector('#theme-mode').focus());
  assert.equal(await evaluate(() => document.activeElement.id), 'theme-mode');
  cases.push('dark-keyboard-focus');
  await media({ colorScheme: 'dark', contrast: 'more' });
  await poll(() =>
    evaluate(() => getComputedStyle(document.querySelector('.settings')).backgroundColor),
  ).toBe('rgba(32, 38, 48, 0.98)');
  await poll(() =>
    evaluate(
      () =>
        getComputedStyle(document.querySelector('.settings input[type=number]')).backgroundColor,
    ),
  ).toBe('rgba(255, 255, 255, 0.16)');
  cases.push('increased-contrast');
  const nativeTransparency = await media({
    colorScheme: 'dark',
    transparency: 'reduce',
    enableTransparencyFeature: false,
  });
  await poll(() =>
    evaluate(() => getComputedStyle(document.querySelector('.settings')).backgroundColor),
  ).toBe(nativeTransparency.transparencyAvailable ? 'rgb(32, 38, 48)' : 'rgba(40, 47, 59, 0.96)');
  assert.equal(
    await evaluate(() => getComputedStyle(document.querySelector('.settings')).backdropFilter),
    nativeTransparency.transparencyAvailable ? 'none' : 'blur(12px) saturate(1.6)',
  );
  cases.push('native-transparency-capability');
  const transparency = await media({ colorScheme: 'dark', transparency: 'reduce' });
  await poll(() =>
    evaluate(() => getComputedStyle(document.querySelector('.settings')).backgroundColor),
  ).toBe('rgb(32, 38, 48)');
  assert.equal(
    await evaluate(() => getComputedStyle(document.querySelector('.settings')).backdropFilter),
    'none',
  );
  cases.push('reduced-transparency');
  await media({
    colorScheme: 'light',
    forcedColors: 'active',
    contrast: 'more',
    reducedMotion: 'reduce',
  });
  assert.equal(
    await evaluate(() => getComputedStyle(document.querySelector('.settings')).backdropFilter),
    'none',
  );
  await driver.key('Tab');
  await driver.key('Shift+Tab');
  assert.equal(await evaluate(() => document.activeElement.id), 'theme-mode');
  assert.equal(
    await evaluate(() => getComputedStyle(document.activeElement).outlineStyle),
    'solid',
  );
  await driver.screenshot(
    resolve('.browser-test/themes', driver.browser + '-dark-forced-colors.png'),
  );
  cases.push('forced-colors-keyboard-focus');
  return { cases, initialMedia, nativeTransparency, transparency };
}
const runId = process.env.SPEED_DIAL_TEST_RUN_ID ?? crypto.randomUUID();
for (const browser of selectedBrowsers()) {
  const extension = await startupFixture(browser);
  const driver = await openExtension(browser, { extension, gated: true });
  const cases = [];
  try {
    const result = await check(driver, cases);
    const report = { id: 'theme-startup', browser, runId, status: 'passed', ...result };
    validateScenarioReport(report, { id: 'theme-startup', browser, runId });
    await mkdir('.browser-test/parity-reports', { recursive: true });
    await writeFile(scenarioReportPath('theme-startup', browser), JSON.stringify(report, null, 2));
    console.log(
      'PASS ' +
        browser +
        ' theme-startup: ' +
        result.cases.join(', ') +
        '; ' +
        JSON.stringify({ initialMedia: result.initialMedia, transparency: result.transparency }),
    );
  } catch (error) {
    await mkdir('.browser-test/parity-reports', { recursive: true });
    await writeFile(
      scenarioReportPath('theme-startup', browser),
      JSON.stringify({ id: 'theme-startup', browser, runId, status: 'failed', cases }, null, 2),
    );
    throw error;
  } finally {
    await driver.close();
  }
}
