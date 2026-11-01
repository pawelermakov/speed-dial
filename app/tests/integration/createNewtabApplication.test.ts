import { useMailService } from '../../modules/mail/context';
import { useSearchService } from '../../modules/search/context';
import { useSettingsServices } from '../../modules/settings/context';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import { createNewtabApplication } from '../../adapters/createNewtabApplication';
import { provideServices, useServices } from '../../composables/useServices';
const state = vi.hoisted(() => {
  const event = () => {
    const listeners = new Set<(...args: unknown[]) => unknown>();
    return {
      listeners,
      addListener: (listener: (...args: unknown[]) => unknown) => {
        listeners.add(listener);
      },
      removeListener: (listener: (...args: unknown[]) => unknown) => {
        listeners.delete(listener);
      },
      emit: (...args: unknown[]) => listeners.forEach((listener) => listener(...args)),
    };
  };
  return {
    changed: event(),
    tabs: event(),
    databases: [] as Array<{ close: () => void }>,
    channels: [] as Array<{ close: () => void }>,
    sync: vi.fn(async () => {}),
    captures: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
  };
});
vi.mock('wxt/browser', () => ({
  browser: {
    bookmarks: { onChanged: state.changed },
    tabs: { onUpdated: state.tabs },
    runtime: { getURL: (path: string) => 'extension://test/' + path },
  },
}));
vi.mock('wxt/utils/storage', () => ({
  storage: {
    defineItem: () => ({
      getValue: async () => null,
      setValue: async () => {},
      watch: () => () => {},
    }),
  },
}));
vi.mock('../../common/infrastructure/database', () => ({
  DialDatabase: class {
    assets = { get: async () => undefined };
    close = vi.fn();
    constructor() {
      state.databases.push(this);
    }
  },
}));
vi.mock('../../modules/bookmarks/adapters/api/captureClient', () => ({
  createCaptureClient: () => {
    const client = { requestThumbnail: vi.fn(), dispose: vi.fn() };
    state.captures.push(client);
    return client;
  },
}));
const applications: Array<ReturnType<typeof createNewtabApplication>> = [];
beforeEach(() => {
  state.changed.listeners.clear();
  state.tabs.listeners.clear();
  state.databases.length = 0;
  state.channels.length = 0;
  state.captures.length = 0;
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      onmessage = null;
      postMessage = vi.fn();
      close = vi.fn();
      constructor() {
        state.channels.push(this);
      }
    },
  );
});
afterEach(() => {
  applications.splice(0).forEach((application) => application.dispose());
  vi.unstubAllGlobals();
});
describe('newtab composition', () => {
  it('owns lazy capture resources per module and rejects capture after disposal', async () => {
    const first = createNewtabApplication(),
      second = createNewtabApplication();
    applications.push(first, second);
    const firstCapture = await first.bookmarks.capture(),
      secondCapture = await second.bookmarks.capture();
    expect(firstCapture).not.toBe(secondCapture);
    first.dispose();
    first.dispose();
    await expect(first.bookmarks.capture()).rejects.toMatchObject({ name: 'AbortError' });
    expect(await second.bookmarks.capture()).toBe(secondCapture);
    expect(state.captures[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(state.captures[1]!.dispose).not.toHaveBeenCalled();
  });
  it('isolates provided services and releases only the disposed instance resources', async () => {
    const first = createNewtabApplication(),
      second = createNewtabApplication();
    applications.push(first, second);
    const firstApp = createApp({ render: () => null }),
      secondApp = createApp({ render: () => null });
    provideServices(firstApp, first);
    provideServices(secondApp, second);
    expect(firstApp.runWithContext(useServices)).toBe(first);
    expect(secondApp.runWithContext(useServices)).toBe(second);
    expect(firstApp.runWithContext(useMailService)).toBe(first.mail);
    expect(secondApp.runWithContext(useMailService)).toBe(second.mail);
    expect(firstApp.runWithContext(useSearchService)).toBe(first.search);
    expect(secondApp.runWithContext(useSearchService)).toBe(second.search);
    expect(firstApp.runWithContext(useSettingsServices).sync).toBe(first.settings.sync);
    expect(secondApp.runWithContext(useSettingsServices).source).toBe(second.bookmarks.source);
    expect(first.bookmarks.source).not.toBe(second.bookmarks.source);
    const firstChanged = vi.fn(),
      secondChanged = vi.fn();
    first.events.subscribe(firstChanged);
    second.events.subscribe(secondChanged);
    state.changed.emit();
    expect(firstChanged).toHaveBeenLastCalledWith(false);
    expect(secondChanged).toHaveBeenLastCalledWith(false);
    state.tabs.emit(1, { favIconUrl: 'https://example.com/icon.png' });
    expect(firstChanged).toHaveBeenLastCalledWith(true);
    first.dispose();
    first.dispose();
    state.changed.emit();
    expect(firstChanged).toHaveBeenCalledTimes(2);
    expect(secondChanged).toHaveBeenCalledTimes(3);
    expect(state.databases[0]!.close).toHaveBeenCalledTimes(1);
    expect(state.databases[1]!.close).not.toHaveBeenCalled();
    expect(state.channels[0]!.close).toHaveBeenCalledTimes(1);
    expect(state.channels[1]!.close).not.toHaveBeenCalled();
    expect(await second.appearance.readStored()).toBeUndefined();
    second.dispose();
    expect(state.changed.listeners.size).toBe(0);
    expect(state.tabs.listeners.size).toBe(0);
  });
});
