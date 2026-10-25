import { chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { launchFirefox, firefoxUrl } from './firefox-driver.mjs';

await mkdir('.browser-test/text-tiles', { recursive: true });
const extension = resolve('.output/chrome-mv3');
if(!process.argv.includes('--firefox-only')) {
const context = await chromium.launchPersistentContext(resolve('.browser-test', 'text-' + randomUUID()), {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 },
  args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  await page.addInitScript(() => {
    // Force a slow decoder to make startup races visible and reproducible.
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function () {
      await new Promise(resolve => setTimeout(resolve, 100));
      return decode.call(this);
    };
    window.tileColors = {};
    window.initialPreviews = [];
    const sample = () => {
      for (const tile of document.querySelectorAll('.bookmark')) {
        if (getComputedStyle(tile).visibility !== 'visible') continue;
        if (tile.href === 'https://image.example/') {
          window.initialPreviews.push({ image: tile.style.backgroundImage, text: !!tile.querySelector('.tile-hostname') });
          continue;
        }
        (window.tileColors[tile.href] ??= []).push(tile.style.backgroundColor);
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:\/\//, route => route.abort());
  await page.goto(worker.url().replace('background.js', 'newtab.html'));
  await expect(page.getByRole('button', { name: 'Настройки', exact: true })).toBeEnabled();
  const image = (await readFile('public/images/icon128.png')).toString('base64');
  await page.evaluate(async image => {
    const tree = await chrome.bookmarks.getTree();
    const parent = tree[0].children.find(node => !node.unmodifiable && !node.url);
    const root = await chrome.bookmarks.create({ parentId: parent.id, title: 'Speed Dial' });
    const urls = ['https://www.Example.com/a', 'https://example.com/b', 'https://a-very-long-hostname-that-will-need-ellipsis.example.org', 'https://broken.example', 'https://image.example'];
    const rows = [];
    for (const url of urls) rows.push(await chrome.bookmarks.create({ parentId: root.id, url, title: '<b>Custom title</b>' }));
    const thumbnail = await (await fetch('data:image/png;base64,' + image)).blob();
    const db = await new Promise(resolve => { const request = indexedDB.open('SpeedDialX'); request.onsuccess = () => resolve(request.result); });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('tileAssets', 'readwrite');
      const store = tx.objectStore('tileAssets');
      store.put({ bookmarkId: rows[0].id, url: rows[0].url, favicon: thumbnail });
      store.put({ bookmarkId: rows[1].id, url: rows[1].url, favicon: thumbnail });
      store.put({ bookmarkId: rows[3].id, url: rows[3].url, thumbnail: new Blob(['broken'], { type: 'image/png' }) });
      store.put({ bookmarkId: rows[4].id, url: rows[4].url, thumbnail });
      tx.oncomplete = resolve; tx.onerror = reject;
    });
    db.close();
    await chrome.storage.local.set({ rootFolderId: root.id, settings: { value: { width: 100, countColumns: 6, space: 24, verticalCenter: false, addButton: true } } });
  }, image);
  await page.reload();
  await expect(page.locator('.tile-hostname')).toHaveCount(4);
  await expect(page.locator('.bookmark-title')).toHaveCount(1);
  await expect(page.locator('.bookmark').nth(3)).toHaveCSS('background-image', 'none');
  const color = index => page.locator('.bookmark').nth(index).evaluate(el => getComputedStyle(el).backgroundColor);
  await expect(page.locator('.bookmark').first()).not.toHaveCSS('background-color', 'rgb(117, 70, 145)');
  expect(await color(0)).toBe(await color(1));
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 250)));
  expect(await page.evaluate(() => Object.keys(window.tileColors).length)).toBe(4);
  expect(await page.evaluate(() => window.initialPreviews.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.initialPreviews.every(state => !!state.image && !state.text))).toBe(true);
  expect(await page.evaluate(() => Object.values(window.tileColors).every(colors => new Set(colors).size === 1))).toBe(true);
  const initialColor = await color(0);
  await page.reload();
  await expect(page.locator('.tile-hostname')).toHaveCount(4);
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 250)));
  expect(await page.evaluate(() => Object.values(window.tileColors).every(colors => new Set(colors).size === 1))).toBe(true);
  expect(await color(0)).toBe(initialColor);
  expect(await page.evaluate(() => window.initialPreviews.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.initialPreviews.every(state => !!state.image && !state.text))).toBe(true);
  await expect(page.locator('.bookmark').first()).toHaveAttribute('aria-label', '<b>Custom title</b> — https://www.example.com/a');
  expect(await page.locator('.bookmark b').count()).toBe(0);
  // Record every DOM mutation, including a text fallback shorter than one frame.
  const thumbnail = page.locator('.bookmark[href="https://image.example/"]');
  const originalPreview = await thumbnail.evaluate(el => el.style.backgroundImage);
  await page.evaluate(() => {
    const tile = document.querySelector('.bookmark[href="https://image.example/"]');
    window.previewStates = [];
    window.previewObserver = new MutationObserver(() => window.previewStates.push({ image: tile.style.backgroundImage, text: !!tile.querySelector('.tile-hostname') }));
    window.previewObserver.observe(tile, { attributes:true, childList:true, subtree:true });
  });
  await page.evaluate(async () => {
    const { rootFolderId } = await chrome.storage.local.get('rootFolderId');
    const nodes = await chrome.bookmarks.getChildren(rootFolderId);
    await chrome.bookmarks.update(nodes.find(row => row.url === 'https://image.example/').id, {title:'Renamed preview'});
  });
  await expect(thumbnail).toHaveAttribute('aria-label', 'Renamed preview — https://image.example/');
  expect(await thumbnail.evaluate(el => el.style.backgroundImage)).toBe(originalPreview);
  expect(await page.evaluate(() => window.previewStates.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.previewStates.every(state => !!state.image && !state.text))).toBe(true);
  await page.evaluate(() => window.previewObserver.disconnect());
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await page.mouse.move(0,0);
  await page.evaluate(() => document.activeElement?.blur());
  await page.locator('.bookmarks').screenshot({ path: '.browser-test/text-tiles/current.png' });
  for (const width of [360, 1280, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    for (const columns of [2, 6, 12]) {
      await page.evaluate(async countColumns => {
        const { settings } = await chrome.storage.local.get('settings');
        await chrome.storage.local.set({ settings: { value: { ...settings.value, countColumns } } });
      }, columns);
      await page.reload();
      await expect(page.locator('.tile-hostname')).toHaveCount(4);
      await expect(page.locator('.bookmark-title')).toHaveCount(1);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const tile of await page.locator('.bookmark').all()) {
        const bounds = await tile.boundingBox();
        expect(bounds.width).toBeGreaterThanOrEqual(140);
        expect(bounds.height).toBeGreaterThanOrEqual(78);
      }
      for (const label of await page.locator('.tile-hostname > span').all()) {
        expect(await label.evaluate(el => getComputedStyle(el).whiteSpace)).toBe('nowrap');
        expect(await label.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
      }
      await page.screenshot({ path: `.browser-test/text-tiles/${width}-${columns}.png` });
    }
  }
  expect(errors).toEqual([]);
  const brandIcons = await Promise.all(['ya.ru', 'youtube.com'].map(async host => ({ host, data: (await readFile(`tests/fixtures/favicons/${host}.ico`)).toString('base64') })));
  await page.evaluate(async icons => {
    const { rootFolderId } = await chrome.storage.local.get('rootFolderId');
    const rows = [];
    for (const { host, data } of icons) {
      const row = await chrome.bookmarks.create({parentId:rootFolderId, url:`https://${host}/`, title:host});
      const favicon = await (await fetch('data:image/x-icon;base64,' + data)).blob();
      rows.push({bookmarkId:row.id,url:row.url,favicon});
    }
    const db = await new Promise(resolve => {const r=indexedDB.open('SpeedDialX'); r.onsuccess=()=>resolve(r.result);});
    await new Promise((resolve,reject)=>{const tx=db.transaction('tileAssets','readwrite');for(const row of rows)tx.objectStore('tileAssets').put(row);tx.oncomplete=resolve;tx.onerror=reject;});
    db.close();
  }, brandIcons);
  for (let attempt=0; attempt<2; attempt++) {
    await page.reload();
    await expect(page.locator('.bookmark[href="https://ya.ru/"]')).toHaveCSS('background-color','rgb(183, 44, 22)');
    await expect(page.locator('.bookmark[href="https://youtube.com/"]')).toHaveCSS('background-color','rgb(197, 0, 0)');
    await expect(page.locator('.bookmark[href="https://ya.ru/"] .tile-hostname > span')).toHaveCSS('color','rgb(255, 255, 255)');
    await expect(page.locator('.bookmark[href="https://youtube.com/"] .tile-hostname > span')).toHaveCSS('color','rgb(255, 255, 255)');
  }
  console.log('PASS real ya.ru / YouTube ICO colors, color resolution, reload stability');
  console.log('PASS text tiles: favicon-only, corrupt/valid thumbnail, safe labels, stable colors, 9 responsive screenshots');
} finally { await context.close(); }
}

if (!process.argv.includes('--chrome-only')) {
const driver = await launchFirefox();
try {
  await driver.command('WebDriver:Navigate', { url: firefoxUrl });
  await driver.until('return !!document.querySelector(".page") && !document.querySelector(".settings-trigger").disabled;');
  await driver.exec('const tree=await browser.bookmarks.getTree(); const parent=tree[0].children.find(row=>!row.unmodifiable&&!row.url); const root=await browser.bookmarks.create({parentId:parent.id,title:"Speed Dial"}); await browser.bookmarks.create({parentId:root.id,title:"Custom Firefox",url:"https://www.example.com/path"}); await browser.storage.local.set({rootFolderId:root.id});');
  await driver.until('return document.querySelector(".folder-root")?.textContent.trim()==="Speed Dial";');
  await driver.command('WebDriver:Refresh');
  await driver.until('return !!document.querySelector(".tile-hostname");');
  assert.equal(await driver.exec('return document.querySelector(".tile-hostname").textContent.trim();'), 'example.com');
  assert.equal(await driver.exec('return document.querySelectorAll(".bookmark-title").length;'), 0);
  assert.ok(await driver.exec('return document.querySelector(".bookmark").getAttribute("aria-label").includes("Custom Firefox");'));
  console.log('PASS firefox text tiles: normalized hostname, no caption, accessible title');
} finally { await driver.close(); }
}
