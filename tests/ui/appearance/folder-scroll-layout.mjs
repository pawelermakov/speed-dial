import assert from 'node:assert/strict';
import { runSharedScenario } from '../../browser/helpers/extension-driver.mjs';

await runSharedScenario(
  'folder-scroll-layout',
  async (browser, { evaluate, poll, ready, resize, caseDone }) => {
    await ready();
    const root = await evaluate(async () => {
      const api = globalThis.browser ?? chrome;
      const { rootFolderId } = await api.storage.local.get('rootFolderId');
      await api.bookmarks.create({
        parentId: rootFolderId,
        title: 'Layout fixture',
        url: 'https://layout.example/',
      });
      return rootFolderId;
    });
    const count = (selector) => evaluate((s) => document.querySelectorAll(s).length, selector);
    await poll(() => count('.bookmark')).toBe(1);
    const geometry = () =>
      evaluate(() => {
        const list = document.querySelector('.folder-scroll'),
          folder = document.querySelector('.folder-root'),
          grid = document.querySelector('.bookmarks');
        return {
          height: list.getBoundingClientRect().height,
          folderY: folder.getBoundingClientRect().y,
          gridY: grid.getBoundingClientRect().y,
        };
      });
    const overflow = () =>
      evaluate(() => {
        const e = document.querySelector('.folder-scroll');
        return e.scrollWidth > e.clientWidth;
      });
    for (const width of [320, 1280, 1920]) {
      await resize(width, 800);
      await poll(overflow).toBe(false);
      const before = await geometry();
      const ids = await evaluate(async (root) => {
        const api = globalThis.browser ?? chrome,
          ids = [];
        for (let i = 0; i < 30; i++)
          ids.push(
            (await api.bookmarks.create({ parentId: root, title: 'Очень длинная папка ' + i })).id,
          );
        return ids;
      }, root);
      await poll(() => count('.folder-tab')).toBe(30);
      await poll(overflow).toBe(true);
      assert.deepEqual(await geometry(), before, 'overflow must not change vertical geometry');
      await evaluate(async (ids) => {
        const api = globalThis.browser ?? chrome;
        for (const id of ids) await api.bookmarks.remove(id);
      }, ids);
      await poll(() => count('.folder-tab')).toBe(0);
      await poll(overflow).toBe(false);
      assert.deepEqual(
        await geometry(),
        before,
        'removing overflow must not change vertical geometry',
      );
      await poll(() =>
        evaluate(() => getComputedStyle(document.querySelector('.folder-scroll')).scrollbarColor),
      ).toBe('rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)');
      caseDone(`overflow-${width}`);
    }
    console.log(
      `PASS ${browser} folder scrollbar appearance/disappearance: stable geometry at 320/1280/1920`,
    );
  },
);
