import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const extension = resolve('.output/chrome-mv3');
const context = await chromium.launchPersistentContext(
  resolve('.browser-test/scroll-layout-' + crypto.randomUUID()),
  {
    locale: 'ru-RU',
    channel: 'chromium',
    headless: true,
    args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
  },
);
try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const page = await context.newPage();
  await page.goto(worker.url().replace('background.js', 'newtab.html'));
  await expect(page.getByRole('button', { name: 'Настройки', exact: true })).toBeEnabled();
  const root = await page.evaluate(async () => {
    const { rootFolderId } = await chrome.storage.local.get('rootFolderId');
    await chrome.bookmarks.create({
      parentId: rootFolderId,
      title: 'Layout fixture',
      url: 'https://layout.example/',
    });
    return rootFolderId;
  });
  await expect(page.locator('.bookmark')).toHaveCount(1);
  const geometry = () =>
    page.evaluate(() => {
      const list = document.querySelector('.folder-scroll'),
        folder = document.querySelector('.folder-root'),
        grid = document.querySelector('.bookmarks');
      return {
        height: list.getBoundingClientRect().height,
        folderY: folder.getBoundingClientRect().y,
        gridY: grid.getBoundingClientRect().y,
      };
    });
  for (const width of [320, 1280, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    await expect
      .poll(() => page.locator('.folder-scroll').evaluate((e) => e.scrollWidth > e.clientWidth))
      .toBe(false);
    const before = await geometry();
    const ids = await page.evaluate(async (root) => {
      const ids = [];
      for (let i = 0; i < 30; i++)
        ids.push(
          (await chrome.bookmarks.create({ parentId: root, title: 'Очень длинная папка ' + i })).id,
        );
      return ids;
    }, root);
    await expect(page.locator('.folder-tab')).toHaveCount(30);
    await expect
      .poll(() => page.locator('.folder-scroll').evaluate((e) => e.scrollWidth > e.clientWidth))
      .toBe(true);
    assert.deepEqual(await geometry(), before, 'overflow must not change vertical geometry');
    await page.evaluate(async (ids) => {
      for (const id of ids) await chrome.bookmarks.remove(id);
    }, ids);
    await expect(page.locator('.folder-tab')).toHaveCount(0);
    await expect
      .poll(() => page.locator('.folder-scroll').evaluate((e) => e.scrollWidth > e.clientWidth))
      .toBe(false);
    assert.deepEqual(
      await geometry(),
      before,
      'removing overflow must not change vertical geometry',
    );
    await expect(page.locator('.folder-scroll')).toHaveCSS(
      'scrollbar-color',
      'rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)',
    );
  }
  console.log(
    'PASS folder scrollbar appearance/disappearance: stable row, folder, search and grid geometry at 320/1280/1920',
  );
} finally {
  await context.close();
}
