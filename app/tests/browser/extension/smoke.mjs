import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { runSharedScenario, instrumentedFixture } from '../helpers/extension-driver.mjs';
import { uiAssertions } from '../helpers/ui-assertions.mjs';
const icon = await readFile('public/images/icon16.png');
const site = createServer((request, response) => {
  if (request.url === '/favicon.ico') {
    response.setHeader('Content-Type', 'image/png');
    response.end(icon);
  } else {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      '<title>Capture site</title><link rel="icon" href="/favicon.ico"><body style="background:#fc0">Capture test</body>',
    );
  }
});
await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
const siteUrl = 'http://127.0.0.1:' + site.address().port;
const prelude = () => {
  window.bookmarkMutations = [];
  window.pendingRuntimeMessages = 0;
  const api = globalThis.browser ?? chrome,
    send = api.runtime.sendMessage.bind(api.runtime);
  api.runtime.sendMessage = (...args) => {
    window.pendingRuntimeMessages++;
    return send(...args).finally(() => window.pendingRuntimeMessages--);
  };
  for (const name of ['create', 'update', 'move', 'remove', 'removeTree']) {
    const original = api.bookmarks[name];
    api.bookmarks[name] = (...args) => {
      window.bookmarkMutations.push(name);
      return original.apply(api.bookmarks, args);
    };
  }
};
try {
  await runSharedScenario(
    'smoke',
    async (browser, d) => {
      const { evaluate, poll, click, fill, key, caseDone, shot } = d,
        u = uiAssertions(d);
      const button = (text, scope = 'button') => u.byText(scope, text),
        menu = (text) => button(text, '[role=menuitem]');
      const open = async () => {
        await u.count('dialog', 0);
        await u.count('.settings', 0);
        await u.focus('.settings-trigger');
        await key('Enter');
        await u.visible('.settings');
        await u.disabled('#bookmark-folder', false);
      };
      const close = async () => {
        await click('button[aria-label="Закрыть настройки"]');
        await u.count('.settings', 0);
        await poll(() => evaluate(() => window.pendingRuntimeMessages)).toBe(0);
      };
      const source = async (id) => {
        await open();
        await u.select('#bookmark-folder', id);
        await close();
        await poll(() =>
          evaluate(
            async () =>
              (await (globalThis.browser ?? chrome).storage.local.get('rootFolderId')).rootFolderId,
          ),
        ).toBe(id);
      };
      await d.releaseApp();
      const parentId = await evaluate(() => {
        const api = globalThis.browser ?? chrome;
        return api.bookmarks.getTree().then((tree) => {
          if (api.runtime.getURL('/').startsWith('moz-extension:')) return 'unfiled_____';
          const others = tree[0].children.filter(
              (n) => n.folderType === 'other' && !n.unmodifiable,
            ),
            account = others.filter((n) => n.syncing);
          return (account.length === 1 ? account[0] : others.length === 1 ? others[0] : null)?.id;
        });
      });
      assert(parentId);
      await poll(() =>
        evaluate(
          async () =>
            (await (globalThis.browser ?? chrome).storage.local.get('rootFolderId')).rootFolderId,
        ),
      ).toBe(parentId);
      assert.deepEqual(await evaluate(() => window.bookmarkMutations), []);
      assert.deepEqual(
        await evaluate(
          async (id) =>
            (await (globalThis.browser ?? chrome).bookmarks.getChildren(id)).filter(
              (n) => n.title === 'Speed Dial',
            ),
          parentId,
        ),
        [],
      );
      caseDone('native-clean-profile');
      const sources = await evaluate(async (parent) => {
          const api = globalThis.browser ?? chrome;
          const a = await api.bookmarks.create({ parentId: parent, title: 'Source A' }),
            b = await api.bookmarks.create({ parentId: parent, title: 'Source B' });
          return { a: a.id, b: b.id };
        }, parentId),
        rootId = sources.a;
      await evaluate(() => {
        window.bookmarkMutations = [];
      });
      await source(rootId);
      assert.deepEqual(await evaluate(() => window.bookmarkMutations), []);
      const state = () =>
        evaluate((id) => (globalThis.browser ?? chrome).bookmarks.getChildren(id), rootId);
      await click(await button('Новая закладка'));
      await fill('#bookmark-url', siteUrl);
      await fill('#bookmark-title', 'Custom title');
      await u.checked('.capture-option input');
      await click('.capture-option input');
      await u.checked('.capture-option input', false);
      await click(await button('Добавить', 'dialog button'));
      await u.count('.bookmark', 1);
      const id = (await state())[0].id;
      assert.equal((await state())[0].title, 'Custom title');
      await click('.bookmark', { button: 'right' });
      await click(await menu('Обновить эскиз'));
      await poll(() => evaluate(() => document.querySelector('.notice')?.textContent)).toContain(
        'Изображения обновлены',
      );
      assert.equal((await state())[0].title, 'Custom title');
      await poll(() => u.node('.bookmark', (e) => e.style.backgroundImage)).toContain('blob:');
      assert.equal(
        await evaluate(async (id) => {
          const db = await new Promise((resolve) => {
            const r = indexedDB.open('SpeedDialX');
            r.onsuccess = () => resolve(r.result);
          });
          const row = await new Promise((resolve) => {
            const r = db.transaction('tileAssets').objectStore('tileAssets').getAll();
            r.onsuccess = () => resolve(r.result.find((row) => row.bookmarkId === id));
          });
          db.close();
          return !!row?.favicon?.size && !!row?.thumbnail?.size;
        }, id),
        true,
      );
      caseDone('native-capture-custom-title');
      const peer = await d.newPeer();
      await peer.releaseApp();
      const pu = uiAssertions(peer);
      await pu.count('.bookmark', 1);
      await open();
      await u.select('#bookmark-folder', sources.b);
      await poll(() =>
        evaluate(
          async () =>
            (await (globalThis.browser ?? chrome).storage.local.get('rootFolderId')).rootFolderId,
        ),
      ).toBe(sources.b);
      await key('Escape');
      await u.count('.settings', 0);
      await source(rootId);
      await open();
      await u.select('#bookmark-folder', sources.b);
      await evaluate(
        (id) => (globalThis.browser ?? chrome).bookmarks.update(id, { title: 'Source B renamed' }),
        sources.b,
      );
      await u.containsText('#bookmark-folder option:checked', 'Source B renamed');
      await u.value('#bookmark-folder', sources.b);
      const untouched = await evaluate(() => (globalThis.browser ?? chrome).bookmarks.getTree());
      await evaluate(() => {
        window.bookmarkMutations = [];
      });
      await close();
      await pu.count('.bookmark', 0);
      await source(rootId);
      await u.count('.bookmark-title', 1);
      await pu.count('.bookmark-title', 1);
      assert.deepEqual(await evaluate(() => window.bookmarkMutations), []);
      assert.deepEqual(
        await evaluate(() => (globalThis.browser ?? chrome).bookmarks.getTree()),
        untouched,
      );
      await peer.poll(() => peer.evaluate(() => window.pendingRuntimeMessages)).toBe(0);
      await peer.close();
      caseDone('source-autosave-and-peer-cache');
      await open();
      await evaluate(() => {
        const api = globalThis.browser ?? chrome;
        window.originalStorageSet = api.storage.local.set;
        api.storage.local.set = (values, ...args) =>
          'rootFolderId' in values
            ? Promise.reject(Error('Test root storage failure'))
            : window.originalStorageSet.call(api.storage.local, values, ...args);
      });
      await u.select('#bookmark-folder', sources.b);
      await fill('input[aria-label="Ширина (%)"]', '50');
      await u.node('input[aria-label="Ширина (%)"]', (e) => e.blur());
      await u.containsText('.settings [role=alert]', 'Test root storage failure');
      assert.equal(
        await evaluate(
          async () =>
            (await (globalThis.browser ?? chrome).storage.local.get('rootFolderId')).rootFolderId,
        ),
        rootId,
      );
      await poll(() =>
        evaluate(
          async () =>
            (await (globalThis.browser ?? chrome).storage.local.get('settings')).settings?.value
              ?.width,
        ),
      ).toBe(50);
      await evaluate(() => {
        (globalThis.browser ?? chrome).storage.local.set = window.originalStorageSet;
      });
      await u.select('#bookmark-folder', rootId);
      await fill('input[aria-label="Ширина (%)"]', '100');
      await key('Escape');
      await u.count('.settings', 0);
      await evaluate(() => {
        const api = globalThis.browser ?? chrome;
        window.originalGetTree = api.bookmarks.getTree;
        api.bookmarks.getTree = () => Promise.reject(Error('Test folder access failure'));
      });
      await u.focus('.settings-trigger');
      await key('Enter');
      await u.containsText('.settings [role=alert]', 'Test folder access failure');
      await u.disabled('#bookmark-folder');
      await evaluate(() => {
        (globalThis.browser ?? chrome).bookmarks.getTree = window.originalGetTree;
      });
      await click(await button('Повторить', '.settings button'));
      await u.disabled('#bookmark-folder', false);
      await close();
      caseDone('folder-and-storage-failures');
      await evaluate(
        (id) => (globalThis.browser ?? chrome).bookmarks.update(id, { title: 'External title' }),
        id,
      );
      await u.containsText('.bookmark', 'External title');
      const structure = await evaluate(async (root) => {
        const api = globalThis.browser ?? chrome,
          a = await api.bookmarks.create({ parentId: root, title: 'A' }),
          b = await api.bookmarks.create({ parentId: root, title: 'Главная' }),
          nested = await api.bookmarks.create({ parentId: a.id, title: 'Hidden folder' });
        await api.bookmarks.create({
          parentId: nested.id,
          title: 'Hidden',
          url: 'https://hidden.example/',
        });
        const bookmark = await api.bookmarks.create({
          parentId: a.id,
          title: 'Folder site',
          url: 'https://folder.example/',
        });
        return { a: a.id, b: b.id, bookmark: bookmark.id };
      }, rootId);
      await click(await button('A', 'button.folder-tab'));
      await u.count('.bookmark', 1);
      await poll(() => u.node('.bookmark', (e) => e.getAttribute('aria-label'))).toContain(
        'Folder site',
      );
      await click(await button('Главная', 'button.folder-tab'));
      await u.count('.bookmark', 0);
      await click('.folder-root');
      await click('.bookmark', { button: 'right' });
      await click(await menu('Изменить закладку'));
      await u.select('dialog select', structure.b);
      await click(await button('Сохранить', 'dialog button'));
      await u.visible('.folder-root');
      await click(await button('Главная', 'button.folder-tab'));
      await u.containsText('.bookmark', 'External title');
      const second = await d.newPeer();
      await second.releaseApp();
      const su = uiAssertions(second);
      await second.click(await su.byText('button.folder-tab', 'Главная'));
      await evaluate(
        (id) =>
          (globalThis.browser ?? chrome).bookmarks.update(id, {
            title: 'Both tabs',
            url: 'https://changed.example/',
          }),
        id,
      );
      await poll(() => u.node('.bookmark', (e) => e.getAttribute('aria-label'))).toContain(
        'Both tabs',
      );
      await second
        .poll(() => su.node('.bookmark', (e) => e.getAttribute('aria-label')))
        .toContain('Both tabs');
      await u.css('.bookmark', 'background-image', 'none');
      await second.poll(() => second.evaluate(() => window.pendingRuntimeMessages)).toBe(0);
      await second.close();
      caseDone('external-events-and-transfer');
      await evaluate(
        async ({ id, root }) => {
          const api = globalThis.browser ?? chrome;
          await api.bookmarks.move(id, { parentId: root });
          await api.bookmarks.create({
            parentId: root,
            title: 'Second',
            url: 'https://second.example/',
          });
        },
        { id, root: rootId },
      );
      await click('.folder-root');
      await u.count('.bookmark', 2);
      const before = (await state()).filter((n) => n.url).map((n) => n.id),
        target = '.bookmark:nth-of-type(2)';
      const rect = await u.rect(target);
      await d.dragTo('.bookmark:nth-of-type(1)', target, {
        targetPosition: { x: rect.width - 2, y: 20 },
      });
      await poll(async () => (await state()).filter((n) => n.url).map((n) => n.id)).toEqual(
        before.slice().reverse(),
      );
      await poll(() => evaluate(() => window.pendingRuntimeMessages)).toBe(0);
      await d.reload();
      await d.releaseApp();
      await u.count('.bookmark', 2);
      caseDone('native-drag-reload');
      const draft = '#folder-name',
        plus = async () => {
          await click('.folder-root', { button: 'right' });
          await click(await menu('Новая папка'));
          await u.focused(draft);
        };
      const beforeDraft = (await state()).length;
      await plus();
      await fill(draft, 'Cancelled folder');
      await key('Escape');
      await u.count(draft, 0);
      assert.equal((await state()).length, beforeDraft);
      await plus();
      await fill(draft, '   ');
      await key('Enter');
      await u.visible(draft);
      assert.equal((await state()).length, beforeDraft);
      await fill(draft, 'UI folder');
      await key('Enter');
      await u.count(draft, 0);
      const uiFolder = (await state()).find((n) => n.title === 'UI folder');
      assert(uiFolder);
      await click('.folder-root', { button: 'right' });
      assert.equal(
        await evaluate(
          () =>
            [...document.querySelectorAll('[role=menuitem]')].filter(
              (e) => e.textContent.trim() === 'Удалить папку',
            ).length,
        ),
        0,
      );
      await key('Escape');
      await click(await button('UI folder', 'button.folder-tab'), { button: 'right' });
      await click(await menu('Изменить папку'));
      await u.focused(draft);
      await u.value(draft, 'UI folder');
      await fill(draft, 'Cancelled rename');
      await key('Escape');
      assert.equal((await state()).find((n) => n.id === uiFolder.id).title, 'UI folder');
      await click(await button('UI folder', 'button.folder-tab'), { button: 'right' });
      await click(await menu('Изменить папку'));
      await fill(draft, 'UI renamed');
      await key('Enter');
      await u.count(draft, 0);
      assert.equal((await state()).find((n) => n.id === uiFolder.id).title, 'UI renamed');
      await d.dragTo(
        await button('UI renamed', 'button.folder-tab'),
        await button('A', 'button.folder-tab'),
        { targetPosition: { x: 2, y: 24 } },
      );
      await poll(async () => (await state()).filter((n) => !n.url).map((n) => n.id)).toEqual([
        uiFolder.id,
        structure.a,
        structure.b,
      ]);
      await click(await button('UI renamed', 'button.folder-tab'), { button: 'right' });
      await click(await menu('Удалить папку'));
      await click(await button('Отмена', '.confirmation-dialog button'));
      await u.count('.confirmation-dialog', 0);
      assert((await state()).some((n) => n.id === uiFolder.id));
      await u.focus(await button('UI renamed', 'button.folder-tab'));
      await key('Shift+F10');
      await click(await menu('Удалить папку'));
      await click(await button('Удалить', '.confirmation-dialog button'));
      await u.count('.confirmation-dialog', 0);
      assert(!(await state()).some((n) => n.id === uiFolder.id));
      await click('.bookmark:nth-of-type(1)', { button: 'right' });
      await click(await menu('Удалить закладку'));
      await click(await button('Отмена', '.confirmation-dialog button'));
      await u.count('.confirmation-dialog', 0);
      await u.count('.bookmark', 2);
      await open();
      assert.equal(
        await evaluate(
          () =>
            [...document.querySelectorAll('.settings button')].filter(
              (e) => e.textContent.trim() === 'Очистить выбранную папку',
            ).length,
        ),
        0,
      );
      assert.equal((await state()).filter((n) => n.url).length, 2);
      await close();
      caseDone('folder-crud-and-confirmations');
      await open();
      await u.containsText('.settings', browser === 'chrome' ? 'Выключена' : 'Статус недоступен');
      await click(await button('Управление данными', '.settings button'));
      await evaluate(() => {
        window.backupClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
          if (this.download) window.backupUrl = this.href;
          else window.backupClick.call(this);
        };
      });
      await click(await button('Экспорт', '.data-management button'));
      await click(await button('Экспортировать', '.data-management button'));
      await u.containsText('.data-management [role=status]', 'запущено');
      const exported = await evaluate(async () =>
        JSON.parse(await (await fetch(window.backupUrl)).text()),
      );
      assert.equal(exported.version, 3);
      assert(exported.entries.some((e) => e.title === 'A' && e.children.length === 1));
      assert(!JSON.stringify(exported).includes('Hidden'));
      await click(await button('Готово', '.data-management button'));
      await u.count('.data-management', 0);
      await open();
      await click(await button('Управление данными', '.settings button'));
      const directory = resolve('.browser-test', `smoke-files-${browser}-${crypto.randomUUID()}`);
      await mkdir(directory, { recursive: true });
      const file = resolve(directory, 'backup.json');
      await writeFile(
        file,
        JSON.stringify({
          version: 3,
          entries: [{ title: 'Imported', url: siteUrl }],
          settings: exported.settings,
          background: null,
        }),
      );
      await d.setInputFiles('.data-management input[type=file]', file);
      await click(await button('Импортировать', '.data-management button'));
      await u.containsText('.data-management [role=status]', 'Добавлена 1 закладка');
      await u.count('.bookmark', 3);
      await click(await button('Готово', '.data-management button'));
      await u.count('.data-management', 0);
      await open();
      await click(await button('Управление данными', '.settings button'));
      await click('button[aria-label="Сбросить настройки и кэш"]');
      await click(await button('Сбросить', '.data-management button'));
      await u.containsText(
        '.data-management [role=status]',
        'Закладки и выбранная папка сохранены',
      );
      await u.count('.bookmark', 3);
      await key('Escape');
      await u.count('.data-management', 0);
      await u.count('.settings', 0);
      caseDone('backup-import-and-safe-reset');
      const searchFixture = await evaluate(async (root) => {
        const api = globalThis.browser ?? chrome,
          a = await api.bookmarks.create({ parentId: root, title: 'Search Work' }),
          b = await api.bookmarks.create({ parentId: root, title: 'Search Personal' }),
          direct = await api.bookmarks.create({
            parentId: root,
            title: 'Needle root',
            url: 'https://root.example/',
          }),
          first = await api.bookmarks.create({
            parentId: a.id,
            title: 'First result',
            url: 'https://work.example/needle',
          }),
          second = await api.bookmarks.create({
            parentId: b.id,
            title: 'Needle second',
            url: 'https://personal.example/',
          }),
          deep = await api.bookmarks.create({ parentId: a.id, title: 'Hidden' });
        await api.bookmarks.create({
          parentId: deep.id,
          title: 'Needle hidden',
          url: 'https://hidden.example/',
        });
        return { a: a.id, b: b.id, direct: direct.id, first: first.id, second: second.id };
      }, rootId);
      await click(await button('Search Work', 'button.folder-tab'));
      await u.count('.bookmark', 1);
      await d.clickAt(3, 3);
      await key('/');
      const localSearch = 'input[aria-label="Поиск по закладкам"]';
      await u.focused(localSearch);
      await u.value(localSearch, '');
      await fill(localSearch, '  nEeDlE  ');
      await u.count('.bookmark', 3);
      await u.count('.bookmark-title', 0);
      assert.equal(
        await evaluate(() =>
          [...document.querySelectorAll('.bookmark')].every((e) => e.draggable === false),
        ),
        true,
      );
      await d.resize(360, 800);
      assert.equal(await evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await shot('bookmark-search-360');
      await d.resize(1280, 800);
      await evaluate(
        (id) =>
          (globalThis.browser ?? chrome).bookmarks.update(id, {
            title: 'Renamed externally',
            url: 'https://work.example/changed',
          }),
        searchFixture.first,
      );
      await u.count('.bookmark', 2);
      await evaluate(
        (id) => (globalThis.browser ?? chrome).bookmarks.remove(id),
        searchFixture.second,
      );
      await u.count('.bookmark', 1);
      await click('.bookmark', { button: 'right' });
      await click(await menu('Изменить закладку'));
      await fill('#bookmark-title', 'Slash');
      await key('/');
      await u.value('#bookmark-title', 'Slash/');
      await click('dialog button[aria-label="Закрыть"]');
      await u.count('dialog', 0);
      await fill(localSearch, 'no-match');
      await u.containsText('.bookmark-area [role=status]', 'Закладки не найдены');
      await evaluate(() => {
        const api = globalThis.browser ?? chrome;
        window.originalSearchRead = api.bookmarks.getSubTree;
        api.bookmarks.getSubTree = async () => {
          throw Error('Search read failed');
        };
      });
      await fill(localSearch, 'needle');
      await u.containsText('[role=alert]', 'Search read failed');
      await u.count('.bookmark', 0);
      await evaluate(() => {
        (globalThis.browser ?? chrome).bookmarks.getSubTree = window.originalSearchRead;
      });
      await click(await button('Повторить'));
      await u.count('.bookmark', 1);
      await fill(localSearch, '');
      await u.count('.bookmark', 1);
      await u.attribute('.bookmark', 'title', 'Renamed externally — https://work.example/changed');
      await key('Escape');
      await u.value(localSearch, '');
      await u.attribute(await button('Search Work', 'button.folder-tab'), 'aria-pressed', 'true');
      await u.select('.search select', 'yandex');
      await fill('.search input', '');
      await key('/');
      await u.value('.search input', '/');
      await fill('.search input', '');
      caseDone('local-search-and-shortcut-isolation');
      // The former Firefox-only path additionally saved a title through the edit UI
      // and removed the currently selected folder externally. Exercise both everywhere.
      await u.select('.search select', 'bookmarks');
      await fill(localSearch, '');
      await click('.bookmark', { button: 'right' });
      await click(await menu('Изменить закладку'));
      await fill('#bookmark-title', 'Edited through UI');
      await click(await button('Сохранить', 'dialog button'));
      await poll(() => u.node('.bookmark', (e) => e.getAttribute('aria-label'))).toContain(
        'Edited through UI',
      );
      assert.equal(
        (
          await evaluate(
            (id) => (globalThis.browser ?? chrome).bookmarks.get(id),
            searchFixture.first,
          )
        )[0].title,
        'Edited through UI',
      );
      await evaluate(
        (id) => (globalThis.browser ?? chrome).bookmarks.removeTree(id),
        searchFixture.a,
      );
      await u.count('.bookmark', 4);
      await evaluate(async (f) => {
        const api = globalThis.browser ?? chrome;
        await api.bookmarks.removeTree(f.b);
        await api.bookmarks.remove(f.direct);
      }, searchFixture);
      caseDone('edit-and-external-folder-removal');
      await evaluate((id) => (globalThis.browser ?? chrome).bookmarks.removeTree(id), rootId);
      await poll(() =>
        evaluate(
          async () =>
            (await (globalThis.browser ?? chrome).storage.local.get('rootFolderId')).rootFolderId,
        ),
      ).toBe(parentId);
      await u.containsText('.notice', 'Другие закладки');
      assert.deepEqual(
        await evaluate(
          async (id) =>
            (await (globalThis.browser ?? chrome).bookmarks.getChildren(id)).filter(
              (n) => n.title === 'Speed Dial',
            ),
          parentId,
        ),
        [],
      );
      assert.deepEqual(await d.errors(), []);
      await shot('native-fallback');
      caseDone('native-source-fallback');
      console.log(
        'PASS ' +
          browser +
          ' full shared smoke: native capture, cache/tabs, API failures, native drag, folder CRUD, backup, search and fallback',
      );
    },
    {
      launchOptions: async (browser) => ({
        extension: await instrumentedFixture(browser, 'smoke', prelude),
        gated: true,
      }),
    },
  );
} finally {
  site.closeAllConnections();
  await new Promise((resolve) => site.close(resolve));
}
