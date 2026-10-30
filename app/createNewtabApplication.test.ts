import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import { createNewtabApplication } from './createNewtabApplication';
import { provideServices, useServices } from './serviceContext';
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
vi.mock('../shared/infrastructure/database', () => ({
  DialDatabase: class {
    assets = { get: async () => undefined };
    close = vi.fn();
    constructor() {
      state.databases.push(this);
    }
  },
}));
const applications: Array<ReturnType<typeof createNewtabApplication>> = [];
beforeEach(() => {
  state.changed.listeners.clear();
  state.tabs.listeners.clear();
  state.databases.length = 0;
  state.channels.length = 0;
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
    expect(first.repository).not.toBe(second.repository);
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
    expect(await second.readBackground()).toBe(null);
    second.dispose();
    expect(state.changed.listeners.size).toBe(0);
    expect(state.tabs.listeners.size).toBe(0);
  });
});
