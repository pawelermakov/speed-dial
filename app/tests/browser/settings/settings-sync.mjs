import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { cp, readFile } from 'node:fs/promises';
import { createHash, createPublicKey } from 'node:crypto';
import {
  runSharedScenario,
  openExtension,
  instrumentedFixture,
} from '../helpers/extension-driver.mjs';
import { uiAssertions } from '../helpers/ui-assertions.mjs';

const prelude = () => {
  window.bookmarkWrites = [];
  window.pendingRuntimeMessages = 0;
  const api = globalThis.browser ?? chrome,
    send = api.runtime.sendMessage.bind(api.runtime);
  api.runtime.sendMessage = (...args) => {
    window.pendingRuntimeMessages++;
    return send(...args).finally(() => window.pendingRuntimeMessages--);
  };
  for (const key of ['create', 'update', 'move', 'remove', 'removeTree']) {
    const original = api.bookmarks[key];
    api.bookmarks[key] = (...args) => {
      window.bookmarkWrites.push(key);
      return original.apply(api.bookmarks, args);
    };
  }
};
await runSharedScenario(
  'settings-sync',
  async (browser, a) => {
    const ui = uiAssertions(a),
      width = 'input[aria-label="Ширина (%)"]',
      space = 'input[aria-label="Расстояние (px)"]';
    const open = async (d) => {
      const u = uiAssertions(d);
      await u.disabled('.settings-trigger', false);
      await u.focus('.settings-trigger');
      await d.key('Enter');
      await u.disabled('#bookmark-folder', false);
    };
    const close = async (d) => {
      await d.click('button[aria-label="Закрыть настройки"]');
      await uiAssertions(d).count('.settings', 0);
      await d.poll(() => d.evaluate(() => window.pendingRuntimeMessages)).toBe(0);
    };
    const cloud = (d) => d.evaluate(() => (globalThis.browser ?? chrome).storage.sync.get(null));
    // This delivers controlled values through the real storage API; signed-in cloud transport is not simulated.
    const deliver = async (from, to) =>
      to.evaluate((v) => (globalThis.browser ?? chrome).storage.sync.set(v), await cloud(from));
    const local = (d, key) =>
      d.evaluate(
        async (key) => (await (globalThis.browser ?? chrome).storage.local.get(key))[key],
        key,
      );
    const manifest = JSON.parse(
      await readFile(
        resolve(`.output/${browser === 'chrome' ? 'chrome-mv3' : 'firefox-mv2'}/manifest.json`),
        'utf8',
      ),
    );
    const directory = await instrumentedFixture(browser, 'sync', prelude),
      copy = resolve(directory + '-independent');
    await cp(directory, copy, { recursive: true });
    let b = await openExtension(browser, { extension: copy, gated: true });
    try {
      await a.releaseApp();
      await b.releaseApp();
      const id = (d) => d.evaluate(() => (globalThis.browser ?? chrome).runtime.id);
      assert.equal(await id(a), await id(b));
      assert.notEqual(directory, copy);
      if (browser === 'chrome') {
        createPublicKey({ key: Buffer.from(manifest.key, 'base64'), format: 'der', type: 'spki' });
        const expected = [
          ...createHash('sha256')
            .update(Buffer.from(manifest.key, 'base64'))
            .digest()
            .subarray(0, 16),
        ]
          .map((v) => String.fromCharCode(97 + (v >> 4), 97 + (v & 15)))
          .join('');
        assert.equal(await id(a), expected);
      } else {
        assert.equal(manifest.key, undefined);
        assert.equal(await id(a), manifest.browser_specific_settings.gecko.id);
      }
      assert.deepEqual(await cloud(a), {});
      assert.deepEqual(await cloud(b), {});
      a.caseDone('native-identity-and-clean-profiles');
      await open(a);
      await a.fill(width, '80');
      await close(a);
      await a.poll(() => cloud(a)).toEqual({ 'settings.v1.width': 80 });
      await deliver(a, b);
      await open(b);
      await uiAssertions(b).value(width, '80');
      await b.fill(space, '12');
      await close(b);
      await b.poll(() => cloud(b)).toEqual({ 'settings.v1.width': 80, 'settings.v1.space': 12 });
      await deliver(b, a);
      await open(a);
      await ui.value(space, '12');
      await a.fill(space, '18');
      await a.evaluate(() =>
        (globalThis.browser ?? chrome).storage.sync.set({ 'settings.v1.space': 24 }),
      );
      await ui.value(space, '18');
      await ui.focused(space);
      await close(a);
      await a.poll(async () => (await cloud(a))['settings.v1.space']).toBe(18);
      a.caseDone('sparse-delivery-and-focused-edit');
      const peer = await a.newPeer();
      await peer.releaseApp();
      await open(peer);
      await a.evaluate(() =>
        (globalThis.browser ?? chrome).storage.sync.set({ 'settings.v1.width': 85 }),
      );
      await uiAssertions(peer).value(width, '85');
      await close(peer);
      await peer.close();
      a.caseDone('live-peer');
      await a.evaluateBackground((api) => {
        const original = api.storage.sync.set;
        api.storage.sync.restoreFixture = () => {
          api.storage.sync.set = original;
          delete api.storage.sync.restoreFixture;
        };
        api.storage.sync.set = async () => {
          throw Error('QUOTA_BYTES private-fixture');
        };
      });
      await open(a);
      await a.fill(width, '90');
      await close(a);
      await open(a);
      await ui.containsText('.sync-notice', 'локально');
      assert.equal((await local(a, 'settings')).value.width, 90);
      const retry = await ui.byText('.sync-action', 'Повторить');
      await ui.disabled(retry, false);
      await a.evaluateBackground((api) => api.storage.sync.restoreFixture());
      await a.click(retry);
      await a.poll(async () => (await cloud(a))['settings.v1.width']).toBe(90);
      await ui.count('.sync-notice [role=alert],.sync-notice[role=alert]', 0);
      await close(a);
      a.caseDone('native-failure-and-retry');
      // Restart the same isolated profile, preserving native storage and add-on identity.
      const profile = b.profile,
        previousId = await id(b);
      await b.close();
      b = undefined;
      b = await openExtension(browser, { extension: copy, gated: true, profile });
      await b.releaseApp();
      assert.equal(await id(b), previousId);
      await open(b);
      const bu = uiAssertions(b);
      await bu.value(width, '80');
      await bu.value(space, '12');
      await b.click(await bu.byText('.sync-action', 'Перенести локальные'));
      await b
        .poll(async () => {
          const values = (await local(b, 'settings')).value,
            remote = await cloud(b);
          return Object.entries(values).every(
            ([key, value]) => remote['settings.v1.' + key] === value,
          );
        })
        .toBe(true);
      await close(b);
      a.caseDone('restart-and-local-confirmation');
      const selected = await a.evaluate(async () => {
        const api = globalThis.browser ?? chrome,
          { rootFolderId } = await api.storage.local.get('rootFolderId');
        return api.bookmarks.create({ parentId: rootFolderId, title: 'Portable test folder' });
      });
      await open(a);
      await a
        .poll(() =>
          ui.node(
            '#bookmark-folder',
            (e, id) => [...e.options].some((o) => o.value === id),
            selected.id,
          ),
        )
        .toBe(true);
      await ui.select('#bookmark-folder', selected.id);
      await close(a);
      await a.poll(async () => (await cloud(a))['selectedFolder.v1']).toBeTruthy();
      let locator = (await cloud(a))['selectedFolder.v1'];
      assert.equal(locator.version, 1);
      assert.deepEqual(locator.path, ['Portable test folder']);
      assert.equal('id' in locator, false);
      if (browser === 'firefox') {
        assert.equal(locator.guid, selected.id);
        await b.evaluate(async () => {
          const api = globalThis.browser ?? chrome,
            { rootFolderId } = await api.storage.local.get('rootFolderId');
          await api.bookmarks.create({ parentId: rootFolderId, title: 'Portable test folder' });
        });
        await deliver(a, b);
        await b
          .poll(async () => (await local(b, 'settingsSyncState'))?.folder)
          .toEqual({ key: 'sync.folder.waiting_for_browser', params: { browser_name: 'Firefox' } });
        assert.notEqual(await local(b, 'rootFolderId'), selected.id);
        await b.deliverNativeFolder({ guid: selected.id, title: 'Portable test folder' });
        await b.poll(() => local(b, 'rootFolderId')).toBe(selected.id);
      } else {
        const target = await b.evaluate(async () => {
          const api = globalThis.browser ?? chrome,
            { rootFolderId } = await api.storage.local.get('rootFolderId');
          return api.bookmarks.create({ parentId: rootFolderId, title: 'Portable test folder' });
        });
        const previous = await local(b, 'rootFolderId');
        await deliver(a, b);
        await b
          .poll(async () => (await local(b, 'settingsSyncState'))?.folder)
          .toEqual({ key: 'sync.folder.local_not_portable', params: {} });
        assert.equal(await local(b, 'rootFolderId'), previous);
        assert.notEqual(previous, target.id);
      }
      a.caseDone('portable-folder-delivery');
      await a.evaluateBackground(
        (api, id) => api.bookmarks.update(id, { title: 'Renamed portable folder' }),
        selected.id,
      );
      await a
        .poll(async () => (await cloud(a))['selectedFolder.v1'].path)
        .toEqual(['Renamed portable folder']);
      locator = (await cloud(a))['selectedFolder.v1'];
      if (browser === 'firefox') {
        await deliver(a, b);
        assert.equal(await local(b, 'rootFolderId'), selected.id);
      }
      await a.evaluateBackground((api, id) => api.bookmarks.removeTree(id), selected.id);
      await a.poll(() => local(a, 'rootFolderId')).not.toBe(selected.id);
      assert.deepEqual((await cloud(a))['selectedFolder.v1'], locator);
      assert.deepEqual(await a.evaluate(() => window.bookmarkWrites), ['create']);
      a.caseDone('rename-delete-without-implicit-writes');
      await a.evaluate(() => {
        const api = globalThis.browser ?? chrome;
        api.permissions.contains = async () => true;
        api.identity ??= {};
        api.identity.getProfileUserInfo = async () => ({
          id: 'fixture-only',
          email: 'a-very-long-test-account-address@example.invalid',
        });
      });
      await open(a);
      await ui.text(
        '.sync-account [role=status]',
        browser === 'chrome' ? 'Включена' : 'Статус недоступен',
      );
      if (browser === 'chrome') {
        await ui.attribute(
          '.sync-email',
          'title',
          'a-very-long-test-account-address@example.invalid',
        );
        await ui.css('.sync-email', 'font-weight', '400');
      } else {
        await ui.text('.sync-email', 'Проверьте настройки Firefox');
        assert.equal(
          await ui.node('.sync-account [role=status]', (e) => getComputedStyle(e).color),
          await ui.node('.settings', (e) => getComputedStyle(e).color),
        );
      }
      for (const size of [360, 1280]) {
        await a.resize(size, 900);
        assert.equal(await ui.node('.settings', (e) => e.scrollWidth <= e.clientWidth), true);
        await ui.hover('button[aria-label="О синхронизации"]');
        await ui.visible('#sync-info');
        await ui.css('#sync-info', 'opacity', '1');
        assert.equal(
          await ui.node('#sync-info', (e) => {
            const r = e.getBoundingClientRect();
            return (
              r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1
            );
          }),
          true,
        );
        await a.shot('tooltip-' + size, { selector: '.settings' });
        await ui.hover(await ui.byText('.settings :is(h1,h2,h3)', 'Настройки'));
        await ui.hidden('#sync-info');
        await a.shot('panel-' + size, { selector: '.settings' });
        a.caseDone('layout-' + size);
      }
      await ui.focus('button[aria-label="О синхронизации"]');
      await ui.visible('#sync-info');
      await a.key('Tab');
      await ui.hidden('#sync-info');
      assert(
        !JSON.stringify(
          await a.evaluate(() => (globalThis.browser ?? chrome).storage.local.get(null)),
        ).includes('a-very-long-test-account-address'),
      );
      const serialized = JSON.stringify(await cloud(a));
      for (const privateValue of ['fixture-only', 'example.invalid', 'private-fixture'])
        assert(!serialized.includes(privateValue));
      a.caseDone('memory-only-identity');
      assert.deepEqual(await a.errors(), []);
      assert.deepEqual(await b.errors(), []);
      console.log(
        'PASS ' +
          browser +
          ' sync: complete shared storage, identity, restart, portable-folder, failure/retry and account layout checks',
      );
    } finally {
      await b?.close();
    }
  },
  {
    launchOptions: async (browser) => ({
      extension: await instrumentedFixture(browser, 'sync', prelude),
      gated: true,
    }),
  },
);
