import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { browser } from 'wxt/browser';
import { startSettingsSync } from '../../../../../services/syncBackground';
const state = vi.hoisted(() => ({
  initialize: vi.fn(async () => {}),
  retry: vi.fn(async () => {}),
  dispose: vi.fn(),
}));
vi.mock('../services/coordinator', () => ({
  SettingsSync: class {
    initialize = state.initialize;
    retry = state.retry;
    dispose = state.dispose;
  },
}));
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
  };
};
function api(get: () => Promise<Record<string, unknown>> = async () => ({})) {
  const events = Array.from({ length: 9 }, event);
  const value = {
    runtime: {
      id: 'self',
      getURL: (path: string) => 'extension://self' + path,
      onMessage: events[0],
    },
    storage: { local: { get }, sync: {}, onChanged: events[1] },
    bookmarks: {
      getTree: async () => [],
      onCreated: events[2],
      onRemoved: events[3],
      onChanged: events[4],
      onMoved: events[5],
      onImportEnded: events[6],
    },
    identity: { onSignInChanged: events[7] },
    tabs: { onActivated: events[8] },
    permissions: { contains: async () => false },
  };
  return { value: value as unknown as typeof browser, events };
}
beforeEach(() => {
  state.initialize.mockClear();
  state.retry.mockClear();
  state.dispose.mockClear();
});
describe('background sync subscriptions', () => {
  it('does not initialize after disposal while local storage is pending', async () => {
    let finish!: (value: Record<string, unknown>) => void;
    const storage = new Promise<Record<string, unknown>>((resolve) => {
      finish = resolve;
    });
    const fake = api(() => storage);
    const sync = startSettingsSync(fake.value, async (job) => job());
    expect(fake.events.every((event) => event.listeners.size === 1)).toBe(true);
    sync.dispose();
    sync.dispose();
    finish({});
    await storage;
    await Promise.resolve();
    expect(state.initialize).not.toHaveBeenCalled();
    expect(state.dispose).toHaveBeenCalledTimes(1);
    expect(fake.events.every((event) => event.listeners.size === 0)).toBe(true);
  });
  it('keeps sender checks and ignores messages after teardown', async () => {
    const fake = api(),
      sync = startSettingsSync(fake.value, async (job) => job());
    const receive = [...fake.events[0]!.listeners][0]!;
    const request = { type: 'settings-sync', action: 'retry' };
    expect(receive(request, { id: 'other', url: 'extension://self/newtab.html' })).toBeUndefined();
    expect(receive(request, { id: 'self', url: 'https://example.com/' })).toBeUndefined();
    await receive(request, { id: 'self', url: 'extension://self/newtab.html' });
    expect(state.initialize).toHaveBeenCalledTimes(1);
    expect(state.retry).toHaveBeenCalledTimes(1);
    sync.dispose();
    expect(receive(request, { id: 'self', url: 'extension://self/newtab.html' })).toBeUndefined();
    expect(state.retry).toHaveBeenCalledTimes(1);
  });
});
