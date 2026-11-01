import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { runSharedScenario, instrumentedFixture } from '../helpers/extension-driver.mjs';
import { uiAssertions } from '../helpers/ui-assertions.mjs';

const autosavePrelude = () => {
  window.pendingRuntimeMessages = 0;
  const runtime = (globalThis.browser ?? chrome).runtime;
  const sendMessage = runtime.sendMessage.bind(runtime);
  runtime.sendMessage = (...args) => {
    window.pendingRuntimeMessages++;
    return sendMessage(...args).finally(() => window.pendingRuntimeMessages--);
  };
  window.mutations = [];
  for (const key of ['create', 'update', 'move', 'remove', 'removeTree']) {
    const original = (globalThis.browser ?? chrome).bookmarks[key];
    (globalThis.browser ?? chrome).bookmarks[key] = (...args) => {
      window.mutations.push(key);
      return original.apply((globalThis.browser ?? chrome).bookmarks, args);
    };
  }
};
const createFixture = async () => {
  const { rootFolderId } = await (globalThis.browser ?? chrome).storage.local.get('rootFolderId');
  const other = await (globalThis.browser ?? chrome).bookmarks.create({
    parentId: rootFolderId,
    title: 'Another source',
  });
  const a = await (globalThis.browser ?? chrome).bookmarks.create({
      parentId: rootFolderId,
      title: 'Folder A',
    }),
    b = await (globalThis.browser ?? chrome).bookmarks.create({
      parentId: rootFolderId,
      title: 'Folder B',
    });
  await (globalThis.browser ?? chrome).bookmarks.create({
    parentId: a.id,
    title: 'A tile',
    url: 'https://a.example/',
  });
  await (globalThis.browser ?? chrome).bookmarks.create({
    parentId: b.id,
    title: 'B tile',
    url: 'https://b.example/',
  });
  return { root: rootFolderId, other: other.id, a: a.id, b: b.id };
};

const failSettingsWrite = () => {
  const original = (globalThis.browser ?? chrome).storage.local.set;
  window.restoreSet = () => ((globalThis.browser ?? chrome).storage.local.set = original);
  (globalThis.browser ?? chrome).storage.local.set = (value, ...args) =>
    value.settings
      ? Promise.reject(new Error('settings write failed'))
      : original.call((globalThis.browser ?? chrome).storage.local, value, ...args);
};

const delayFolderRead = (id) => {
  const original = (globalThis.browser ?? chrome).bookmarks.getChildren;
  window.restoreChildren = () => ((globalThis.browser ?? chrome).bookmarks.getChildren = original);
  window.delayedRead = false;
  (globalThis.browser ?? chrome).bookmarks.getChildren = async (requested) => {
    if (requested === id) {
      window.delayedRead = true;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return original.call((globalThis.browser ?? chrome).bookmarks, requested);
  };
};

const rapidSourceChanges = ({ root, other }) => {
  const select = document.querySelector('#bookmark-folder');
  for (const id of [other, root, other, root]) {
    select.value = id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
};
await runSharedScenario(
  'settings-autosave',
  async (browser, driver) => {
    const {
        evaluate,
        poll,
        releaseApp,
        reload,
        resize,
        click,
        fill,
        key,
        newPeer,
        setInputFiles,
        errors,
        shot,
        caseDone,
      } = driver,
      ui = uiAssertions(driver);
    const checkErrors = async () => assert.deepEqual(await errors(), []);
    const gear = 'button[aria-label="Настройки"]',
      closeButton = 'button[aria-label="Закрыть настройки"]',
      width = 'input[aria-label="Ширина (%)"]',
      space = 'input[aria-label="Расстояние (px)"]';
    const open = async (target) => {
      const t = uiAssertions(target);
      await t.disabled(gear, false);
      await t.focus(gear);
      await target.key('Enter');
      await t.disabled('#bookmark-folder', false);
    };
    const close = async (target) => {
      await target.click(closeButton);
      await uiAssertions(target).count('.settings', 0);
    };
    const stored = (target, key) =>
      target.evaluate(
        async (key) =>
          (await (globalThis.browser ?? chrome).storage.local.get('settings')).settings?.value[key],
        key,
      );
    const blur = (target, selector) => uiAssertions(target).node(selector, (e) => e.blur());
    await releaseApp();
    const fixture = await evaluate(createFixture);
    await open(driver);
    await fill(width, '75');
    await close(driver);
    assert.equal(await stored(driver, 'width'), 75);
    await open(driver);
    await ui.value(width, '75');
    await checkErrors();
    caseDone('native-close-flush');
    assert.equal(
      await evaluate(
        () =>
          [...document.querySelectorAll('.settings button')].filter(
            (e) => e.textContent.trim() === 'Сохранить',
          ).length,
      ),
      0,
    );
    await fill(width, '80');
    await poll(() => stored(driver, 'width')).toBe(80);
    await ui.focused(width);
    await fill(width, '');
    await ui.attribute(width, 'aria-invalid', 'true');
    assert.equal(await stored(driver, 'width'), 80);
    await fill(width, '85');
    await close(driver);
    assert.equal(await stored(driver, 'width'), 85);
    await checkErrors();
    caseDone('numeric-autosave');
    const peer = await newPeer();
    await peer.releaseApp();
    await open(peer);
    await open(driver);
    const p = uiAssertions(peer);
    await Promise.all([
      fill(width, '70'),
      peer.fill(space, '12'),
      p.select('.search select', 'google'),
    ]);
    await ui.value(width, '70');
    await p.value(space, '12');
    await p.value('.search select', 'google');
    await blur(driver, width);
    await blur(peer, space);
    await poll(() => stored(driver, 'width')).toBe(70);
    await poll(() => stored(driver, 'space')).toBe(12);
    await poll(() => stored(driver, 'searchProvider')).toBe('google');
    await ui.value(space, '12');
    await close(peer);
    await peer.evaluate(() =>
      (globalThis.browser ?? chrome).runtime.sendMessage({
        type: 'settings-sync',
        action: 'flush',
      }),
    );
    await checkErrors();
    await peer.poll(() => peer.evaluate(() => window.pendingRuntimeMessages)).toBe(0);
    await peer.close();
    await checkErrors();
    caseDone('concurrent-tabs');
    await evaluate(failSettingsWrite);
    await fill(width, '75');
    await blur(driver, width);
    await ui.containsText('.settings [role=alert]', 'Ширина');
    await close(driver);
    await ui.containsText('[role=alert]', 'settings write failed');
    assert.equal(await stored(driver, 'width'), 70);
    await evaluate(() => window.restoreSet());
    await open(driver);
    await fill(width, '90');
    await blur(driver, width);
    await poll(() => stored(driver, 'width')).toBe(90);
    await checkErrors();
    caseDone('rollback-and-retry');
    const directory = resolve('.browser-test', `autosave-files-${browser}-${crypto.randomUUID()}`);
    await mkdir(directory, { recursive: true });
    const imagePath = resolve(directory, 'background.png');
    await writeFile(imagePath, await readFile('public/images/icon128.png'));
    await setInputFiles('input[aria-label="Изменить фон"]', imagePath);
    await ui.visible('button[aria-label="Удалить фон"]');
    await close(driver);
    await poll(() => ui.node('.page-background', (e) => e.style.backgroundImage)).toContain(
      'blob:',
    );
    const background = await ui.node('.page-background', (e) => e.style.backgroundImage);
    await evaluate(() => {
      window.mutations = [];
    });
    for (const name of ['Folder B', 'Folder A', 'Folder B', 'Folder A']) {
      const tab = await ui.byText('button.folder-tab', name);
      await click(tab);
      await ui.attribute(tab, 'aria-pressed', 'true');
      assert.equal(await ui.node('.page-background', (e) => e.style.backgroundImage), background);
    }
    await evaluate(delayFolderRead, fixture.a);
    await click(await ui.byText('button.folder-tab', 'Folder A'));
    await poll(() => evaluate(() => window.delayedRead)).toBe(true);
    await click(await ui.byText('button.folder-tab', 'Folder B'));
    await ui.attribute(await ui.byText('button.folder-tab', 'Folder B'), 'aria-pressed', 'true');
    await ui.attribute('.bookmark', 'href', 'https://b.example/');
    await evaluate(() => window.restoreChildren());
    await open(driver);
    for (const id of [fixture.other, fixture.root, fixture.other, fixture.root]) {
      await ui.select('#bookmark-folder', id);
      await poll(() =>
        evaluate(
          async () =>
            (await (globalThis.browser ?? chrome).storage.local.get('rootFolderId')).rootFolderId,
        ),
      ).toBe(id);
    }
    await evaluate(rapidSourceChanges, fixture);
    await ui.value('#bookmark-folder', fixture.root);
    await poll(() =>
      evaluate(
        async () =>
          (await (globalThis.browser ?? chrome).storage.local.get('rootFolderId')).rootFolderId,
      ),
    ).toBe(fixture.root);
    assert.equal(await ui.node('.page-background', (e) => e.style.backgroundImage), background);
    assert.deepEqual(await evaluate(() => window.mutations), []);
    await checkErrors();
    caseDone('background-and-source-stability');
    await ui.visible(browser === 'chrome' ? '[data-icon=circle-x]' : '[data-icon=circle-help]');
    await ui.text(
      '.sync-email',
      browser === 'firefox' ? 'Проверьте настройки Firefox' : 'Аккаунт недоступен',
    );
    await shot('native-background-stable');
    await checkErrors();
    caseDone('native-account-capability');
    for (const mode of ['signed-out', 'signed-in', 'error']) {
      // Firefox must remain neutral and never call this unsupported API, even if a
      // profile-info-shaped test double exists. Chrome consumes the same fixtures.
      await evaluate(
        ({ mode, firefox }) => {
          const api = globalThis.browser ?? chrome;
          window.profileInfoCalls = 0;
          api.permissions.contains = async () => true;
          api.identity ??= {};
          api.identity.getProfileUserInfo = async () => {
            window.profileInfoCalls++;
            if (firefox) throw Error('Firefox account API must not be called');
            if (mode === 'error') throw Error('denied');
            return mode === 'signed-in'
              ? { id: 'test-only', email: 'private@example.invalid' }
              : { id: '', email: '' };
          };
        },
        { mode, firefox: browser === 'firefox' },
      );
      await close(driver);
      await open(driver);
      const icon =
        browser === 'firefox' || mode === 'error'
          ? 'circle-help'
          : mode === 'signed-in'
            ? 'circle-check'
            : 'circle-x';
      await ui.visible(`[data-icon=${icon}]`);
      if (browser === 'firefox') {
        await ui.text('.sync-email', 'Проверьте настройки Firefox');
        assert.equal(await evaluate(() => window.profileInfoCalls), 0);
      } else {
        assert((await evaluate(() => window.profileInfoCalls)) > 0);
        if (mode === 'signed-in') await ui.text('.sync-email', 'private@example.invalid');
        if (mode === 'error') await ui.text('.sync-email', 'Аккаунт недоступен');
      }
      if (mode === 'signed-out') {
        await ui.hover('button[aria-label="О синхронизации"]');
        await ui.visible('#sync-info');
        await ui.containsText(
          '#sync-info',
          browser === 'firefox' ? '«Дополнения» и «Закладки»' : '«Расширения» и «Закладки»',
        );
        await ui.hover(await ui.byText('.settings :is(h1,h2,h3)', 'Настройки'));
        await ui.hidden('#sync-info');
      }
      await checkErrors();
      caseDone('account-' + mode);
    }
    for (const size of [360, 1280, 1920]) {
      await resize(size, 900);
      assert.equal(await ui.node('.settings', (e) => e.scrollWidth <= e.clientWidth), true);
      await shot('settings-' + size, { selector: '.settings' });
      await checkErrors();
      caseDone('layout-' + size);
    }
    await click('button[aria-label="Удалить фон"]');
    await poll(() => ui.node('.page-background', (e) => e.style.backgroundImage)).toBe('');
    await close(driver);
    await evaluate(() =>
      (globalThis.browser ?? chrome).runtime.sendMessage({
        type: 'settings-sync',
        action: 'flush',
      }),
    );
    await poll(() => evaluate(() => window.pendingRuntimeMessages)).toBe(0);
    await reload();
    await releaseApp();
    await open(driver);
    await ui.value(width, '90');
    assert.deepEqual(await errors(), []);
    await checkErrors();
    caseDone('reload-persistence');
    const preferences = await evaluate(
      async () =>
        (await (globalThis.browser ?? chrome).storage.local.get('settings')).settings.value,
    );
    await fill(width, '88');
    await click(await ui.byText('.settings button', 'Управление данными'));
    const backupPath = resolve(directory, 'backup.json');
    await writeFile(
      backupPath,
      JSON.stringify({
        version: 3,
        entries: [],
        settings: { ...preferences, width: 67, space: 9 },
        background: null,
      }),
    );
    await setInputFiles('.data-management input[type=file]', backupPath);
    await click(await ui.byText('.data-management button', 'Импортировать'));
    await poll(() => stored(driver, 'width')).toBe(67);
    // Storage is updated before the operation finishes refreshing the screen.
    await ui.focused(await ui.byText('.data-management button', 'Готово'));
    await ui.count('.data-result[data-warning]', 0);
    await key('Escape');
    await ui.count('.data-management', 0);
    await checkErrors();
    caseDone('pending-edit-import');
    await open(driver);
    await fill(width, '89');
    await click(await ui.byText('.settings button', 'Управление данными'));
    await click('button[aria-label="Сбросить настройки и кэш"]');
    await click(await ui.byText('.data-management button', 'Сбросить'));
    await poll(() => stored(driver, 'width')).toBe(100);
    assert.equal(await stored(driver, 'space'), 24);
    assert.equal(
      await evaluate(
        async () =>
          (await (globalThis.browser ?? chrome).storage.local.get('rootFolderId')).rootFolderId,
      ),
      fixture.root,
    );
    await ui.focused(await ui.byText('.data-management button', 'Готово'));
    await ui.count('.data-result[data-warning]', 0);
    await key('Escape');
    await ui.count('.data-management', 0);
    await ui.count('.settings', 0);
    assert.deepEqual(await evaluate(() => window.mutations), []);
    assert.deepEqual(await errors(), []);
    await checkErrors();
    caseDone('pending-edit-reset');
    console.log(
      'PASS ' +
        browser +
        ' autosave: numeric/close flush, concurrent tabs/provider patch, rollback, native files, stable backgrounds/sources, platform account capability, layouts, reload and pending import/reset',
    );
  },
  {
    launchOptions: async (browser) => ({
      extension: await instrumentedFixture(browser, 'autosave', autosavePrelude),
      gated: true,
    }),
  },
);
