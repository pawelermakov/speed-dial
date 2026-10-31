import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { openExtension, selectedBrowsers } from '../helpers/extension-driver.mjs';
import { textTileFixture } from '../helpers/text-tile-helpers.mjs';
import { scenarioReportPath, validateScenarioReport } from '../../scenarios.mjs';

async function check(driver, cases) {
  const { evaluate, poll } = driver;
  const out = resolve('.browser-test/text-tiles', driver.browser);
  await mkdir(out, { recursive: true });
  let artifactCount = 0;
  const errors = async () => assert.deepEqual(await evaluate(() => window.tileErrors), []);
  const reload = async () => {
    await errors();
    await driver.reload();
  };
  const count = (selector) =>
    evaluate((selector) => document.querySelectorAll(selector).length, selector);
  const css = (selector, property) =>
    evaluate(
      ({ selector, property }) =>
        document.querySelector(selector)
          ? getComputedStyle(document.querySelector(selector))[property]
          : null,
      { selector, property },
    );
  const ready = async () => {
    await poll(() => count('.tile-hostname')).toBe(4);
    await poll(() => count('.bookmark-title')).toBe(1);
  };
  const shot = async (name, selector) => {
    const path = resolve(out, name + '.png');
    await rm(path, { force: true });
    await driver.screenshot(path, { selector });
    const png = await readFile(path);
    assert.ok(
      png.length > 24 && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    );
    const width = png.readUInt32BE(16),
      height = png.readUInt32BE(20);
    assert.ok(width > 0 && height > 0);
    if (selector) {
      const bounds = await evaluate((selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { width: r.width, height: r.height };
      }, selector);
      assert.ok(
        Math.abs(width - bounds.width) <= 1 && Math.abs(height - bounds.height) <= 1,
        'Element screenshot must cover the bookmark grid',
      );
    }
    artifactCount++;
  };
  const samples = async () => {
    // Preserve the original sampling interval after the deliberately slow decode.
    await evaluate(() => new Promise((resolve) => setTimeout(resolve, 250)));
    assert.equal(await evaluate(() => Object.keys(window.tileColors).length), 4);
    assert.ok(await evaluate(() => window.initialPreviews.length > 0));
    assert.equal(
      await evaluate(() => window.initialPreviews.every((state) => !!state.image && !state.text)),
      true,
    );
    assert.equal(
      await evaluate(() =>
        Object.values(window.tileColors).every((colors) => new Set(colors).size === 1),
      ),
      true,
    );
  };
  await driver.offline(true);
  const image = (await readFile('public/images/icon128.png')).toString('base64');
  await evaluate(async (image) => {
    const tree = await (globalThis.browser ?? globalThis.chrome).bookmarks.getTree();
    const parent = tree[0].children.find((node) => !node.unmodifiable && !node.url);
    const root = await (globalThis.browser ?? globalThis.chrome).bookmarks.create({
      parentId: parent.id,
      title: 'Speed Dial',
    });
    const urls = [
      'https://www.Example.com/a',
      'https://example.com/b',
      'https://a-very-long-hostname-that-will-need-ellipsis.example.org',
      'https://broken.example',
      'https://image.example',
    ];
    const rows = [];
    for (const url of urls)
      rows.push(
        await (globalThis.browser ?? globalThis.chrome).bookmarks.create({
          parentId: root.id,
          url,
          title: '<b>Custom title</b>',
        }),
      );
    const thumbnail = await (await fetch('data:image/png;base64,' + image)).blob();
    const db = await new Promise((resolve) => {
      const request = indexedDB.open('SpeedDialX');
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('tileAssets', 'readwrite');
      const store = tx.objectStore('tileAssets');
      store.put({ bookmarkId: rows[0].id, url: rows[0].url, favicon: thumbnail });
      store.put({ bookmarkId: rows[1].id, url: rows[1].url, favicon: thumbnail });
      store.put({
        bookmarkId: rows[3].id,
        url: rows[3].url,
        thumbnail: new Blob(['broken'], { type: 'image/png' }),
      });
      store.put({ bookmarkId: rows[4].id, url: rows[4].url, thumbnail });
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    db.close();
    await (globalThis.browser ?? globalThis.chrome).storage.local.set({
      rootFolderId: root.id,
      settings: {
        value: { width: 100, countColumns: 6, space: 24, verticalCenter: false, addButton: true },
      },
    });
  }, image);
  await reload();
  await ready();
  await poll(() => css('.bookmark[href="https://broken.example/"]', 'backgroundImage')).toBe(
    'none',
  );
  await poll(() => css('.bookmark', 'backgroundColor')).not.toBe('rgb(117, 70, 145)');
  assert.equal(
    await css('.bookmark:nth-child(1)', 'backgroundColor'),
    await css('.bookmark:nth-child(2)', 'backgroundColor'),
  );
  await samples();
  const initialColor = await css('.bookmark', 'backgroundColor');
  await reload();
  await ready();
  await samples();
  assert.equal(await css('.bookmark', 'backgroundColor'), initialColor);
  assert.equal(
    await evaluate(() => document.querySelector('.bookmark').getAttribute('aria-label')),
    '<b>Custom title</b> — https://www.example.com/a',
  );
  assert.equal(
    await evaluate(() => document.querySelector('.bookmark .tile-hostname').textContent.trim()),
    'example.com',
  );
  assert.equal(await count('.bookmark b'), 0);
  assert.equal(await count('.bookmark:first-child .bookmark-title'), 0);
  cases.push('assets-and-startup-stability');

  const selector = '.bookmark[href="https://image.example/"]';
  const originalPreview = await evaluate(
    (selector) => document.querySelector(selector).style.backgroundImage,
    selector,
  );
  await evaluate((selector) => {
    const tile = document.querySelector(selector);
    window.previewStates = [];
    window.previewObserver = new MutationObserver(() =>
      window.previewStates.push({
        image: tile.style.backgroundImage,
        text: !!tile.querySelector('.tile-hostname'),
      }),
    );
    window.previewObserver.observe(tile, { attributes: true, childList: true, subtree: true });
  }, selector);
  await evaluate(async () => {
    const { rootFolderId } = await (globalThis.browser ?? globalThis.chrome).storage.local.get(
      'rootFolderId',
    );
    const nodes = await (globalThis.browser ?? globalThis.chrome).bookmarks.getChildren(
      rootFolderId,
    );
    await (globalThis.browser ?? globalThis.chrome).bookmarks.update(
      nodes.find((row) => row.url === 'https://image.example/').id,
      {
        title: 'Renamed preview',
      },
    );
  });
  await poll(() =>
    evaluate((selector) => document.querySelector(selector).getAttribute('aria-label'), selector),
  ).toBe('Renamed preview — https://image.example/');
  assert.equal(
    await evaluate((selector) => document.querySelector(selector).style.backgroundImage, selector),
    originalPreview,
  );
  assert.ok(await evaluate(() => window.previewStates.length > 0));
  assert.equal(
    await evaluate(() => window.previewStates.every((state) => !!state.image && !state.text)),
    true,
  );
  await evaluate(() => window.previewObserver.disconnect());
  await evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
    document.head.append(style);
    document.activeElement?.blur();
  });
  await driver.movePointer(0, 0);
  await shot('current', '.bookmarks');
  cases.push('preview-rename-stability');

  for (const width of [360, 1280, 1920]) {
    await driver.resize(width, 800);
    for (const columns of [2, 6, 12]) {
      await evaluate(async (countColumns) => {
        const api = globalThis.browser ?? globalThis.chrome;
        const { settings } = await api.storage.local.get('settings');
        await api.storage.local.set({ settings: { value: { ...settings.value, countColumns } } });
      }, columns);
      await reload();
      await ready();
      await evaluate(async () => {
        await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      assert.equal(await evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const bounds = await evaluate(() =>
        [...document.querySelectorAll('.bookmark')].map((tile) => {
          const r = tile.getBoundingClientRect();
          return { width: r.width, height: r.height };
        }),
      );
      for (const tile of bounds) {
        assert.ok(tile.width >= 140);
        assert.ok(tile.height >= 78);
      }
      const labels = await evaluate(() =>
        [...document.querySelectorAll('.tile-hostname > span')].map((label) => {
          const style = getComputedStyle(label);
          return { whiteSpace: style.whiteSpace, fontSize: parseFloat(style.fontSize) };
        }),
      );
      for (const label of labels) {
        assert.equal(label.whiteSpace, 'nowrap');
        assert.ok(label.fontSize >= 12);
      }
      await shot(width + '-' + columns);
    }
  }
  await errors();
  cases.push('responsive-layouts');
  const icons = await Promise.all(
    ['ya.ru', 'youtube.com'].map(async (host) => ({
      host,
      data: (await readFile('tests/fixtures/favicons/' + host + '.ico')).toString('base64'),
    })),
  );
  await evaluate(async (icons) => {
    const { rootFolderId } = await (globalThis.browser ?? globalThis.chrome).storage.local.get(
      'rootFolderId',
    );
    const rows = [];
    for (const { host, data } of icons) {
      const row = await (globalThis.browser ?? globalThis.chrome).bookmarks.create({
        parentId: rootFolderId,
        url: `https://${host}/`,
        title: host,
      });
      const favicon = await (await fetch('data:image/x-icon;base64,' + data)).blob();
      rows.push({ bookmarkId: row.id, url: row.url, favicon });
    }
    const db = await new Promise((resolve) => {
      const r = indexedDB.open('SpeedDialX');
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('tileAssets', 'readwrite');
      for (const row of rows) tx.objectStore('tileAssets').put(row);
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    db.close();
  }, icons);
  for (let attempt = 0; attempt < 2; attempt++) {
    await reload();
    await poll(() => css('.bookmark[href="https://ya.ru/"]', 'backgroundColor')).toBe(
      'rgb(183, 44, 22)',
    );
    await poll(() => css('.bookmark[href="https://youtube.com/"]', 'backgroundColor')).toBe(
      'rgb(197, 0, 0)',
    );
    for (const host of ['ya.ru', 'youtube.com'])
      await poll(() =>
        css('.bookmark[href="https://' + host + '/"] .tile-hostname > span', 'color'),
      ).toBe('rgb(255, 255, 255)');
  }
  await errors();
  cases.push('ico-colours-and-reload');
  return artifactCount;
}
const runId = process.env.SPEED_DIAL_TEST_RUN_ID ?? crypto.randomUUID();
for (const browser of selectedBrowsers()) {
  const cases = [];
  const extension = await textTileFixture(browser);
  const driver = await openExtension(browser, { extension });
  await mkdir('.browser-test/parity-reports', { recursive: true });
  const path = scenarioReportPath('text-tiles', browser);
  try {
    const artifactCount = await check(driver, cases);
    const report = { id: 'text-tiles', browser, runId, status: 'passed', cases, artifactCount };
    validateScenarioReport(report, { id: 'text-tiles', browser, runId });
    await writeFile(path, JSON.stringify(report));
    console.log('PASS ' + browser + ' text-tiles: ' + cases.join(', ') + '; ten screenshots');
  } catch (error) {
    await writeFile(
      path,
      JSON.stringify({ id: 'text-tiles', browser, runId, status: 'failed', cases }),
    );
    throw error;
  } finally {
    await driver.close();
  }
}
