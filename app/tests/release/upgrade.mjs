// Release check against a genuinely built pre-refactor extension, outside the fast CI suite.
// node app/tests/release/upgrade.mjs --baseline-dir=.browser-test/upgrade-baseline/source/.output
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { openExtension, selectedBrowsers } from '../browser/helpers/extension-driver.mjs';
import { uiAssertions } from '../browser/helpers/ui-assertions.mjs';
const baselineArg = process.argv.find((arg) => arg.startsWith('--baseline-dir='));
assert.ok(baselineArg, 'Supply --baseline-dir=<directory containing chrome-mv3 and firefox-mv2>');
assert.ok(
  process.argv
    .slice(2)
    .every((arg) => arg === baselineArg || ['--chrome-only', '--firefox-only'].includes(arg)),
  'Unknown argument',
);
const baseline = resolve(baselineArg.slice('--baseline-dir='.length));
const directory = resolve('.browser-test', 'upgrade-' + crypto.randomUUID());
await mkdir(directory, { recursive: true });
const image = await readFile('public/images/icon128.png'),
  favicon = await readFile('public/images/icon16.png');
const settings = {
  language: 'es',
  mailruEnabled: false,
  gmailEnabled: false,
  yandexMailEnabled: false,
  weatherEnabled: true,
  weatherCity: 'moscow',
  weatherProvider: 'yandex',
  theme: 'dark',
  width: 73,
  countColumns: 5,
  space: 17,
  verticalCenter: true,
  addButton: true,
  bookmarkSearch: true,
  movieSearch: true,
  searchProvider: 'bookmarks',
};
const labels = {
  ru: JSON.parse(await readFile('locales/ru.json', 'utf8')),
  es: JSON.parse(await readFile('locales/es.json', 'utf8')),
};
// Read the actual native download, including its filename and bytes.
async function exported(d, language) {
  const ui = uiAssertions(d),
    text = labels[language];
  await ui.focus('.settings-trigger');
  await d.key('Enter');
  await ui.disabled('#bookmark-folder', false);
  await d.click('.settings-bottom button');
  await ui.visible('.data-management');
  await d.click('.data-management button[aria-label="' + text['backup.export.title'] + '"]');
  await ui.visible('.export-summary');
  const action = await ui.byText('.data-management button', text['backup.export.action']);
  const file = await d.download(() => d.click(action));
  assert.match(file.filename, /^speed-dial-backup-.*[.]json$/);
  const json = JSON.parse(file.bytes.toString());
  assert.equal(json.version, 3);
  await d.click(await ui.byText('.data-management button', text['common.done']));
  await ui.count('.data-management', 0);
  return json;
}
async function snapshot(d) {
  return d.evaluate(async () => {
    const api = globalThis.browser ?? globalThis.chrome,
      stored = await api.storage.local.get([
        'settings',
        'rootFolderId',
        'settingsSyncSelectedSource.v1',
      ]),
      sync = await api.storage.sync.get(null);
    const normalize = (node) =>
      Object.fromEntries(
        ['id', 'parentId', 'index', 'title', 'url', 'type', 'folderType', 'syncing', 'children']
          .filter((key) => node[key] !== undefined)
          .map((key) => [key, key === 'children' ? node.children.map(normalize) : node[key]]),
      );
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('SpeedDialX');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const rows = {};
    for (const name of ['assets', 'tileAssets', 'autoNames'])
      rows[name] = await new Promise((resolve, reject) => {
        const r = db.transaction(name).objectStore(name).getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    const version = db.version;
    const stores = [...db.objectStoreNames].sort();
    db.close();
    const serialize = async (value) => {
      if (value instanceof Blob)
        return {
          type: value.type,
          size: value.size,
          sha256: [
            ...new Uint8Array(await crypto.subtle.digest('SHA-256', await value.arrayBuffer())),
          ]
            .map((n) => n.toString(16).padStart(2, '0'))
            .join(''),
        };
      if (Array.isArray(value)) return Promise.all(value.map(serialize));
      if (value && typeof value === 'object')
        return Object.fromEntries(
          await Promise.all(
            Object.entries(value).map(async ([key, v]) => [key, await serialize(v)]),
          ),
        );
      return value;
    };
    return {
      id: api.runtime.id,
      settings: stored.settings?.value,
      rootId: stored.rootFolderId,
      selectedSource: stored['settingsSyncSelectedSource.v1'],
      sync,
      tree: (await api.bookmarks.getTree()).map(normalize),
      database: { version, stores, rows: await serialize(rows) },
    };
  });
}
async function stageExtension(source, destination, { upgrade = false } = {}) {
  await cp(source, destination, { recursive: true });
  const p = resolve(destination, 'manifest.json'),
    manifest = JSON.parse(await readFile(p, 'utf8'));
  if (upgrade) {
    const parts = manifest.version.split('.').map(Number);
    parts[parts.length - 1]++;
    manifest.version = parts.join('.');
    await writeFile(p, JSON.stringify(manifest));
    const background = resolve(
      destination,
      manifest.background.service_worker ?? manifest.background.scripts[0],
    );
    const original = await readFile(background, 'utf8');
    await writeFile(
      background,
      `;(function(){const api=globalThis.browser??chrome;api.runtime.onInstalled.addListener(({reason,previousVersion})=>api.storage.local.set({releaseUpgradeEvent:{reason,previousVersion}}));})();\n` +
        original,
    );
  }
  return manifest;
}
const results = [];
for (const browser of selectedBrowsers()) {
  const name = browser === 'chrome' ? 'chrome-mv3' : 'firefox-mv2',
    profile = resolve(directory, browser + '-profile'),
    extension = resolve(directory, browser + '-extension');
  const oldManifest = await stageExtension(resolve(baseline, name), extension);
  let d;
  try {
    d = await openExtension(browser, {
      profile,
      extension,
      extensionDebugging: browser === 'chrome',
    });
    const clean = await snapshot(d);
    if (browser === 'firefox')
      assert.equal(clean.id, oldManifest.browser_specific_settings.gecko.id);
    // Dexie logical schema v3 uses native IndexedDB version 30.
    assert.equal(clean.database.version, 30);
    const flatten = (node) => [node, ...(node.children ?? []).flatMap(flatten)];
    const initialNodes = clean.tree.flatMap(flatten);
    assert.equal(
      initialNodes.some((node) => node.title === 'Speed Dial'),
      false,
    );
    assert.equal(initialNodes.find((node) => node.id === clean.rootId)?.parentId, clean.tree[0].id);
    const fixture = await d.evaluate(
      async ({ settings, image, favicon, firefox }) => {
        const api = globalThis.browser ?? globalThis.chrome,
          { rootFolderId } = await api.storage.local.get('rootFolderId'),
          root = await api.bookmarks.create({
            parentId: rootFolderId,
            title: 'Upgrade source <b>Сохранить</b>',
          });
        const first = await api.bookmarks.create({
            parentId: root.id,
            title: 'Custom <b>Русский</b>',
            url: 'https://first.example/',
          }),
          folder = await api.bookmarks.create({ parentId: root.id, title: 'Папка ñ' }),
          child = await api.bookmarks.create({
            parentId: folder.id,
            title: 'Child',
            url: 'https://child.example/',
          }),
          deep = await api.bookmarks.create({ parentId: folder.id, title: 'Hidden nested folder' });
        await api.bookmarks.create({
          parentId: deep.id,
          title: 'Deep bookmark',
          url: 'https://deep.example/',
        });
        if (firefox) await api.bookmarks.create({ parentId: root.id, type: 'separator' });
        const auto = await api.bookmarks.create({
          parentId: root.id,
          title: 'auto.example',
          url: 'https://auto.example/',
        });
        await api.bookmarks.move(auto.id, { index: 0 });
        await api.storage.local.set({ rootFolderId: root.id, settings: { value: settings } });
        await api.storage.sync.set(
          Object.fromEntries(
            Object.entries(settings).map(([key, value]) => ['settings.v1.' + key, value]),
          ),
        );
        const png = new Blob([Uint8Array.from(image)], { type: 'image/png' }),
          ico = new Blob([Uint8Array.from(favicon)], { type: 'image/png' });
        const db = await new Promise((resolve, reject) => {
          const r = indexedDB.open('SpeedDialX');
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        await new Promise((resolve, reject) => {
          const tx = db.transaction(['assets', 'tileAssets', 'autoNames'], 'readwrite');
          tx.objectStore('assets').put({ key: 'background', blob: png });
          for (const item of [first, child, auto])
            tx.objectStore('tileAssets').put({
              bookmarkId: item.id,
              url: item.url,
              thumbnail: png,
              favicon: ico,
              faviconColor: '#345678',
              thumbnailUpdatedAt: 1234567890,
              faviconUpdatedAt: 1234567891,
            });
          tx.objectStore('autoNames').put({
            bookmarkId: auto.id,
            url: auto.url,
            token: 'legacy-ticket',
            pendingEdit: { url: true, title: false },
          });
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        db.close();
        await api.runtime.sendMessage({ type: 'settings-sync', action: 'retry' });
        return { root: root.id, first: first.id, auto: auto.id, folder: folder.id };
      },
      { settings, image: [...image], favicon: [...favicon], firefox: browser === 'firefox' },
    );
    let ui = uiAssertions(d);
    await d.poll(() => d.evaluate(() => document.documentElement.lang)).toBe('es');
    await ui.focus('.settings-trigger');
    await d.key('Enter');
    await ui.disabled('#bookmark-folder', false);
    for (const id of [clean.rootId, fixture.root]) {
      await ui.select('#bookmark-folder', id);
      await d
        .poll(() =>
          d.evaluate(
            async () =>
              (await (globalThis.browser ?? globalThis.chrome).storage.local.get('rootFolderId'))
                .rootFolderId,
          ),
        )
        .toBe(id);
    }
    await d.click('button[aria-label="' + labels.es['settings.close'] + '"]');
    await ui.count('.settings', 0);
    await d.evaluate(() =>
      (globalThis.browser ?? globalThis.chrome).runtime.sendMessage({
        type: 'settings-sync',
        action: 'retry',
      }),
    );
    await d.reload();
    await d.poll(() => d.evaluate(() => document.documentElement.lang)).toBe('es');
    await ui.text('.folder-root', 'Upgrade source <b>Сохранить</b>');
    await ui.count('.bookmark', 2);
    await d.poll(() => d.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
    await d
      .poll(() => ui.node('.page-background', (e) => e.style.backgroundImage))
      .toContain('blob:');
    const before = await snapshot(d);
    assert.deepEqual(before.settings, settings);
    assert.equal(before.rootId, fixture.root);
    assert.equal(before.sync['selectedFolder.v1'].version, 1);
    assert.deepEqual(before.sync['selectedFolder.v1'].path, ['Upgrade source <b>Сохранить</b>']);
    if (browser === 'firefox') assert.equal(before.sync['selectedFolder.v1'].guid, fixture.root);
    console.log(browser + ': legacy data seeded');
    const oldBackup = await exported(d, 'es');
    console.log(browser + ': native legacy download complete');
    assert.equal(oldBackup.settings.language, 'es');
    assert.equal(oldBackup.entries.length, 3);
    assert(oldBackup.background?.startsWith('data:image/png;base64,'));
    assert(oldBackup.entries.some((e) => e.autoName === true));
    await writeFile(resolve(directory, browser + '-old-backup.json'), JSON.stringify(oldBackup));
    const upgraded = resolve(directory, browser + '-new');
    const newManifest = await stageExtension(resolve('.output', name), upgraded, { upgrade: true });
    assert.notEqual(newManifest.version, oldManifest.version);
    if (browser === 'chrome') {
      await cp(upgraded, extension, { recursive: true });
      await d.reloadChromeExtension();
    } else await d.installFirefoxExtension(upgraded);
    await d
      .poll(() =>
        d.evaluate(
          async () =>
            (
              await (globalThis.browser ?? globalThis.chrome).storage.local.get(
                'releaseUpgradeEvent',
              )
            ).releaseUpgradeEvent,
        ),
      )
      .toEqual({ reason: 'update', previousVersion: oldManifest.version });
    assert.equal(
      await d.evaluate(
        () => (globalThis.browser ?? globalThis.chrome).runtime.getManifest().version,
      ),
      newManifest.version,
    );
    console.log(browser + ': native update event confirmed');
    const after = await snapshot(d);
    assert.deepEqual(
      after,
      before,
      'Native IDs/order, selected folder, all settings/sync fields and IndexedDB bytes must survive an actual version update',
    );
    ui = uiAssertions(d);
    await ui.text('.folder-root', 'Upgrade source <b>Сохранить</b>');
    await ui.count('.bookmark', 2);
    assert.equal(await d.evaluate(() => document.documentElement.lang), 'es');
    await d.poll(() => d.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
    await d
      .poll(() => ui.node('.page-background', (e) => e.style.backgroundImage))
      .toContain('blob:');
    assert.deepEqual(
      await exported(d, 'es'),
      oldBackup,
      'Old and new exporters must produce the same complete v3 backup',
    );
    console.log(browser + ': upgraded data and backup match');
    await d.screenshot(resolve(directory, browser + '-upgraded.png'));
    assert.deepEqual(await d.errors(), []);
    await d.close();
    d = undefined;
    d = await openExtension(browser, {
      profile,
      extension: browser === 'chrome' ? extension : upgraded,
    });
    assert.deepEqual(await snapshot(d), before, 'A second restart must preserve upgraded data');
    assert.deepEqual(await exported(d, 'es'), oldBackup);
    await d.close();
    d = undefined;
    const fresh = await openExtension(browser);
    try {
      const u = uiAssertions(fresh);
      await u.focus('.settings-trigger');
      await fresh.key('Enter');
      await u.disabled('#bookmark-folder', false);
      await fresh.click('.settings-bottom button');
      await u.visible('.data-management');
      await fresh.setInputFiles(
        '.data-management input[type=file]',
        resolve(directory, browser + '-old-backup.json'),
      );
      await u.visible('.import-summary');
      await fresh.click(
        await u.byText('.data-management button', labels.ru['backup.import.action']),
      );
      await u.visible('.data-result');
      await fresh.poll(() => fresh.evaluate(() => document.documentElement.lang)).toBe('es');
      await fresh.click(await u.byText('.data-management button', labels.es['common.done']));
      await u.count('.data-management', 0);
      assert.deepEqual(
        await exported(fresh, 'es'),
        oldBackup,
        'A clean install must import the legacy backup without losing images/settings/names',
      );
      assert.deepEqual(await fresh.errors(), []);
    } finally {
      await fresh.close();
    }
    results.push({
      browser,
      status: 'passed',
      oldVersion: oldManifest.version,
      newVersion: newManifest.version,
      cases: [
        'clean-legacy-install',
        'actual-update-event',
        'bookmark-identity-and-order',
        'settings-and-sync',
        'indexeddb-schema-and-blob-hashes',
        'legacy-name-ticket',
        'ui-language-theme-background',
        'backup-v3-equivalence',
        'second-restart',
        'legacy-backup-in-clean-install',
      ],
    });
    console.log(
      'PASS ' +
        browser +
        ' native version update, unchanged data/schema/blob hashes, stable IDs/order, legacy backup and clean restore',
    );
  } finally {
    await d?.close();
  }
}
await writeFile(resolve(directory, 'results.json'), JSON.stringify(results, null, 2));
console.log(
  'Release upgrade results:',
  relative(process.cwd(), resolve(directory, 'results.json')),
);
