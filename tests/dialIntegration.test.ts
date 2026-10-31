import { formatMessage } from '../services/i18n';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialDatabase } from '../shared/infrastructure/database';
import { createDialFixture, type DialFixture } from './helpers/dialFixture';
import {
  backupLimits,
  selectExport,
  serializeExport,
} from '../modules/dial/modules/backup/adapters/json';
import { MockBookmarks } from './helpers/bookmarksMock';
import type { RootPort } from '../modules/dial/modules/bookmarks';
import type { SettingsEnvelope, SettingsPort } from '../modules/dial/modules/settings';
import { defaults } from '../modules/dial/modules/settings';
let settingsPort: SettingsPort, rootPort: RootPort;
let db: DialDatabase,
  api: MockBookmarks,
  fixture: DialFixture,
  stored: SettingsEnvelope | null,
  rootId: string | null;
beforeEach(() => {
  db = new DialDatabase('test-' + crypto.randomUUID());
  api = new MockBookmarks();
  stored = null;
  rootId = null;
  settingsPort = {
    getValue: async () => stored,
    setValue: async (value) => {
      stored = value;
    },
  };
  rootPort = {
    getValue: async () => rootId,
    setValue: async (id) => {
      rootId = id;
    },
  };
  fixture = createDialFixture(db, settingsPort, api, rootPort);
});
afterEach(async () => {
  await db.delete();
});
async function setup() {
  const node = await api.create({ parentId: 'other', title: 'Speed Dial' });
  await fixture.bookmarks.source.selectRoot(node.id);
}
const add = (url = 'https://example.com/') =>
  fixture.bookmarks.actions.add({ url, title: 'Свой заголовок' });
describe('browser bookmarks source', () => {
  it('ignores native Firefox separators with data URLs and preserves their slots when sorting', async () => {
    await setup();
    const root = fixture.bookmarks.source.rootId!;
    const a = await add('https://a.example/');
    const separator = await api.create({ parentId: root, title: '', url: 'data:' });
    api.nodes.get(separator.id)!.type = 'separator';
    const b = await add('https://b.example/');
    expect((await fixture.snapshots.load()).tabs.map((row) => row.id)).toEqual([a, b]);
    expect((await fixture.snapshots.load()).folders.map((row) => row.id)).toEqual([root]);
    expect(await fixture.bookmarks.source.search('data:')).toEqual([]);
    expect((await fixture.backup.exportData()).entries).toHaveLength(2);
    await expect(fixture.bookmarks.source.bookmark(separator.id)).rejects.toThrow(
      'Закладка недоступна',
    );
    await expect(fixture.bookmarks.source.parent(separator.id)).rejects.toThrow('Папка');
    await fixture.bookmarks.actions.reorder([b, a], [a, b], root);
    expect((await api.getChildren(root)).map((row) => row.id)).toEqual([b, separator.id, a]);
  });
  it('an older folder read cannot reset the latest requested folder', async () => {
    await setup();
    const a = await api.create({ parentId: fixture.bookmarks.source.rootId!, title: 'A' }),
      b = await api.create({ parentId: fixture.bookmarks.source.rootId!, title: 'B' });
    const original = api.getChildren.bind(api);
    let release!: (value: Awaited<ReturnType<typeof api.getChildren>>) => void;
    vi.spyOn(api, 'getChildren').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    fixture.bookmarks.source.selectFolder(a.id);
    const old = fixture.snapshots.load(false);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    fixture.bookmarks.source.selectFolder(b.id);
    release(await original(fixture.bookmarks.source.rootId!));
    await old;
    expect(fixture.bookmarks.source.activeId).toBe(b.id);
    expect((await fixture.snapshots.load(false)).activeId).toBe(b.id);
  });
  it('does not commit a fallback root when parallel snapshot reads fail', async () => {
    await setup();
    const selected = fixture.bookmarks.source.rootId!;
    await api.removeTree(selected);
    const write = vi.spyOn(rootPort, 'setValue');
    vi.spyOn(settingsPort, 'getValue').mockRejectedValueOnce(new Error('Settings read failed'));
    await expect(fixture.snapshots.load()).rejects.toThrow('Settings read failed');
    expect(write).not.toHaveBeenCalled();
    expect(fixture.bookmarks.source.rootId).toBe(selected);
    expect(rootId).toBe(selected);
    vi.spyOn(db.assets, 'get').mockRejectedValueOnce(new Error('Wallpaper read failed'));
    await expect(fixture.snapshots.load()).rejects.toThrow('Wallpaper read failed');
    expect(write).not.toHaveBeenCalled();
    expect(fixture.bookmarks.source.rootId).toBe(selected);
    expect(rootId).toBe(selected);
    expect((await fixture.snapshots.load()).rootId).toBe('other');
    expect(rootId).toBe('other');
  });
  it('patches only current keys and does not reload background for bookmark-only reads', async () => {
    await setup();
    await fixture.preferences.patchSettings({ width: 80 });
    const peer = createDialFixture(db, settingsPort, api, rootPort);
    await peer.preferences.patchSettings({ space: 12 });
    await fixture.preferences.patchSettings({ searchProvider: 'google' });
    expect(stored?.value).toMatchObject({ width: 80, space: 12, searchProvider: 'google' });
    const get = vi.spyOn(db.assets, 'get');
    await fixture.snapshots.load(false);
    expect(get).not.toHaveBeenCalled();
    await fixture.snapshots.load();
    expect(get).toHaveBeenCalledWith('background');
    await expect(fixture.preferences.patchSettings({ width: 999 })).rejects.toThrow();
    expect(stored?.value.width).toBe(80);
  });
  it('saves the search provider without overwriting current preferences or changing the bookmark source', async () => {
    await setup();
    const source = fixture.bookmarks.source.rootId;
    const bookmark = await add();
    await fixture.preferences.saveSettings({
      ...defaults,
      width: 75,
      bookmarkSearch: false,
      movieSearch: true,
    });
    await fixture.preferences.saveSearchProvider('imdb');
    expect((await fixture.snapshots.load()).settings).toEqual({
      ...defaults,
      width: 75,
      bookmarkSearch: false,
      movieSearch: true,
      searchProvider: 'imdb',
    });
    expect(fixture.bookmarks.source.rootId).toBe(source);
    expect((await fixture.snapshots.load()).tabs[0]?.id).toBe(bookmark);
  });
  it('enables bookmark search by default and persists an explicit opt-out', async () => {
    await setup();
    stored = { value: { ...defaults } };
    expect((await fixture.snapshots.load()).settings.bookmarkSearch).toBe(true);
    const write = vi.spyOn(settingsPort, 'setValue');
    await fixture.preferences.saveSettings(
      { ...defaults },
      undefined,
      fixture.bookmarks.source.rootId!,
    );
    expect(write).not.toHaveBeenCalled();
    await fixture.preferences.saveSettings({ ...defaults, bookmarkSearch: false });
    expect((await fixture.snapshots.load()).settings.bookmarkSearch).toBe(false);
    await fixture.backup.reset();
    expect((await fixture.snapshots.load()).settings.bookmarkSearch).toBe(true);
  });
  it('searches titles and URLs in root and direct folders without changing active folder or bookmarks', async () => {
    await setup();
    const root = fixture.bookmarks.source.rootId!;
    const direct = await api.create({
      parentId: root,
      title: 'MATCH root',
      url: 'https://root.example/',
    });
    const a = await api.create({ parentId: root, title: 'Work' }),
      b = await api.create({ parentId: root, title: 'Personal' });
    const first = await api.create({
      parentId: a.id,
      title: 'First',
      url: 'https://example.com/MATCH',
    });
    const second = await api.create({
      parentId: b.id,
      title: 'Match second',
      url: 'https://second.example/',
    });
    const deep = await api.create({ parentId: a.id, title: 'Hidden' });
    await api.create({ parentId: deep.id, title: 'Match hidden', url: 'https://hidden.example/' });
    fixture.bookmarks.source.activeId = b.id;
    const tree = await api.getTree();
    const results = await fixture.bookmarks.source.search('  mAtCh  ');
    expect(results.map((row) => [row.id, row.parentId])).toEqual([
      [direct.id, root],
      [first.id, a.id],
      [second.id, b.id],
    ]);
    expect(fixture.bookmarks.source.activeId).toBe(b.id);
    expect(await api.getTree()).toEqual(tree);
    expect(await fixture.bookmarks.source.search('  ')).toEqual([]);
    expect(await fixture.bookmarks.source.search('missing')).toEqual([]);
  });
  it('search rereads external edits and never reuses images for an updated URL', async () => {
    await setup();
    const id = await add('https://example.com/match');
    await fixture.bookmarks.actions.cache(
      id,
      'https://example.com/match',
      'thumbnail',
      new Blob(['image'], { type: 'image/png' }),
    );
    expect((await fixture.bookmarks.source.search('match'))[0]?.thumbnail).toBeTruthy();
    await api.update(id, { url: 'https://other.example/match', title: 'Changed' });
    expect((await fixture.bookmarks.source.search('match'))[0]).toMatchObject({
      title: 'Changed',
      url: 'https://other.example/match',
      thumbnail: null,
    });
    await api.remove(id);
    expect(await fixture.bookmarks.source.search('match')).toEqual([]);
  });
  it('search reuses current snapshot images while rereading titles and changed URLs', async () => {
    await setup();
    const id = await add('https://example.com/match');
    await fixture.bookmarks.actions.cache(
      id,
      'https://example.com/match',
      'thumbnail',
      new Blob(['image'], { type: 'image/png' }),
    );
    const snapshot = await fixture.snapshots.load(false);
    const reads = vi.spyOn(db.tileAssets, 'bulkGet');
    await api.update(id, { title: 'Updated match' });
    const result = await fixture.bookmarks.source.search('match', snapshot.tabs);
    expect(result[0]?.title).toBe('Updated match');
    expect(result[0]?.thumbnail).toBe(snapshot.tabs[0]?.thumbnail);
    expect(reads).not.toHaveBeenCalled();
    await api.update(id, { url: 'https://other.example/match' });
    expect(
      (await fixture.bookmarks.source.search('match', snapshot.tabs))[0]?.thumbnail,
    ).toBeNull();
    expect(reads).toHaveBeenCalledTimes(1);
  });
  it('propagates search read failures and handles a missing source', async () => {
    expect(await fixture.bookmarks.source.search('match')).toEqual([]);
    await setup();
    vi.spyOn(api, 'getSubTree').mockRejectedValueOnce(new Error('read failed'));
    await expect(fixture.bookmarks.source.search('match')).rejects.toThrow('read failed');
  });
  it('preserves a valid saved source across updates and renames', async () => {
    await setup();
    const id = fixture.bookmarks.source.rootId!;
    await add();
    await api.update(id, { title: 'Моя папка' });
    const write = vi.spyOn(rootPort, 'setValue');
    expect((await fixture.snapshots.initialize()).rootId).toBe(id);
    expect(write).not.toHaveBeenCalled();
  });
  it('never mutates bookmarks or unrelated preferences when changing source A→B→A', async () => {
    await setup();
    const a = fixture.bookmarks.source.rootId!;
    const id = await add();
    await fixture.bookmarks.actions.cache(
      id,
      'https://example.com/',
      'thumbnail',
      new Blob(['image'], { type: 'image/png' }),
    );
    const b = await api.create({ parentId: 'other', title: 'B' });
    const tree = await api.getTree();
    const mutations = ['create', 'update', 'move', 'remove', 'removeTree'].map((name) =>
      vi.spyOn(api, name as 'create'),
    );
    const preferences = vi.spyOn(settingsPort, 'setValue');
    for (const source of [b.id, a])
      await fixture.preferences.saveSettings({ ...defaults }, undefined, source);
    expect((await fixture.snapshots.load()).tabs[0]?.thumbnail).toBeTruthy();
    expect(await api.getTree()).toEqual(tree);
    mutations.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    expect(preferences).not.toHaveBeenCalled();
  });
  it('creates no folder during first initialization', async () => {
    const mutations = ['create', 'update', 'move', 'remove', 'removeTree'].map((name) =>
      vi.spyOn(api, name as 'create'),
    );
    expect((await fixture.snapshots.initialize()).rootId).toBe('other');
    expect(rootId).toBe('other');
    mutations.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
  it('does not choose an arbitrary Other source when the tree is ambiguous', async () => {
    api.nodes.set('second-other', {
      id: 'second-other',
      parentId: 'root',
      title: 'Other',
      folderType: 'other',
      syncing: true,
    });
    expect((await fixture.snapshots.initialize()).rootId).toBeNull();
    expect(rootId).toBeNull();
  });
  it('falls back after a selected folder becomes managed, with a clear notice', async () => {
    await setup();
    const root = fixture.bookmarks.source.rootId!;
    api.nodes.get(root)!.unmodifiable = 'managed';
    const result = await fixture.snapshots.load();
    expect(result.rootId).toBe('other');
    expect(formatMessage(result.rootNotice)).toContain('недоступна');
    expect((await api.get(root))[0]).toBeTruthy();
  });
  it('keeps the recovery notice until a view consumes it, including another tab adoption', async () => {
    await setup();
    const old = fixture.bookmarks.source.rootId!;
    await api.removeTree(old);
    await fixture.bookmarks.source.adoptRoot('other');
    expect(formatMessage((await fixture.snapshots.load()).rootNotice)).toContain('недоступна');
    expect(formatMessage((await fixture.snapshots.load()).rootNotice)).toContain('Другие закладки');
    fixture.bookmarks.source.clearSourceNotice();
    expect((await fixture.snapshots.load()).rootNotice).toBeUndefined();
  });
  it('rolls back visual settings and background if persisting the new source fails', async () => {
    await setup();
    const initial = fixture.bookmarks.source.rootId;
    const oldBackground = new Blob(['old']);
    await db.assets.put({ key: 'background', blob: oldBackground });
    vi.spyOn(rootPort, 'setValue').mockRejectedValueOnce(new Error('Storage failure'));
    await expect(
      fixture.preferences.saveSettings({ ...defaults, width: 50 }, new Blob(['new']), 'other'),
    ).rejects.toThrow('Storage failure');
    expect(rootId).toBe(initial);
    expect(fixture.bookmarks.source.rootId).toBe(initial);
    expect((await settingsPort.getValue())?.value).toEqual(defaults);
    expect(await (await db.assets.get('background'))!.blob.text()).toBe('old');
  });
  it('does not switch roots when settings or tree access fails', async () => {
    await setup();
    const initial = fixture.bookmarks.source.rootId;
    const write = vi.spyOn(rootPort, 'setValue');
    vi.spyOn(settingsPort, 'setValue').mockRejectedValueOnce(new Error('Settings failure'));
    await expect(
      fixture.preferences.saveSettings({ ...defaults, width: 50 }, undefined, 'other'),
    ).rejects.toThrow('Settings failure');
    expect(write).not.toHaveBeenCalled();
    expect(rootId).toBe(initial);
    vi.spyOn(api, 'getTree').mockRejectedValueOnce(new Error('Permission denied'));
    await expect(
      fixture.preferences.saveSettings({ ...defaults }, undefined, 'other'),
    ).rejects.toThrow('Permission denied');
    expect(rootId).toBe(initial);
  });
  it('allows child CRUD in system folders while protecting the system folder itself', async () => {
    await fixture.snapshots.initialize();
    const id = await add();
    await fixture.bookmarks.actions.createFolder('A');
    const folder = (await api.getChildren('other')).find((row) => !row.url)!;
    await fixture.bookmarks.actions.edit(id, 'https://example.com/', 'Moved', folder.id);
    await fixture.bookmarks.actions.renameFolder(folder.id, 'B');
    await expect(fixture.bookmarks.actions.removeFolder('other')).rejects.toThrow();
    await expect(fixture.bookmarks.actions.renameFolder('other', 'Wrong')).rejects.toThrow();
    await fixture.bookmarks.actions.removeFolder(folder.id);
    expect(await api.getChildren('other')).toEqual([]);
  });
  it('keeps the current folder when saving visual preferences for the same source', async () => {
    await setup();
    await fixture.bookmarks.actions.createFolder('A');
    fixture.bookmarks.source.activeId = (
      await api.getChildren(fixture.bookmarks.source.rootId!)
    )[0]!.id;
    const active = fixture.bookmarks.source.activeId;
    await fixture.preferences.saveSettings(
      { ...defaults, width: 75 },
      undefined,
      fixture.bookmarks.source.rootId!,
    );
    expect(fixture.bookmarks.source.activeId).toBe(active);
  });
  it('unavailable or corrupt image cache never hides browser bookmarks', async () => {
    await setup();
    const id = await add();
    await db.tileAssets.put({
      bookmarkId: id,
      url: 'https://example.com/',
      thumbnail: new Blob(['<svg/>'], { type: 'image/svg+xml' }),
    });
    expect((await fixture.snapshots.load()).tabs[0]?.thumbnail).toBeNull();
    vi.spyOn(db.tileAssets, 'get').mockRejectedValue(new Error('IDB unavailable'));
    expect((await fixture.snapshots.load()).tabs[0]?.id).toBe(id);
  });
  it('uses Other without creating or searching for Speed Dial', async () => {
    expect((await fixture.snapshots.initialize()).rootId).toBe('other');
    expect(await api.getChildren('other')).toEqual([]);
  });
  it('uses Other for a stale saved ID without adopting a same-named folder', async () => {
    await api.create({ parentId: 'other', title: 'Speed Dial' });
    rootId = 'stale';
    expect((await fixture.snapshots.initialize()).rootId).toBe('other');
  });
  it('does not merge duplicate names or local/account branches', async () => {
    await api.create({ parentId: 'other', title: 'Speed Dial' });
    await api.create({ parentId: 'other', title: 'Speed Dial' });
    expect((await fixture.snapshots.initialize()).rootId).toBe('other');
  });
  it('distinguishes account/local branches without relying on fixed IDs', async () => {
    const local = await api.create({ parentId: 'root', title: 'Local' });
    Object.assign(api.nodes.get(local.id)!, { folderType: 'other', syncing: false });
    await api.create({ parentId: 'other', title: 'Speed Dial' });
    await api.create({ parentId: local.id, title: 'Speed Dial' });
    const choices = await fixture.bookmarks.source.choices();
    expect(choices.find((node) => node.id === 'other')?.path).toContain('аккаунт');
    expect(choices.find((node) => node.id === local.id)?.path).toContain('локально');
    expect((await fixture.snapshots.initialize()).rootId).toBe('other');
  });
  it('protects technical, standard and managed folders', async () => {
    await expect(fixture.bookmarks.source.selectRoot('root')).rejects.toThrow();
    await expect(fixture.bookmarks.source.selectRoot('other')).resolves.toBeUndefined();
    const managed = await api.create({ parentId: 'other', title: 'Managed' });
    api.nodes.get(managed.id)!.unmodifiable = 'managed';
    const nested = await api.create({ parentId: managed.id, title: 'Nested' });
    await expect(fixture.bookmarks.source.selectRoot(nested.id)).rejects.toThrow();
  });
  it('rejects unavailable API instead of presenting an empty source', async () => {
    vi.spyOn(api, 'getTree').mockRejectedValue(new Error('Permission denied'));
    await expect(fixture.snapshots.initialize()).rejects.toThrow('Permission');
  });
  it('shows direct bookmarks without folders and with empty cache', async () => {
    await setup();
    const id = await add();
    await db.tileAssets.clear();
    const state = await fixture.snapshots.load();
    expect(state.folders).toEqual([
      { id: fixture.bookmarks.source.rootId, title: 'Speed Dial', index: -1, virtual: true },
    ]);
    expect(state.tabs[0]).toMatchObject({ id, thumbnail: null, favicon: null });
  });
  it('handles mixed, only-folder, empty and deep structures', async () => {
    await setup();
    expect((await fixture.snapshots.load()).tabs).toEqual([]);
    const direct = await add();
    await fixture.bookmarks.actions.createFolder('Главная');
    const folder = (await api.getChildren(fixture.bookmarks.source.rootId!)).find(
      (node) => !node.url,
    )!;
    const deep = await api.create({ parentId: folder.id, title: 'Deep' });
    await api.create({ parentId: deep.id, title: 'Hidden', url: 'https://hidden.example' });
    const state = await fixture.snapshots.load();
    expect(state.folders.map((node) => node.title)).toEqual(['Speed Dial', 'Главная']);
    expect(state.activeId).toBe(folder.id);
    fixture.bookmarks.source.selectFolder(fixture.bookmarks.source.rootId!);
    expect((await fixture.snapshots.load()).tabs.map((node) => node.id)).toEqual([direct]);
    fixture.bookmarks.source.activeId = folder.id;
    expect((await fixture.snapshots.load()).tabs).toEqual([]);
    await api.remove(direct);
    expect((await fixture.snapshots.load()).folders.length).toBe(2);
    expect((await api.getChildren(deep.id)).length).toBe(1);
  });
  it('CRUD, moves, cache and reset preserve browser source and custom titles', async () => {
    await setup();
    const id = await add();
    const image = new Blob(['image'], { type: 'image/png' });
    await fixture.bookmarks.actions.cache(id, 'https://example.com/', 'thumbnail', image);
    await fixture.bookmarks.actions.edit(id, 'https://example.com/', 'Edited');
    expect((await fixture.snapshots.load()).tabs[0]?.thumbnail).toBeTruthy();
    await fixture.bookmarks.actions.createFolder('Work');
    const folder = (await api.getChildren(fixture.bookmarks.source.rootId!)).find(
      (node) => !node.url,
    )!;
    await fixture.bookmarks.actions.edit(id, 'https://example.com/', 'Edited', folder.id);
    fixture.bookmarks.source.activeId = folder.id;
    expect((await fixture.snapshots.load()).tabs[0]?.title).toBe('Edited');
    expect((await fixture.snapshots.load()).tabs[0]?.thumbnail).toBeTruthy();
    await fixture.backup.reset();
    expect((await fixture.snapshots.load()).tabs[0]?.id).toBe(id);
    expect((await fixture.snapshots.load()).settings).toEqual(defaults);
    await fixture.bookmarks.actions.remove(id);
    expect((await fixture.snapshots.load()).tabs).toEqual([]);
  });
  it('ignores stale assets on URL change, keeps them on external move/title change', async () => {
    await setup();
    const id = await add();
    const image = new Blob(['image'], { type: 'image/png' });
    await fixture.bookmarks.actions.cache(id, 'https://example.com/', 'favicon', image);
    await api.update(id, { title: 'External' });
    expect((await fixture.snapshots.load()).tabs[0]?.favicon).toBeTruthy();
    await api.move(id, { parentId: 'other' });
    expect((await fixture.snapshots.load()).tabs).toEqual([]);
    expect(await db.tileAssets.get([id, 'https://example.com/'])).toBeTruthy();
    await expect(
      fixture.bookmarks.actions.edit(id, 'https://bad.example/', 'Wrong'),
    ).rejects.toThrow();
    await api.move(id, { parentId: fixture.bookmarks.source.rootId! });
    await api.update(id, { url: 'https://new.example/' });
    expect((await fixture.snapshots.load()).tabs[0]?.favicon).toBeNull();
    await expect(
      fixture.bookmarks.actions.cache(id, 'https://example.com/', 'thumbnail', image),
    ).rejects.toThrow();
    await api.remove(id);
    await expect(
      fixture.bookmarks.actions.cache(id, 'https://new.example/', 'thumbnail', image),
    ).rejects.toThrow();
  });
  it('independent image updates never overwrite other resources', async () => {
    await setup();
    const id = await add();
    const image = new Blob(['a'], { type: 'image/png' });
    await Promise.all([
      fixture.bookmarks.actions.cache(id, 'https://example.com/', 'thumbnail', image),
      fixture.bookmarks.actions.cache(id, 'https://example.com/', 'favicon', image),
    ]);
    expect((await fixture.snapshots.load()).tabs[0]).toMatchObject({
      thumbnail: expect.any(Blob),
      favicon: expect.any(Blob),
      title: 'Свой заголовок',
    });
    await expect(
      fixture.bookmarks.actions.cache(
        id,
        'https://example.com/',
        'favicon',
        new Blob(['<svg/>'], { type: 'image/svg+xml' }),
      ),
    ).rejects.toThrow();
  });
  it('reorders beginning/middle/end and rejects changed lists; failure leaves actual order', async () => {
    await setup();
    const ids = [await add(), await add('https://b.example'), await add('https://c.example')];
    await fixture.bookmarks.actions.reorder([ids[2]!, ids[0]!, ids[1]!]);
    expect((await fixture.snapshots.load()).tabs.map((node) => node.id)).toEqual([
      ids[2],
      ids[0],
      ids[1],
    ]);
    await fixture.bookmarks.actions.reorder(ids);
    expect((await fixture.snapshots.load()).tabs.map((node) => node.id)).toEqual(ids);
    await expect(fixture.bookmarks.actions.reorder([ids[0]!, ids[0]!])).rejects.toThrow();
    vi.spyOn(api, 'move').mockRejectedValueOnce(new Error('move failed'));
    await expect(fixture.bookmarks.actions.reorder(ids.slice().reverse())).rejects.toThrow();
    expect((await fixture.snapshots.load()).tabs.length).toBe(3);
  });
  it('keeps a named virtual root for empty trees, disambiguates only equal names and follows external renames', async () => {
    await setup();
    expect((await fixture.snapshots.load()).folders).toEqual([
      { id: fixture.bookmarks.source.rootId, title: 'Speed Dial', index: -1, virtual: true },
    ]);
    await fixture.bookmarks.actions.createFolder('Speed Dial');
    const selected = fixture.bookmarks.source.activeId;
    await fixture.bookmarks.actions.createFolder('Главная');
    expect((await fixture.snapshots.load()).folders.map((row) => row.title)).toEqual([
      'Speed Dial',
      'Speed Dial (папка)',
      'Главная',
    ]);
    await api.update(fixture.bookmarks.source.rootId!, { title: 'Работа' });
    expect((await fixture.snapshots.load()).folders.map((row) => row.title)).toEqual([
      'Работа',
      'Speed Dial',
      'Главная',
    ]);
    fixture.bookmarks.source.selectFolder(selected!);
    await api.removeTree(selected!);
    expect((await fixture.snapshots.load()).activeId).toBe(fixture.bookmarks.source.rootId);
  });
  it('preserves folder slots during bookmark sorting and bookmark slots during folder sorting', async () => {
    await setup();
    const a = await add();
    await fixture.bookmarks.actions.createFolder('Folder');
    const folder = fixture.bookmarks.source.activeId!;
    fixture.bookmarks.source.selectFolder(fixture.bookmarks.source.rootId!);
    const b = await add('https://b.example'),
      c = await add('https://c.example');
    await fixture.bookmarks.actions.reorder([c, b, a], [a, b, c]);
    expect((await api.getChildren(fixture.bookmarks.source.rootId!)).map((row) => row.id)).toEqual([
      c,
      folder,
      b,
      a,
    ]);
    await fixture.bookmarks.actions.createFolder('Second');
    const second = fixture.bookmarks.source.activeId!;
    const calls = vi.spyOn(api, 'move');
    await fixture.bookmarks.actions.reorderFolders([second, folder], [folder, second]);
    expect((await api.getChildren(fixture.bookmarks.source.rootId!)).map((row) => row.id)).toEqual([
      c,
      second,
      b,
      a,
      folder,
    ]);
    expect(calls.mock.calls.every(([id]) => id === folder || id === second)).toBe(true);
    calls.mockClear();
    await fixture.bookmarks.actions.reorderFolders([second, folder], [second, folder]);
    expect(calls).not.toHaveBeenCalled();
    await expect(
      fixture.bookmarks.actions.reorderFolders([folder, second], [folder, second]),
    ).rejects.toThrow('Список изменился');
    expect(calls).not.toHaveBeenCalled();
  });
  it('stops a partially completed reorder on API failure and rejects stale folder context', async () => {
    await setup();
    const ids = [await add(), await add('https://b.example'), await add('https://c.example')];
    const move = api.move.bind(api);
    let count = 0;
    vi.spyOn(api, 'move').mockImplementation(async (id, destination) => {
      if (++count === 2) throw Error('partial');
      return move(id, destination);
    });
    await expect(fixture.bookmarks.actions.reorder(ids.slice().reverse(), ids)).rejects.toThrow(
      'partial',
    );
    expect((await fixture.snapshots.load()).tabs.map((row) => row.id)).toEqual([
      ids[2],
      ids[0],
      ids[1],
    ]);
    const parent = fixture.bookmarks.source.activeId;
    await fixture.bookmarks.actions.createFolder('Changed');
    await expect(fixture.bookmarks.actions.reorder(ids, ids, parent)).rejects.toThrow(
      'Папка изменилась',
    );
  });
  it('accounts for Chromium destination indices before removing a sibling', async () => {
    await setup();
    const a = await add();
    await fixture.bookmarks.actions.createFolder('Folder');
    const folder = fixture.bookmarks.source.activeId!;
    fixture.bookmarks.source.selectFolder(fixture.bookmarks.source.rootId!);
    const b = await add('https://b.example'),
      c = await add('https://c.example');
    const move = api.move.bind(api);
    vi.spyOn(api, 'move').mockImplementation(async (id, destination) => {
      const before = (await api.get(id))[0]!;
      return move(id, {
        ...destination,
        index:
          destination.index! -
          Number(before.parentId === destination.parentId && before.index! < destination.index!),
      });
    });
    vi.stubEnv('BROWSER', 'chrome');
    try {
      await fixture.bookmarks.actions.reorder([c, b, a], [a, b, c]);
      expect(
        (await api.getChildren(fixture.bookmarks.source.rootId!)).map((row) => row.id),
      ).toEqual([c, folder, b, a]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('folder lifecycle and external removal choose a valid fallback', async () => {
    await setup();
    await add();
    await fixture.bookmarks.actions.createFolder('A');
    await fixture.bookmarks.actions.createFolder('B');
    const [a, b] = (await api.getChildren(fixture.bookmarks.source.rootId!)).filter(
      (node) => !node.url,
    );
    await fixture.bookmarks.actions.renameFolder(a!.id, 'New');
    await fixture.bookmarks.actions.moveFolder(b!.id, a!.id);
    expect((await fixture.snapshots.load()).folders.map((node) => node.title)).toEqual([
      'Speed Dial',
      'B',
      'New',
    ]);
    fixture.bookmarks.source.activeId = a!.id;
    await api.move(a!.id, { parentId: 'other' });
    expect((await fixture.snapshots.load()).activeId).toBe(fixture.bookmarks.source.rootId);
    await fixture.bookmarks.actions.removeFolder(b!.id);
    await expect(
      fixture.bookmarks.actions.removeFolder(fixture.bookmarks.source.rootId!),
    ).rejects.toThrow();
    await api.removeTree(fixture.bookmarks.source.rootId!);
    expect((await fixture.snapshots.load()).rootId).toBe('other');
    expect((await api.getChildren('other')).length).toBe(1);
  });
  it('switching roots does not copy/delete data', async () => {
    await setup();
    const id = await add();
    const other = await api.create({ parentId: 'other', title: 'Second' });
    await fixture.bookmarks.source.selectRoot(other.id);
    expect((await fixture.snapshots.load()).tabs).toEqual([]);
    expect((await api.get(id))[0]?.url).toBe('https://example.com/');
  });
  it('export/import reuses existing records and reports partial errors', async () => {
    await setup();
    await add();
    await fixture.bookmarks.actions.createFolder('Empty');
    const data = await fixture.backup.exportData();
    expect(data.entries).toEqual([
      { title: 'Свой заголовок', url: 'https://example.com/' },
      { title: 'Empty', children: [] },
    ]);
    const outside = await api.create({
      parentId: 'other',
      title: 'Outside',
      url: 'https://outside.example',
    });
    await fixture.backup.importData(data, fixture.bookmarks.source.rootId!);
    expect((await api.getChildren(fixture.bookmarks.source.rootId!)).length).toBe(2);
    expect((await api.get(outside.id))[0]?.title).toBe('Outside');
    data.entries = [
      { title: 'New', url: 'https://new.example/' },
      { title: 'Fail', children: [] },
    ];
    const original = api.create.bind(api);
    vi.spyOn(api, 'create')
      .mockImplementationOnce(original)
      .mockRejectedValueOnce(new Error('failed'));
    expect(await fixture.backup.importData(data, fixture.bookmarks.source.rootId!)).toMatchObject({
      bookmarks: 1,
      folders: 0,
      error: { key: 'backup.import.errors.interrupted' },
    });
  });
  it('does not expose mass clear and preserves hidden descendants when selecting sources', async () => {
    await setup();
    const id = await add();
    await fixture.bookmarks.actions.createFolder('A');
    const a = (await api.getChildren(fixture.bookmarks.source.rootId!)).find((node) => !node.url)!;
    const deep = await api.create({ parentId: a.id, title: 'Deep' });
    const before = await api.getTree();
    await fixture.bookmarks.source.selectRoot('other');
    expect('clear' in fixture.bookmarks.actions).toBe(false);
    expect(await api.getTree()).toEqual(before);
    expect((await api.get(id))[0]).toBeTruthy();
    expect((await api.get(deep.id))[0]).toBeTruthy();
  });
});

describe('full backup resources and explicit destination', () => {
  it('binds duplicate URL images to returned native IDs and restores provenance', async () => {
    await setup();
    const original = await fixture.bookmarks.actions.add({
      url: 'https://example.com/',
      title: '',
    });
    await fixture.bookmarks.actions.createFolder('A');
    const a = fixture.bookmarks.source.activeId!;
    const other = await api.create({
      parentId: a,
      title: 'Duplicate',
      url: 'https://example.com/',
    });
    await db.tileAssets.put({
      bookmarkId: original,
      url: 'https://example.com/',
      thumbnail: new Blob(['red'], { type: 'image/png' }),
    });
    await db.tileAssets.put({
      bookmarkId: other.id,
      url: 'https://example.com/',
      thumbnail: new Blob(['blue'], { type: 'image/png' }),
    });
    const data = await fixture.backup.exportData(),
      destination = (await api.create({ parentId: 'other', title: 'Destination' })).id;
    const report = await fixture.backup.importData(data, destination);
    expect(report).toMatchObject({ bookmarks: 2, folders: 1, images: 2 });
    expect(report.error).toBeUndefined();
    const entries = await api.getChildren(destination),
      first = entries[0]!,
      folder = entries[1]!,
      second = (await api.getChildren(folder.id))[0]!;
    expect(first.id).not.toBe(original);
    expect(await (await db.tileAssets.get([first.id, first.url!]))!.thumbnail!.text()).toBe('red');
    expect(await (await db.tileAssets.get([second.id, second.url!]))!.thumbnail!.text()).toBe(
      'blue',
    );
    expect(await db.autoNames.get(first.id)).toMatchObject({ url: first.url });
    expect(fixture.bookmarks.source.rootId).not.toBe(destination);
  });
  it('rejects stale settings or missing destination before creating any bookmarks', async () => {
    await setup();
    const data = await fixture.backup.exportData();
    data.entries = [{ title: 'A', url: 'https://a.example/' }];
    const before = await api.getTree();
    await expect(fixture.backup.importData(data, 'gone')).rejects.toThrow();
    await expect(
      fixture.backup.importData(data, fixture.bookmarks.source.rootId!, { ...defaults, width: 70 }),
    ).rejects.toThrow('другой вкладке');
    expect(await api.getTree()).toEqual(before);
  });
  it('keeps created bookmarks when image storage fails and continues importing', async () => {
    await setup();
    const data = await fixture.backup.exportData();
    data.entries = [
      { title: 'A', url: 'https://a.example/', thumbnail: new Blob(['a'], { type: 'image/png' }) },
      { title: 'B', url: 'https://b.example/' },
    ];
    vi.spyOn(db.tileAssets, 'put').mockRejectedValue(Error('disk'));
    const report = await fixture.backup.importData(data, fixture.bookmarks.source.rootId!);
    expect(report).toMatchObject({ bookmarks: 2, images: 0 });
    expect(report.warnings).toHaveLength(1);
    expect(report.error).toBeUndefined();
    expect(await api.getChildren(fixture.bookmarks.source.rootId!)).toHaveLength(2);
  });
});

it('imports with complete unchanged default settings regardless of property order', async () => {
  await setup();
  const data = await fixture.backup.exportData();
  data.entries = [{ title: 'A', url: 'https://a.example/' }];
  expect(
    await fixture.backup.importData(data, fixture.bookmarks.source.rootId!, { ...defaults }),
  ).toMatchObject({
    bookmarks: 1,
  });
});

it('exports settings and wallpaper when there is no available bookmark root', async () => {
  expect(await fixture.backup.exportData()).toMatchObject({
    entries: [],
    settings: defaults,
    background: null,
  });
});

it('reset repairs invalid settings using the current defaults without changing bookmarks', async () => {
  await setup();
  const id = await add();
  stored = { value: { ...defaults, unexpected: true } } as SettingsEnvelope;
  await fixture.backup.reset();
  expect(stored!.value).toEqual(defaults);
  expect((await api.get(id))[0]).toBeDefined();
});

describe('backup matching', () => {
  it('restores images in place and keeps unrelated entries, order and name provenance', async () => {
    await setup();
    const id = await add(),
      folder = (await api.create({ parentId: fixture.bookmarks.source.rootId!, title: 'Folder' }))
        .id;
    const child = await api.create({
      parentId: folder,
      title: 'Inside',
      url: 'https://example.com/',
    });
    const untouched = await api.create({
      parentId: fixture.bookmarks.source.rootId!,
      title: 'Unrelated',
      url: 'https://other.example/',
    });
    const data = await fixture.backup.exportData();
    data.entries = [
      {
        title: 'Свой заголовок',
        url: 'https://example.com/',
        thumbnail: new Blob(['root'], { type: 'image/png' }),
        autoName: true,
      },
      {
        title: 'Folder',
        children: [
          {
            title: 'Inside',
            url: 'https://example.com/',
            thumbnail: new Blob(['child'], { type: 'image/png' }),
          },
        ],
      },
    ];
    const before = await api.getTree(),
      create = vi.spyOn(api, 'create'),
      update = vi.spyOn(api, 'update');
    for (let i = 0; i < 2; i++)
      expect(await fixture.backup.importData(data, fixture.bookmarks.source.rootId!)).toEqual({
        bookmarks: 0,
        folders: 0,
        images: 2,
        settings: true,
        background: true,
        warnings: [],
      });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(await api.getTree()).toEqual(before);
    expect(await (await db.tileAssets.get([id, 'https://example.com/']))!.thumbnail!.text()).toBe(
      'root',
    );
    expect(await (await db.tileAssets.get([child.id, child.url!]))!.thumbnail!.text()).toBe(
      'child',
    );
    expect(await db.autoNames.get(id)).toBeUndefined();
    expect((await api.get(untouched.id))[0]).toBeDefined();
  });
  it('matches repeated folders and bookmarks one to one without merging different titles, URLs or parents', async () => {
    await setup();
    const data = await fixture.backup.exportData(),
      row = {
        title: 'Same',
        url: 'https://a.example/',
        thumbnail: new Blob(['a'], { type: 'image/png' }),
      };
    await api.create({
      parentId: fixture.bookmarks.source.rootId!,
      title: 'Same',
      url: 'https://different.example/',
    });
    await api.create({
      parentId: fixture.bookmarks.source.rootId!,
      title: 'Different',
      url: row.url,
    });
    data.entries = [
      row,
      { ...row, thumbnail: new Blob(['b'], { type: 'image/png' }) },
      { title: 'Folder', children: [row] },
      {
        title: 'Folder',
        children: [{ ...row, thumbnail: new Blob(['c'], { type: 'image/png' }) }],
      },
    ];
    expect(await fixture.backup.importData(data, fixture.bookmarks.source.rootId!)).toMatchObject({
      bookmarks: 4,
      folders: 2,
      images: 4,
    });
    const before = await api.getTree();
    expect(await fixture.backup.importData(data, fixture.bookmarks.source.rootId!)).toEqual({
      bookmarks: 0,
      folders: 0,
      images: 4,
      settings: true,
      background: true,
      warnings: [],
    });
    expect(await api.getTree()).toEqual(before);
    const roots = (await api.getChildren(fixture.bookmarks.source.rootId!)).filter(
      (n) => n.title === 'Same' && n.url === row.url,
    );
    expect(await (await db.tileAssets.get([roots[0]!.id, row.url]))!.thumbnail!.text()).toBe('a');
    expect(await (await db.tileAssets.get([roots[1]!.id, row.url]))!.thumbnail!.text()).toBe('b');
  });
  it('retries partial imports without duplicating already created entries', async () => {
    await setup();
    const data = await fixture.backup.exportData();
    data.entries = [
      { title: 'First', url: 'https://first.example/' },
      { title: 'Second', url: 'https://second.example/' },
    ];
    const create = api.create.bind(api);
    vi.spyOn(api, 'create')
      .mockImplementationOnce(create)
      .mockRejectedValueOnce(Error('interrupted'));
    expect(await fixture.backup.importData(data, fixture.bookmarks.source.rootId!)).toMatchObject({
      bookmarks: 1,
      error: { key: 'backup.import.errors.interrupted' },
    });
    expect(await fixture.backup.importData(data, fixture.bookmarks.source.rootId!)).toEqual({
      bookmarks: 1,
      folders: 0,
      images: 0,
      settings: true,
      background: true,
      warnings: [],
    });
    expect(await api.getChildren(fixture.bookmarks.source.rootId!)).toHaveLength(2);
  });
});

describe('selected backup sections', () => {
  const only = (key: string) => ({
    bookmarks: false,
    images: false,
    settings: false,
    background: false,
    [key]: true,
  });
  it('exports only selected payloads, retaining locators for images without restoring bookmarks', async () => {
    await setup();
    const id = await add();
    await db.tileAssets.put({
      bookmarkId: id,
      url: 'https://example.com/',
      thumbnail: new Blob(['image'], { type: 'image/png' }),
    });
    await db.assets.put({
      key: 'background',
      blob: new Blob(['wallpaper'], { type: 'image/png' }),
    });
    const images = await fixture.backup.exportData(undefined, only('images'));
    expect(images).toMatchObject({
      bookmarks: false,
      entries: [
        { title: 'Свой заголовок', url: 'https://example.com/', thumbnail: expect.any(Blob) },
      ],
    });
    expect(images.settings).toBeUndefined();
    expect(images.background).toBeUndefined();
    const bookmarks = await fixture.backup.exportData(undefined, only('bookmarks'));
    expect(bookmarks).toEqual({
      entries: [{ title: 'Свой заголовок', url: 'https://example.com/' }],
    });
    expect(await fixture.backup.exportData(undefined, only('settings'))).toEqual({
      bookmarks: false,
      entries: [],
      settings: defaults,
    });
    expect(await fixture.backup.exportData(undefined, only('background'))).toMatchObject({
      bookmarks: false,
      entries: [],
      background: expect.any(Blob),
    });
  });
  it('imports only images into matching entries without bookmark, settings, wallpaper or provenance writes', async () => {
    await setup();
    const id = await add();
    const data = await fixture.backup.exportData();
    data.entries = [
      {
        title: 'Свой заголовок',
        url: 'https://example.com/',
        thumbnail: new Blob(['restored'], { type: 'image/png' }),
      },
      {
        title: 'Missing',
        url: 'https://missing.example/',
        thumbnail: new Blob(['skip'], { type: 'image/png' }),
      },
      {
        title: 'Missing folder',
        children: [
          {
            title: 'Child',
            url: 'https://child.example/',
            favicon: new Blob(['skip'], { type: 'image/png' }),
          },
        ],
      },
    ];
    const before = await api.getTree(),
      write = vi.spyOn(settingsPort, 'setValue'),
      wallpaper = vi.spyOn(db.assets, 'put');
    expect(
      await fixture.backup.importData(
        data,
        fixture.bookmarks.source.rootId!,
        { ...defaults, width: 50 },
        only('images'),
      ),
    ).toEqual({ bookmarks: 0, folders: 0, images: 1, skipped: 2, warnings: [] });
    expect(await api.getTree()).toEqual(before);
    expect(write).not.toHaveBeenCalled();
    expect(wallpaper).not.toHaveBeenCalled();
    expect(await (await db.tileAssets.get([id, 'https://example.com/']))!.thumbnail!.text()).toBe(
      'restored',
    );
  });
  it('imports bookmarks without images and respects the file prohibition on creation', async () => {
    await setup();
    const data = {
      entries: [
        {
          title: 'New',
          url: 'https://new.example/',
          thumbnail: new Blob(['image'], { type: 'image/png' }),
        },
      ],
      settings: defaults,
      background: null,
    };
    expect(
      await fixture.backup.importData(
        data,
        fixture.bookmarks.source.rootId!,
        undefined,
        only('bookmarks'),
      ),
    ).toEqual({
      bookmarks: 1,
      folders: 0,
      images: 0,
      warnings: [],
    });
    expect(await db.tileAssets.count()).toBe(0);
    expect(
      await fixture.backup.importData(
        {
          ...data,
          bookmarks: false,
          entries: [
            {
              title: 'Missing',
              url: 'https://missing.example/',
              thumbnail: data.entries[0]!.thumbnail,
            },
          ],
        },
        fixture.bookmarks.source.rootId!,
      ),
    ).toMatchObject({ bookmarks: 0, folders: 0, images: 0, skipped: 1 });
    expect(await api.getChildren(fixture.bookmarks.source.rootId!)).toHaveLength(1);
  });
  it('imports settings and wallpaper independently without requiring a bookmark destination', async () => {
    await setup();
    await fixture.preferences.patchSettings({ width: 75 });
    const old = new Blob(['old'], { type: 'image/png' }),
      next = new Blob(['new'], { type: 'image/png' });
    await db.assets.put({ key: 'background', blob: old });
    const tree = await api.getTree();
    const data = {
      bookmarks: false as const,
      entries: [],
      settings: { ...defaults, width: 50 },
      background: next,
    };
    expect(await fixture.backup.importData(data, '', undefined, only('settings'))).toEqual({
      bookmarks: 0,
      folders: 0,
      images: 0,
      settings: true,
      warnings: [],
    });
    expect((await fixture.snapshots.load()).settings.width).toBe(50);
    expect(await (await db.assets.get('background'))!.blob.text()).toBe('old');
    const write = vi.spyOn(settingsPort, 'setValue');
    expect(await fixture.backup.importData(data, '', undefined, only('background'))).toEqual({
      bookmarks: 0,
      folders: 0,
      images: 0,
      background: true,
      warnings: [],
    });
    expect(write).not.toHaveBeenCalled();
    expect(await (await db.assets.get('background'))!.blob.text()).toBe('new');
    expect(await api.getTree()).toEqual(tree);
    await fixture.backup.importData(
      { bookmarks: false, entries: [], background: null },
      '',
      undefined,
      only('background'),
    );
    expect(await db.assets.get('background')).toBeUndefined();
  });
});

it('can prepare settings-only export even when the native tree exceeds the file entry limit', async () => {
  await setup();
  // This regression concerns the entry limit; avoid two IndexedDB reads per
  // bookmark for absent assets. Asset persistence is covered by other tests.
  vi.spyOn(db.tileAssets, 'get').mockResolvedValue(undefined);
  vi.spyOn(db.autoNames, 'get').mockResolvedValue(undefined);
  const entryCount = backupLimits.entries + 1;
  for (let i = 0; i < entryCount; i++)
    api.nodes.set('large-' + i, {
      id: 'large-' + i,
      parentId: fixture.bookmarks.source.rootId!,
      title: 'A',
      url: 'https://example.com/',
    });
  const prepared = await fixture.backup.exportData();
  expect(prepared.entries).toHaveLength(entryCount);
  expect(prepared.settings).toEqual(defaults);
  const text = await serializeExport(
    selectExport(prepared, { bookmarks: false, images: false, settings: true, background: false }),
  );
  expect(JSON.parse(text)).toMatchObject({ entries: [], settings: defaults });
  await expect(serializeExport(prepared)).rejects.toThrow(String(backupLimits.entries));
});
