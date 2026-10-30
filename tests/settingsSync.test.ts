import { formatMessage } from '../services/i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsSync, type SyncState, type StorageArea } from '../services/settingsSync';
import { defaults } from '../types/models';
import { folderKey, syncPrefix, syncPatch } from '../services/settingsSchema';
import { locateFolder, resolveFolder, validLocator } from '../services/folderLocator';
import type { BookmarkNode } from '../services/bookmarks';

const node = (id: string, title: string, children: BookmarkNode[] = []): BookmarkNode => ({
  id,
  parentId: 'other',
  title,
  children,
  syncing: true,
});
function tree(): BookmarkNode[] {
  return [
    {
      id: '0',
      title: '',
      children: [
        {
          ...node('other', 'Other', [node('a', 'Speed Dial', [node('b', 'Избранное')])]),
          parentId: '0',
          folderType: 'other',
        },
      ],
    },
  ];
}
class Area implements StorageArea {
  constructor(public values: Record<string, unknown> = {}) {}
  remove = vi.fn(async (keys: string | string[]) => {
    for (const key of typeof keys === 'string' ? [keys] : keys) delete this.values[key];
  });
  get = vi.fn(async () => structuredClone(this.values));
  set = vi.fn(async (values: Record<string, unknown>) => {
    Object.assign(this.values, structuredClone(values));
  });
}
const coordinators: SettingsSync[] = [];
afterEach(() => {
  coordinators.splice(0).forEach((c) => c.dispose());
});
function fixture(
  localValues: Record<string, unknown> = {},
  cloudValues: Record<string, unknown> = {},
  account: string | null = 'A',
) {
  const local = new Area(localValues),
    sync = new Area(cloudValues),
    bookmarks = { value: tree() },
    identity = { value: account };
  let now = 10000;
  const c = new SettingsSync({
    local,
    sync,
    tree: async () => structuredClone(bookmarks.value),
    lock: async (job) => job(),
    account: async () => identity.value,
    now: () => (now += 3000),
  });
  coordinators.push(c);
  return { c, local, sync, bookmarks, identity };
}
const localSettings = (patch = {}) => ({
  settings: { value: { ...defaults, ...patch } },
  rootFolderId: 'b',
});
const settings = (area: Area) => (area.values.settings as { value: typeof defaults }).value;

describe('per-field Chrome settings synchronization', () => {
  it('uploads confirmed local settings, gives cloud priority and keeps IDs/images local', async () => {
    const f = fixture(
      { ...localSettings({ width: 70, space: 12 }), background: 'local-only' },
      { [syncPrefix + 'width']: 85 },
    );
    await f.c.initialize();
    await f.c.confirmLocal(true);
    await f.c.flush();
    expect(settings(f.local)).toMatchObject({ width: 85, space: 12 });
    expect(f.sync.values[syncPrefix + 'space']).toBe(12);
    expect(f.sync.values[folderKey]).toEqual({
      version: 1,
      anchor: { folderType: 'other', syncing: true },
      path: ['Speed Dial', 'Избранное'],
    });
    expect(Object.keys(f.sync.values)).toHaveLength(Object.keys(defaults).length + 1);
    expect(f.local.values.rootFolderId).toBe('b');
    expect(f.local.values.background).toBe('local-only');
    expect(JSON.stringify(f.sync.values)).not.toContain('rootFolderId');
  });
  it('never fills a clean profile with defaults; accepts delayed cloud settings', async () => {
    const f = fixture();
    await f.c.initialize();
    await f.c.flush();
    expect(f.sync.set).not.toHaveBeenCalled();
    await f.c.remote({ [syncPrefix + 'width']: { newValue: 75 } });
    expect(settings(f.local).width).toBe(75);
    expect(f.sync.set).not.toHaveBeenCalled();
  });
  it('rechecks cloud fields before confirming local settings', async () => {
    const f = fixture(localSettings({ width: 70 }));
    await f.c.initialize();
    f.sync.values[syncPrefix + 'width'] = 95;
    await f.c.confirmLocal(true);
    await f.c.flush();
    expect(settings(f.local).width).toBe(95);
    expect(f.sync.values[syncPrefix + 'width']).toBe(95);
  });
  it('batches only edited fields and never echoes remote updates', async () => {
    const f = fixture();
    await f.c.initialize();
    await f.c.changed({ width: 75 });
    await f.c.changed({ space: 10 });
    await f.c.remote({ [syncPrefix + 'searchProvider']: { newValue: 'google' } });
    await f.c.flush();
    expect(f.sync.set).toHaveBeenCalledTimes(1);
    expect(f.sync.set.mock.calls[0]![0]).toEqual({
      [syncPrefix + 'width']: 75,
      [syncPrefix + 'space']: 10,
    });
    expect(settings(f.local).searchProvider).toBe('google');
    await f.c.remote({ [syncPrefix + 'width']: { newValue: 75 } });
    await f.c.flush();
    expect(f.sync.set).toHaveBeenCalledTimes(1);
  });
  it('accepts the bookmark mode and its enable flag through the existing sync fields', async () => {
    const f = fixture();
    await f.c.initialize();
    await f.c.remote({
      [syncPrefix + 'searchProvider']: { newValue: 'bookmarks' },
      [syncPrefix + 'bookmarkSearch']: { newValue: true },
    });
    await f.c.flush();
    expect(settings(f.local)).toMatchObject({ searchProvider: 'bookmarks', bookmarkSearch: true });
    expect(f.sync.set).not.toHaveBeenCalled();
  });
  it('syncs movie sources and their enable setting without echoing', async () => {
    const f = fixture();
    await f.c.initialize();
    await f.c.remote({
      [syncPrefix + 'searchProvider']: { newValue: 'imdb' },
      [syncPrefix + 'movieSearch']: { newValue: true },
    });
    await f.c.flush();
    expect(settings(f.local)).toMatchObject({ searchProvider: 'imdb', movieSearch: true });
    expect(f.sync.set).not.toHaveBeenCalled();
  });
  it('receives theme changes and sends only an explicit local theme change', async () => {
    const f = fixture();
    await f.c.initialize();
    await f.c.remote({ [syncPrefix + 'theme']: { newValue: 'dark' } });
    await f.c.flush();
    expect(settings(f.local).theme).toBe('dark');
    expect(f.sync.set).not.toHaveBeenCalled();
    await f.c.changed({ theme: 'light' });
    await f.c.flush();
    expect(f.sync.set).toHaveBeenCalledWith({ [syncPrefix + 'theme']: 'light' });
  });
  it('same-field incoming delivery supersedes an older queued edit', async () => {
    const f = fixture();
    await f.c.initialize();
    await f.c.changed({ width: 75 });
    await f.c.remote({ [syncPrefix + 'width']: { newValue: 90 } });
    await f.c.flush();
    expect(settings(f.local).width).toBe(90);
    expect(f.sync.set).not.toHaveBeenCalled();
  });
  it('validates types/ranges/unknown keys without normalizing bad remote fields into defaults', async () => {
    const f = fixture(localSettings({ space: 12, width: 70 }), {
      [syncPrefix + 'width']: '99',
      [syncPrefix + 'countColumns']: 999,
      [syncPrefix + 'verticalCenter']: 'true',
      [syncPrefix + 'searchProvider']: 'bogus',
      [syncPrefix + 'googleEmail']: 'secret',
    });
    await f.c.initialize();
    expect(settings(f.local)).toMatchObject({ width: 70, space: 12 });
    expect(
      syncPatch({ [syncPrefix + 'width']: 101, [syncPrefix + 'searchProvider']: 'bogus' }),
    ).toEqual({});
    await f.c.changed({ googleEmail: 'secret', width: 80 } as never);
    await f.c.flush();
    expect(
      f.sync.set.mock.calls.some(([batch]) => Object.hasOwn(batch, syncPrefix + 'googleEmail')),
    ).toBe(false);
  });
  it('ignores malformed incoming fields without cancelling a pending valid local edit', async () => {
    const f = fixture();
    await f.c.initialize();
    await f.c.changed({ width: 80 });
    await f.c.selectFolder('a');
    await f.c.remote({
      [syncPrefix + 'width']: { newValue: 'bad' },
      [folderKey]: { newValue: { version: 99 } },
      'unknown-key': { newValue: 'ignored' },
    });
    await f.c.flush();
    expect(f.sync.values[syncPrefix + 'width']).toBe(80);
    expect(f.sync.values[folderKey]).toEqual(locateFolder(tree(), 'a'));
  });
  it('retains local data on API/quota failure and retries without exposing submitted data', async () => {
    const f = fixture(localSettings({ width: 70 }), {}, null);
    await f.c.initialize();
    f.sync.set.mockRejectedValueOnce(new Error('QUOTA_BYTES private-account'));
    await f.c.changed({ width: 70 });
    await f.c.flush();
    expect(settings(f.local).width).toBe(70);
    expect(formatMessage((f.local.values.settingsSyncState as SyncState).error)).toContain(
      'локально',
    );
    expect(JSON.stringify(f.local.values)).not.toContain('private-account');
    await f.c.retry();
    expect(f.sync.values[syncPrefix + 'width']).toBe(70);
    expect(f.local.values.settingsSyncState).toMatchObject({ error: '' });
  });
  it('continues locally when sync.get is unavailable', async () => {
    const f = fixture(localSettings({ width: 70 }));
    f.sync.get.mockRejectedValue(new Error('unavailable'));
    await f.c.initialize();
    expect(settings(f.local).width).toBe(70);
    expect((f.local.values.settingsSyncState as SyncState).error).toMatchObject({
      key: 'sync.errors.saved_locally_retry',
    });
  });
  it('reset/import replaces pending settings while preserving the remote folder', async () => {
    const locator = locateFolder(tree(), 'b')!;
    const f = fixture({}, { [folderKey]: locator });
    await f.c.initialize();
    await f.c.changed({ width: 75, space: 12 });
    await f.c.changed({ ...defaults });
    await f.c.flush();
    expect(f.sync.values[syncPrefix + 'width']).toBe(defaults.width);
    expect(f.sync.values[syncPrefix + 'space']).toBe(defaults.space);
    expect(f.sync.values[folderKey]).toEqual(locator);
    await f.c.changed({ width: 85 });
    await f.c.flush();
    expect(f.sync.values[syncPrefix + 'width']).toBe(85);
  });
  it('coalesces concurrent flushes, limits writes and applies remote data during the delay', async () => {
    vi.useFakeTimers();
    const local = new Area(),
      sync = new Area();
    const c = new SettingsSync({
      local,
      sync,
      tree: async () => tree(),
      lock: async (job) => job(),
      account: async () => null,
    });
    coordinators.push(c);
    try {
      await c.initialize();
      await c.changed({ width: 70 });
      await c.flush();
      await c.changed({ width: 75 });
      const first = c.flush(),
        second = c.flush();
      await c.remote({ [syncPrefix + 'space']: { newValue: 10 } });
      expect(settings(local).space).toBe(10);
      await c.changed({ width: 85 });
      expect(sync.set).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2200);
      await Promise.all([first, second]);
      expect(sync.set).toHaveBeenCalledTimes(2);
      expect(sync.values[syncPrefix + 'width']).toBe(85);
    } finally {
      c.dispose();
      vi.useRealTimers();
    }
  });
});

describe('portable folder resolution', () => {
  it('uses raw titles and full ancestry rather than local IDs or display paths', () => {
    const locator = locateFolder(tree(), 'b')!;
    expect(locator.path).toEqual(['Speed Dial', 'Избранное']);
    const other = tree();
    other[0]!.children![0]!.children![0]!.children![0]!.id = 'different-device-id';
    expect(resolveFolder(other, locator)).toBe('different-device-id');
  });
  it('refuses local, unidentified, managed, duplicate anchors and ambiguous ancestors', () => {
    const locator = locateFolder(tree(), 'b')!;
    expect(
      resolveFolder(tree(), { ...locator, anchor: { folderType: 'other', syncing: false } }),
    ).toBeNull();
    expect(resolveFolder(tree(), { ...locator, anchor: { folderType: 'other' } })).toBeNull();
    const noIdentity = tree();
    delete noIdentity[0]!.children![0]!.syncing;
    expect(resolveFolder(noIdentity, locator)).toBeNull();
    const duplicates = tree();
    duplicates[0]!.children!.push(structuredClone(duplicates[0]!.children![0]!));
    expect(resolveFolder(duplicates, locator)).toBeNull();
    const ambiguous = tree();
    ambiguous[0]!.children![0]!.children!.push(node('duplicate', 'Speed Dial'));
    expect(resolveFolder(ambiguous, locator)).toBeNull();
    const managed = tree();
    managed[0]!.children![0]!.unmodifiable = 'managed';
    expect(resolveFolder(managed, locator)).toBeNull();
  });
  it('bounds and validates locators, ignoring unknown fields and huge paths', () => {
    const locator = locateFolder(tree(), 'b')!;
    for (const bad of [
      { ...locator, version: 2 },
      { ...locator, id: 'private' },
      { ...locator, path: Array(33).fill('a') },
      { ...locator, path: ['x'.repeat(513)] },
      { ...locator, path: Array(30).fill('Ж'.repeat(500)) },
      { ...locator, anchor: { folderType: 'other', accountId: 'private' } },
    ])
      expect(validLocator(bad)).toBe(false);
  });
  it('waits for missing folders and retries on bookmark events without publishing a fallback', async () => {
    const locator = locateFolder(tree(), 'b')!;
    const f = fixture({ rootFolderId: 'other' }, { [folderKey]: locator });
    f.bookmarks.value[0]!.children![0]!.children = [];
    await f.c.initialize();
    expect(f.local.values.rootFolderId).toBe('other');
    expect(formatMessage((f.local.values.settingsSyncState as SyncState).folder)).toContain(
      'Ожидаем',
    );
    f.bookmarks.value = tree();
    await f.c.bookmarksChanged();
    expect(f.local.values.rootFolderId).toBe('b');
    await f.c.flush();
    expect(f.sync.set).not.toHaveBeenCalled();
  });
  it('manual choice wins over a pending remote folder; rapid A-B-A keeps last choice', async () => {
    const f = fixture(
      {},
      {
        [folderKey]: {
          version: 1,
          anchor: { folderType: 'other', syncing: true },
          path: ['missing'],
        },
      },
    );
    await f.c.initialize();
    await Promise.all([f.c.selectFolder('a'), f.c.selectFolder('b'), f.c.selectFolder('a')]);
    await f.c.flush();
    expect(f.sync.values[folderKey]).toEqual(locateFolder(tree(), 'a'));
  });
  it('a late remote tree lookup cannot restore a folder after explicit manual selection', async () => {
    const local = new Area({ rootFolderId: 'other' }),
      sync = new Area({ [folderKey]: locateFolder(tree(), 'b')! });
    let release!: (nodes: BookmarkNode[]) => void;
    let first = true;
    const c = new SettingsSync({
      local,
      sync,
      tree: async () => {
        if (first) {
          first = false;
          return new Promise((resolve) => {
            release = resolve;
          });
        }
        return tree();
      },
      lock: async (job) => job(),
      account: async () => null,
    });
    coordinators.push(c);
    const initial = c.initialize();
    while (!release) await Promise.resolve();
    local.values.rootFolderId = 'a';
    const manual = c.selectFolder('a');
    release(tree());
    await initial;
    await manual;
    expect(local.values.rootFolderId).toBe('a');
    await c.flush();
    expect(sync.values[folderKey]).toEqual(locateFolder(tree(), 'a'));
  });
  it('updates renamed ancestors and never syncs the safe fallback after deletion', async () => {
    const f = fixture({ rootFolderId: 'b' }, { [folderKey]: locateFolder(tree(), 'b')! });
    await f.c.initialize();
    f.bookmarks.value[0]!.children![0]!.children![0]!.title = 'Renamed';
    await f.c.bookmarksChanged();
    await f.c.flush();
    expect(f.sync.values[folderKey]).toMatchObject({ path: ['Renamed', 'Избранное'] });
    f.bookmarks.value[0]!.children![0]!.children = [];
    f.local.values.rootFolderId = 'other';
    await f.c.bookmarksChanged();
    await f.c.flush();
    expect(f.sync.values[folderKey]).toMatchObject({ path: ['Renamed', 'Избранное'] });
  });
  it('recognizes its own locator echo even when Chrome reorders object keys', async () => {
    const f = fixture();
    await f.c.initialize();
    f.bookmarks.value[0]!.children![0]!.syncing = false;
    await f.c.selectFolder('b');
    await f.c.flush();
    const value = f.sync.values[folderKey] as {
      version: 1;
      anchor: { folderType: 'other'; syncing: boolean };
      path: string[];
    };
    await f.c.remote({
      [folderKey]: {
        newValue: { anchor: { syncing: false, folderType: 'other' }, path: value.path, version: 1 },
      },
    });
    f.bookmarks.value[0]!.children![0]!.children![0]!.title = 'Renamed';
    await f.c.bookmarksChanged();
    await f.c.flush();
    expect(f.sync.values[folderKey]).toMatchObject({ path: ['Renamed', 'Избранное'] });
  });
  it('tracks an already selected local folder after restart without selecting it on a clean device', async () => {
    const nodes = tree();
    nodes[0]!.children![0]!.syncing = false;
    const locator = locateFolder(nodes, 'b')!;
    const existing = fixture({ rootFolderId: 'b' }, { [folderKey]: locator });
    existing.bookmarks.value = nodes;
    await existing.c.initialize();
    existing.bookmarks.value[0]!.children![0]!.children![0]!.title = 'Renamed';
    await existing.c.bookmarksChanged();
    await existing.c.flush();
    expect(existing.sync.values[folderKey]).toMatchObject({ path: ['Renamed', 'Избранное'] });
    const clean = fixture({}, { [folderKey]: locator });
    clean.bookmarks.value = nodes;
    await clean.c.initialize();
    expect(clean.local.values.rootFolderId).toBeUndefined();
    await clean.c.flush();
    expect(clean.sync.set).not.toHaveBeenCalled();
  });
  it('a cold MV3 worker follows a native ancestor rename only with matching local source evidence', async () => {
    const first = fixture({ rootFolderId: 'b' });
    await first.c.initialize();
    await first.c.selectFolder('b');
    await first.c.flush();
    const restarted = fixture(
      structuredClone(first.local.values),
      structuredClone(first.sync.values),
    );
    restarted.bookmarks.value[0]!.children![0]!.children![0]!.title = 'Renamed';
    await restarted.c.initialize();
    await restarted.c.bookmarksChanged('unrelated');
    await restarted.c.flush();
    expect(restarted.sync.set).not.toHaveBeenCalled();
    await restarted.c.bookmarksChanged('a');
    await restarted.c.flush();
    expect(restarted.sync.values[folderKey]).toMatchObject({ path: ['Renamed', 'Избранное'] });
  });
});

describe('account boundaries', () => {
  it('uploads confirmed settings when browser account Sync is disabled', async () => {
    const f = fixture(localSettings({ width: 70 }), {}, '');
    await f.c.initialize();
    await f.c.confirmLocal(true);
    await f.c.flush();
    expect(f.sync.values[syncPrefix + 'width']).toBe(70);
  });
  it('never uploads unconfirmed local settings', async () => {
    const f = fixture(
      { ...localSettings({ width: 70, space: 12 }) },
      { [syncPrefix + 'space']: 30 },
      null,
    );
    await f.c.initialize();
    await f.c.flush();
    expect(settings(f.local)).toMatchObject({ width: 70, space: 30 });
    expect(f.sync.set).not.toHaveBeenCalled();
    expect(f.local.values.settingsSyncState).toMatchObject({ confirm: true });
  });
  it('cancels A pending writes and applies B remote values without filling missing fields', async () => {
    const f = fixture(localSettings({ width: 70 }));
    await f.c.initialize();
    await f.c.changed({ width: 75 });
    f.identity.value = 'B';
    f.sync.values = { [syncPrefix + 'width']: 95 };
    await f.c.accountChanged();
    await f.c.flush();
    expect(settings(f.local).width).toBe(95);
    expect(f.sync.set).not.toHaveBeenCalled();
    expect(JSON.stringify(f.local.values)).not.toContain('"B"');
  });
  it('does not let a queued native bookmark event recreate an outbox after account invalidation', async () => {
    const f = fixture({ rootFolderId: 'b' });
    await f.c.initialize();
    await f.c.selectFolder('b');
    await f.c.flush();
    f.sync.set.mockClear();
    f.bookmarks.value[0]!.children![0]!.children![0]!.title = 'A renamed';
    const staleEvent = f.c.bookmarksChanged('a');
    f.identity.value = 'B';
    f.sync.values = {};
    const switched = f.c.accountChanged();
    await staleEvent;
    await switched;
    await f.c.flush();
    expect(f.sync.set).not.toHaveBeenCalled();
  });
  it('one-time confirmation reads late cloud data again and uploads only missing settings', async () => {
    const f = fixture({ ...localSettings({ width: 70, space: 12 }) });
    await f.c.initialize();
    f.sync.values[syncPrefix + 'width'] = 95;
    await f.c.confirmLocal(true);
    await f.c.flush();
    expect(settings(f.local)).toMatchObject({ width: 95, space: 12 });
    expect(f.sync.values[syncPrefix + 'width']).toBe(95);
    expect(f.sync.values[syncPrefix + 'space']).toBe(12);
    expect(f.local.values.settingsSyncState).toMatchObject({ confirm: false });
  });
  it('confirmation cancels an older queued value when the cloud field already exists', async () => {
    const f = fixture({ ...localSettings({ width: 70 }) });
    await f.c.initialize();
    await f.c.changed({ width: 75 });
    f.sync.values[syncPrefix + 'width'] = 95;
    await f.c.confirmLocal(true);
    await f.c.flush();
    expect(f.sync.values[syncPrefix + 'width']).toBe(95);
  });
  it('does not upload unconfirmed settings after a failed cloud read and restart', async () => {
    const first = fixture(localSettings({ width: 70 }));
    first.sync.get.mockRejectedValueOnce(new Error('offline'));
    await first.c.initialize();
    const restarted = fixture(structuredClone(first.local.values), {}, 'B');
    await restarted.c.initialize();
    await restarted.c.flush();
    expect(restarted.sync.set).not.toHaveBeenCalled();
    expect(restarted.local.values.settingsSyncState).toMatchObject({ confirm: true });
  });
  it('safe-default confirmation preserves cloud values and selected folder', async () => {
    const locator = locateFolder(tree(), 'a')!;
    const f = fixture(
      { ...localSettings({ width: 70, space: 12 }) },
      { [syncPrefix + 'width']: 95, [folderKey]: locator },
    );
    await f.c.initialize();
    await f.c.confirmLocal(false);
    await f.c.flush();
    expect(settings(f.local)).toMatchObject({ width: 95, space: defaults.space });
    expect(f.sync.values[folderKey]).toEqual(locator);
  });
  it('does not publish a delayed initialization from A after an observed account change', async () => {
    const f = fixture(localSettings({ width: 70 }));
    let release!: (values: Record<string, unknown>) => void;
    f.sync.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const init = f.c.initialize();
    while (!release) await Promise.resolve();
    f.identity.value = 'B';
    f.sync.values = { [syncPrefix + 'width']: 95 };
    const switched = f.c.accountChanged();
    release({ [syncPrefix + 'width']: 75 });
    await init;
    await switched;
    await f.c.flush();
    expect(settings(f.local).width).toBe(95);
    expect(f.sync.set).not.toHaveBeenCalled();
  });
});

function firefoxTree(): BookmarkNode[] {
  return [
    {
      id: 'root________',
      title: '',
      children: [
        {
          id: 'unfiled_____',
          parentId: 'root________',
          title: 'Other bookmarks',
          children: [{ id: 'workFolder01', parentId: 'unfiled_____', title: 'Work', children: [] }],
        },
      ],
    },
  ];
}
describe('native Firefox folder synchronization', () => {
  it('identifies roots without Chrome fields and uses native GUIDs', () => {
    const locator = locateFolder(firefoxTree(), 'workFolder01')!;
    expect(locator).toEqual({
      version: 1,
      anchor: { folderType: 'other', browser: 'firefox' },
      path: ['Work'],
      guid: 'workFolder01',
    });
    expect(validLocator(locator)).toBe(true);
    expect(resolveFolder(firefoxTree(), locator)).toBe('workFolder01');
    for (const id of ['menu________', 'toolbar_____', 'unfiled_____', 'mobile______']) {
      const nodes = [
        {
          id: 'root________',
          title: '',
          children: [{ id, parentId: 'root________', title: 'Localized root', children: [] }],
        },
      ];
      const root = locateFolder(nodes, id)!;
      expect(validLocator(root)).toBe(true);
      expect(resolveFolder(nodes, root)).toBe(id);
    }
  });
  it('follows the GUID after native renames and never guesses same-named folders', () => {
    const locator = locateFolder(firefoxTree(), 'workFolder01')!,
      other = firefoxTree();
    other[0]!.children![0]!.children![0]!.id = 'fakeFolder01';
    expect(resolveFolder(other, locator)).toBeNull();
    other[0]!.children![0]!.children!.push({
      id: 'workFolder01',
      parentId: 'unfiled_____',
      title: 'Renamed',
      children: [],
    });
    expect(resolveFolder(other, locator)).toBe('workFolder01');
  });
  it('rejects malformed, cross-platform and unanchored GUIDs', () => {
    const locator = locateFolder(firefoxTree(), 'workFolder01')!;
    for (const bad of [
      { ...locator, guid: 'bad' },
      { ...locator, anchor: { ...locator.anchor, syncing: true } },
      { ...locator, anchor: { folderType: 'other' } },
      { ...locator, profile: 'private' },
    ])
      expect(validLocator(bad)).toBe(false);
    expect(resolveFolder(tree(), locator)).toBeNull();
    const nodes = firefoxTree();
    nodes[0]!.children![0]!.unmodifiable = 'managed';
    expect(resolveFolder(nodes, locator)).toBeNull();
  });
  it('waits for bookmarks delivery then restores the exact folder without echoing data', async () => {
    const locator = locateFolder(firefoxTree(), 'workFolder01')!;
    const f = fixture({ rootFolderId: 'unfiled_____' }, { [folderKey]: locator }, null);
    f.bookmarks.value = firefoxTree();
    f.bookmarks.value[0]!.children![0]!.children![0]!.id = 'fakeFolder01';
    await f.c.initialize();
    expect(f.local.values.rootFolderId).toBe('unfiled_____');
    expect(formatMessage((f.local.values.settingsSyncState as SyncState).folder)).toContain(
      'Firefox',
    );
    f.bookmarks.value = firefoxTree();
    await f.c.bookmarksChanged('workFolder01');
    await f.c.flush();
    expect(f.local.values.rootFolderId).toBe('workFolder01');
    expect(f.sync.set).not.toHaveBeenCalled();
  });
  it('uses the same confirmation and per-field writes without browser account identity', async () => {
    const f = fixture(
      { settings: { value: { ...defaults, width: 70, space: 12 } }, rootFolderId: 'workFolder01' },
      { [syncPrefix + 'width']: 95 },
      null,
    );
    f.bookmarks.value = firefoxTree();
    await f.c.initialize();
    expect(f.local.values.settingsSyncState).toMatchObject({ confirm: true });
    expect(f.sync.set).not.toHaveBeenCalled();
    await f.c.confirmLocal(true);
    await f.c.flush();
    expect(f.sync.values[syncPrefix + 'width']).toBe(95);
    expect(f.sync.values[syncPrefix + 'space']).toBe(12);
    expect(f.sync.values[folderKey]).toEqual(locateFolder(firefoxTree(), 'workFolder01'));
    f.bookmarks.value[0]!.children![0]!.children![0]!.title = 'Renamed';
    await f.c.bookmarksChanged('workFolder01');
    await f.c.flush();
    expect(f.sync.values[folderKey]).toMatchObject({ guid: 'workFolder01', path: ['Renamed'] });
  });
});

it('applies remote weather settings without uploading them again', async () => {
  const f = fixture(localSettings());
  await f.c.initialize();
  f.sync.set.mockClear();
  await f.c.remote({
    [syncPrefix + 'weatherEnabled']: { newValue: true },
    [syncPrefix + 'weatherCity']: { newValue: 'saint-petersburg' },
    [syncPrefix + 'weatherProvider']: { newValue: 'gismeteo' },
  });
  await f.c.flush();
  expect(settings(f.local)).toMatchObject({
    weatherEnabled: true,
    weatherCity: 'saint-petersburg',
    weatherProvider: 'gismeteo',
  });
  expect(f.sync.set).not.toHaveBeenCalled();
});

it('applies independent mail choices including explicit opt-out without echo', async () => {
  const f = fixture(localSettings({ mailruEnabled: true }));
  await f.c.initialize();
  f.sync.set.mockClear();
  await f.c.remote({
    [syncPrefix + 'mailruEnabled']: { newValue: false },
    [syncPrefix + 'gmailEnabled']: { newValue: true },
    [syncPrefix + 'yandexMailEnabled']: { newValue: true },
  });
  await f.c.flush();
  expect(settings(f.local)).toMatchObject({
    mailruEnabled: false,
    gmailEnabled: true,
    yandexMailEnabled: true,
  });
  expect(f.sync.set).not.toHaveBeenCalled();
  await f.c.remote({ [syncPrefix + 'mailruEnabled']: { newValue: null } });
  await f.c.flush();
  expect(settings(f.local).mailruEnabled).toBe(false);
});

it('retires saved mail addresses while retaining unrelated local preferences', async () => {
  const f = fixture(
    localSettings({ email: 'retired@mail.ru', mailruEnabled: true, width: 75, theme: 'dark' }),
    { [syncPrefix + 'email']: 'retired@mail.ru' },
  );
  await f.c.initialize();
  expect(settings(f.local)).toMatchObject({ mailruEnabled: true, width: 75, theme: 'dark' });
  expect(settings(f.local)).not.toHaveProperty('email');
  expect(f.sync.values).not.toHaveProperty(syncPrefix + 'email');
  expect(f.sync.set).not.toHaveBeenCalled();
});

it('applies a remotely selected language without echoing the setting', async () => {
  const f = fixture(localSettings());
  await f.c.initialize();
  f.sync.set.mockClear();
  await f.c.remote({ [syncPrefix + 'language']: { newValue: 'es' } });
  await f.c.flush();
  expect(settings(f.local).language).toBe('es');
  expect(f.sync.set).not.toHaveBeenCalled();
});
