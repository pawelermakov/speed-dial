import { formatMessage } from '../services/i18n';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { watch } from 'vue';
import type { DialDependencies, DialUpdate } from '../modules/dial';
import { useDial } from '../modules/dial/composables/useDial';
import { defaults } from '../modules/dial/modules/settings';
const state = vi.hoisted(() => ({
  mounted: [] as Array<() => Promise<void>>,
  unmounted: [] as Array<() => void>,
  listeners: new Set<() => void>(),
  updates: new Set<(message: DialUpdate) => void>(),
  background: vi.fn(),
  load: vi.fn(),
  initialize: vi.fn(),
  post: vi.fn(),
}));
vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
    onMounted: (callback: () => Promise<void>) => state.mounted.push(callback),
    onUnmounted: (callback: () => void) => state.unmounted.push(callback),
  };
});

let source: DialDependencies['bookmarks']['source'];
let actions: DialDependencies['bookmarks']['actions'];
let preferences: DialDependencies['preferences'];
let appearance: DialDependencies['appearance'];
let snapshots: DialDependencies['snapshots'];
let dependencies: DialDependencies;
const broadcast = (message: DialUpdate) => state.updates.forEach((listener) => listener(message));
const snapshot = (title: string) => ({
  tabs: [
    {
      id: 'x',
      parentId: 'root',
      title,
      url: 'https://example.com/',
      index: 0,
      favicon: null,
      thumbnail: null,
    },
  ],
  folders: [],
  rootId: 'root',
  activeId: 'root',
  settings: defaults,
  background: null,
});
beforeEach(() => {
  vi.useFakeTimers();
  state.mounted.length = 0;
  state.unmounted.length = 0;
  state.listeners.clear();
  state.updates.clear();
  state.background.mockReset().mockResolvedValue(null);
  state.load.mockReset().mockResolvedValue(snapshot('Initial'));
  state.initialize.mockReset().mockResolvedValue(undefined);
  source = { rootId: null, selectRoot: vi.fn(async () => {}), adoptRoot: vi.fn(async () => {}) };
  actions = { cache: vi.fn(async () => {}) };
  snapshots = { load: state.load, initialize: state.initialize };
  preferences = { patchSettings: vi.fn(async (patch) => ({ ...defaults, ...patch })) };
  appearance = { save: vi.fn(async () => {}) };
  dependencies = {
    bookmarks: { source, actions },
    snapshots,
    preferences,
    appearance,
    settings: {
      getValue: vi.fn(async () => ({ value: defaults })),
      setValue: vi.fn(async () => {}),
    },
    root: {
      getValue: vi.fn(async () => null),
      setValue: vi.fn(async () => {}),
      watch: vi.fn(() => () => {}),
    },
    lock: async (job) => job(),
    syncRequest: vi.fn(async () => {}),
    readBackground: state.background,
    faviconBlob: vi.fn(async () => null),
    events: {
      available: true,
      subscribe(listener) {
        const notify = () => listener(false);
        state.listeners.add(notify);
        return () => {
          state.listeners.delete(notify);
        };
      },
      dispose: vi.fn(),
    },
    updates: {
      publish: state.post,
      subscribe(listener) {
        state.updates.add(listener);
        return () => {
          state.updates.delete(listener);
        };
      },
      dispose: vi.fn(),
    },
  };
});
afterEach(() => {
  state.unmounted.forEach((callback) => callback());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('browser event refresh lifecycle', () => {
  it('publishes a refreshed snapshot once so synchronous search watchers do not run twice', async () => {
    const dial = useDial(dependencies);
    await state.mounted[0]!();
    const changed = vi.fn();
    const stop = watch(dial.snapshot, changed, { flush: 'sync' });
    state.load.mockResolvedValue(snapshot('Updated'));
    await dial.refresh();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(dial.snapshot.value.tabs[0]?.title).toBe('Updated');
    stop();
  });
  it('refreshes asset-only broadcasts without invalidating a drag, but invalidates structural updates', async () => {
    const dial = useDial(dependencies);
    await state.mounted[0]!();
    state.load.mockClear();
    broadcast({ type: 'updated', assets: true });
    await vi.advanceTimersByTimeAsync(60);
    expect(state.load).toHaveBeenCalled();
    expect(dial.revision.value).toBe(0);
    broadcast({ type: 'updated' });
    expect(dial.revision.value).toBe(1);
    [...state.listeners][0]!();
    expect(dial.revision.value).toBe(2);
  });

  it('loads wallpaper while bookmark initialization is still pending', async () => {
    const blob = new Blob(['wallpaper']);
    state.background.mockResolvedValue(blob);
    let finish!: () => void;
    state.initialize.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const dial = useDial(dependencies),
      startup = state.mounted[0]!();
    await vi.advanceTimersByTimeAsync(0);
    expect(dial.loading.value).toBe(true);
    expect(dial.snapshot.value.background).toBe(blob);
    expect(state.load).not.toHaveBeenCalled();
    finish();
    await startup;
  });
  it('ignores an obsolete wallpaper startup read after a complete refresh', async () => {
    let finish!: (value: Blob) => void;
    state.background.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const current = new Blob(['current']);
    state.load.mockResolvedValue({ ...snapshot('Initial'), background: current });
    const dial = useDial(dependencies);
    await state.mounted[0]!();
    finish(new Blob(['old']));
    await Promise.resolve();
    expect(dial.snapshot.value.background).toBe(current);
  });
  it('saves current fields and rolls back failed writes', async () => {
    const dial = useDial(dependencies);
    await state.mounted[0]!();
    preferences.patchSettings = vi.fn().mockResolvedValue({ ...defaults, width: 75 });
    expect(await dial.updateSettings({ width: 75 })).toBe(true);
    expect(preferences.patchSettings).toHaveBeenCalledWith({ width: 75 });
    preferences.patchSettings = vi.fn().mockRejectedValue(new Error('write denied'));
    expect(await dial.updateSettings({ space: 12 })).toBe(false);
    expect(dial.snapshot.value.settings.space).toBe(defaults.space);
  });
  it('a failed background write preserves the current image and exposes a persistent error', async () => {
    const initial = { ...snapshot('Initial'), background: new Blob(['old image']) };
    state.load.mockResolvedValueOnce(initial);
    const dial = useDial(dependencies);
    await state.mounted[0]!();
    appearance.save = vi.fn().mockRejectedValue(new Error('disk full'));
    expect(await dial.changeBackground(new Blob(['new image']))).toBe(false);
    expect(dial.snapshot.value.background).toBe(initial.background);
    expect(formatMessage(dial.settingErrors.value.background)).toContain('Фон');
  });
  it('does not let an earlier failed field write undo a later edit or unrelated fields', async () => {
    const dial = useDial(dependencies);
    await state.mounted[0]!();
    let rejectOld!: (error: Error) => void;
    preferences.patchSettings = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectOld = reject;
          }),
      )
      .mockResolvedValueOnce({ ...defaults, width: 90, space: 12 });
    const old = dial.updateSettings({ width: 80 });
    const latest = dial.updateSettings({ width: 90, space: 12 });
    await latest;
    rejectOld(new Error('old failure'));
    await old;
    expect(dial.snapshot.value.settings).toMatchObject({ width: 90, space: 12 });
    expect(dial.settingErrors.value).toEqual({});
  });
  it('rolls a failed latest field back and retains its named error', async () => {
    const dial = useDial(dependencies);
    await state.mounted[0]!();
    preferences.patchSettings = vi.fn().mockRejectedValue(new Error('storage failed'));
    expect(await dial.updateSettings({ width: 80 })).toBe(false);
    expect(dial.snapshot.value.settings.width).toBe(100);
    expect(formatMessage(dial.settingErrors.value.width)).toContain('Ширина');
    state.load.mockClear();
    await dial.refresh();
    expect(state.load).toHaveBeenCalledWith(false);
  });
  it('saves the search provider without reloading assets or disabling the page', async () => {
    const save = vi.fn(async (patch: Partial<typeof defaults>) => ({ ...defaults, ...patch }));
    preferences.patchSettings = save;
    const dial = useDial(dependencies);
    await state.mounted[0]!();
    const before = dial.snapshot.value;
    state.load.mockClear();
    const pending = dial.changeSearchProvider('google');
    expect(dial.busy.value).toBe(false);
    expect(await pending).toBe(true);
    expect(save).toHaveBeenCalledWith({ searchProvider: 'google' });
    expect(state.load).not.toHaveBeenCalled();
    expect(dial.snapshot.value.tabs).toBe(before.tabs);
    expect(dial.snapshot.value.background).toBe(before.background);
    expect(dial.snapshot.value.settings.searchProvider).toBe('google');
    save.mockRejectedValueOnce(new Error('write failed'));
    expect(await dial.changeSearchProvider('imdb')).toBe(false);
    expect(dial.snapshot.value.settings.searchProvider).toBe('google');
    expect(state.load).not.toHaveBeenCalled();
  });
  it('disabling bookmark search saves its web fallback with the same patch', async () => {
    const dial = useDial(dependencies);
    await state.mounted[0]!();
    dial.snapshot.value = {
      ...dial.snapshot.value,
      settings: { ...defaults, searchProvider: 'bookmarks' },
    };
    const save = vi.fn(async (patch: Partial<typeof defaults>) => ({ ...defaults, ...patch }));
    preferences.patchSettings = save;
    await dial.updateSettings({ bookmarkSearch: false });
    expect(save).toHaveBeenCalledWith({ bookmarkSearch: false, searchProvider: 'yandex' });
    expect(dial.snapshot.value.settings).toMatchObject({
      bookmarkSearch: false,
      searchProvider: 'yandex',
    });
  });
  it.each(['kinopoisk', 'imdb', 'myshows'] as const)(
    'disabling movie search saves a fallback for %s',
    async (searchProvider) => {
      const dial = useDial(dependencies);
      await state.mounted[0]!();
      dial.snapshot.value = {
        ...dial.snapshot.value,
        settings: { ...defaults, movieSearch: true, searchProvider },
      };
      const save = vi.fn(async (patch: Partial<typeof defaults>) => ({ ...defaults, ...patch }));
      preferences.patchSettings = save;
      await dial.updateSettings({ movieSearch: false });
      expect(save).toHaveBeenCalledWith({ movieSearch: false, searchProvider: 'yandex' });
    },
  );
  it('coalesces fast bookmark events and unsubscribes on teardown', async () => {
    const dial = useDial(dependencies);
    await state.mounted[0]!();
    state.load.mockClear().mockResolvedValue(snapshot('External'));
    for (let i = 0; i < 15; i++) state.listeners.forEach((callback) => callback());
    await vi.advanceTimersByTimeAsync(65);
    expect(state.load).toHaveBeenCalledTimes(1);
    expect(dial.snapshot.value.tabs[0]?.title).toBe('External');
    state.unmounted.forEach((callback) => callback());
    expect(state.listeners.size).toBe(0);
  });
  it('slow older reads cannot overwrite a newer view', async () => {
    const dial = useDial(dependencies);
    await state.mounted[0]!();
    let resolveOld!: (value: ReturnType<typeof snapshot>) => void;
    state.load
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(snapshot('New'));
    const old = dial.refresh();
    await dial.refresh();
    resolveOld(snapshot('Old'));
    await old;
    expect(dial.snapshot.value.tabs[0]?.title).toBe('New');
  });
  it('mutation failure rereads actual browser state', async () => {
    const dial = useDial(dependencies);
    await state.mounted[0]!();
    state.load.mockResolvedValue(snapshot('Actual'));
    expect(
      await dial.run(async () => {
        throw new Error('move failed');
      }),
    ).toBe(false);
    expect(dial.snapshot.value.tabs[0]?.title).toBe('Actual');
    expect(dial.notice.value).toBe('move failed');
  });
  it('does not publish a read after unmount', async () => {
    const dial = useDial(dependencies);
    await state.mounted[0]!();
    let finish!: (value: ReturnType<typeof snapshot>) => void;
    state.load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = dial.refresh();
    state.unmounted.forEach((callback) => callback());
    finish(snapshot('Late'));
    await pending;
    expect(dial.snapshot.value.tabs[0]?.title).toBe('Initial');
  });
  it('keeps two injected applications independent', async () => {
    const other = {
      ...dependencies,
      snapshots: { ...snapshots, load: vi.fn(async () => snapshot('Second')) },
    };
    const first = useDial(dependencies),
      second = useDial(other);
    await state.mounted[0]!();
    await state.mounted[1]!();
    expect(first.snapshot.value.tabs[0]?.title).toBe('Initial');
    expect(second.snapshot.value.tabs[0]?.title).toBe('Second');
    state.load.mockResolvedValue(snapshot('First changed'));
    await first.refresh();
    expect(second.snapshot.value.tabs[0]?.title).toBe('Second');
  });
  it('does not initialize after disposal while waiting for sync', async () => {
    let finish!: () => void;
    dependencies.syncRequest = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    useDial(dependencies);
    const startup = state.mounted[0]!();
    state.unmounted.forEach((callback) => callback());
    finish();
    await startup;
    expect(state.initialize).not.toHaveBeenCalled();
    expect(state.load).not.toHaveBeenCalled();
    expect(state.listeners.size).toBe(0);
    expect(state.updates.size).toBe(0);
  });
  it('unsubscribes storage and ignores a settings read completed after teardown', async () => {
    let changed!: () => void, finish!: (value: { value: typeof defaults }) => void;
    const stopSettings = vi.fn(),
      stopRoot = vi.fn();
    dependencies.settings.watch = (listener) => {
      changed = () => listener(null);
      return stopSettings;
    };
    dependencies.root.watch = () => stopRoot;
    const dial = useDial(dependencies);
    await state.mounted[0]!();
    dependencies.settings.getValue = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    changed();
    state.unmounted.forEach((callback) => callback());
    finish({ value: { ...defaults, width: 71 } });
    await Promise.resolve();
    await Promise.resolve();
    expect(dial.snapshot.value.settings.width).toBe(defaults.width);
    expect(stopSettings).toHaveBeenCalledTimes(1);
    expect(stopRoot).toHaveBeenCalledTimes(1);
  });
});
