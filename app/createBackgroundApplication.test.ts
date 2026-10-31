import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackgroundApplication } from './createBackgroundApplication';
const state = vi.hoisted(() => {
  const event = () => {
    const listeners = new Set<(...args: unknown[]) => unknown>();
    return {
      listeners,
      addListener: (fn: (...args: unknown[]) => unknown) => {
        listeners.add(fn);
      },
      removeListener: (fn: (...args: unknown[]) => unknown) => {
        listeners.delete(fn);
      },
      emit: (...args: unknown[]) => listeners.forEach((fn) => fn(...args)),
    };
  };
  return {
    event,
    changed: event(),
    removed: event(),
    connected: event(),
    close: vi.fn(),
    stopSync: vi.fn(),
    invalidate: vi.fn(async () => {}),
    capture:
      vi.fn<
        (request: unknown, origin: number, signal: AbortSignal) => Promise<{ requestId: string }>
      >(),
  };
});
vi.mock('wxt/browser', () => ({
  browser: {
    bookmarks: { onChanged: state.changed, onRemoved: state.removed },
    runtime: {
      id: 'self',
      getURL: (path: string) => 'extension://self' + path,
      onConnect: state.connected,
    },
  },
}));
vi.mock('../shared/infrastructure/database', () => ({
  DialDatabase: class {
    autoNames = { delete: vi.fn(async () => {}) };
    close = state.close;
  },
}));
vi.mock('../modules/dial/modules/sync/adapters/background', () => ({
  startSettingsSync: () => ({ dispose: state.stopSync }),
}));
vi.mock('../modules/dial/modules/capture/adapters/browserCapture', () => ({
  createCaptureQueue: () => state.capture,
}));
vi.mock('../modules/dial/modules/bookmarks/adapters/autoNames', () => ({
  AutoNameStore: class {
    invalidate = state.invalidate;
  },
}));
const applications: Array<ReturnType<typeof createBackgroundApplication>> = [];
function port(
  overrides: Partial<{
    name: string;
    sender: { id: string; url: string; tab: { id: number } };
  }> = {},
) {
  return {
    name: 'speed-dial-capture',
    sender: { id: 'self', url: 'extension://self/newtab.html', tab: { id: 7 } },
    onMessage: state.event(),
    onDisconnect: state.event(),
    postMessage: vi.fn(),
    ...overrides,
  };
}
beforeEach(() => {
  state.changed.listeners.clear();
  state.removed.listeners.clear();
  state.connected.listeners.clear();
  state.capture.mockReset().mockResolvedValue({ requestId: 'r' });
  state.close.mockClear();
  state.stopSync.mockClear();
});
afterEach(() => applications.splice(0).forEach((application) => application.dispose()));
describe('background application lifecycle', () => {
  it('preserves capture sender checks and accepts only one valid request per connection', async () => {
    const app = createBackgroundApplication();
    applications.push(app);
    for (const bad of [
      port({ name: 'other' }),
      port({ sender: { id: 'other', url: 'extension://self/newtab.html', tab: { id: 7 } } }),
      port({ sender: { id: 'self', url: 'https://example.com/', tab: { id: 7 } } }),
    ]) {
      state.connected.emit(bad);
      bad.onMessage.emit({ type: 'capture', requestId: 'r', url: 'https://example.com/' });
      expect(bad.onMessage.listeners.size).toBe(0);
    }
    const good = port();
    state.connected.emit(good);
    good.onMessage.emit(null);
    good.onMessage.emit({ type: 'capture', requestId: 42, url: 'https://example.com/' });
    const request = { type: 'capture', requestId: 'r', url: 'https://example.com/' };
    good.onMessage.emit(request);
    good.onMessage.emit(request);
    await vi.dynamicImportSettled();
    expect(state.capture).toHaveBeenCalledTimes(1);
    expect(state.capture).toHaveBeenCalledWith(request, 7, expect.any(AbortSignal));
    expect(good.postMessage).toHaveBeenCalledWith({ requestId: 'r' });
    good.onDisconnect.emit();
    expect(good.onMessage.listeners.size).toBe(0);
    expect(good.onDisconnect.listeners.size).toBe(0);
  });
  it('aborts active captures, suppresses late replies and removes all subscriptions on disposal', async () => {
    let finish!: (value: { requestId: string }) => void;
    state.capture.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const app = createBackgroundApplication();
    applications.push(app);
    const active = port();
    state.connected.emit(active);
    active.onMessage.emit({ type: 'capture', requestId: 'r', url: 'https://example.com/' });
    await vi.dynamicImportSettled();
    const signal = state.capture.mock.calls[0]![2];
    expect(signal.aborted).toBe(false);
    app.dispose();
    app.dispose();
    expect(signal.aborted).toBe(true);
    finish({ requestId: 'r' });
    await Promise.resolve();
    expect(active.postMessage).not.toHaveBeenCalled();
    expect(active.onMessage.listeners.size).toBe(0);
    expect(active.onDisconnect.listeners.size).toBe(0);
    expect(state.changed.listeners.size).toBe(0);
    expect(state.removed.listeners.size).toBe(0);
    expect(state.connected.listeners.size).toBe(0);
    expect(state.close).toHaveBeenCalledTimes(1);
    expect(state.stopSync).toHaveBeenCalledTimes(1);
  });
  it('does not start capture after disconnect while preparing the handler', async () => {
    let finish!: (capture: typeof state.capture) => void;
    const loader = vi.fn(
      () =>
        new Promise<typeof state.capture>((resolve) => {
          finish = resolve;
        }),
    );
    const app = createBackgroundApplication(loader);
    applications.push(app);
    const waiting = port();
    state.connected.emit(waiting);
    waiting.onMessage.emit({ type: 'capture', requestId: 'r', url: 'https://example.com/' });
    await Promise.resolve();
    waiting.onDisconnect.emit();
    finish(state.capture);
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    await Promise.resolve();
    expect(state.capture).not.toHaveBeenCalled();
    expect(waiting.postMessage).not.toHaveBeenCalled();
  });
  it('shares the capture handler and retries failed initialization', async () => {
    const loader = vi
      .fn<() => Promise<typeof state.capture>>()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValue(state.capture);
    const app = createBackgroundApplication(loader);
    applications.push(app);
    const first = port();
    state.connected.emit(first);
    first.onMessage.emit({ type: 'capture', requestId: 'r', url: 'https://example.com/' });
    await vi.waitFor(() => expect(first.postMessage).toHaveBeenCalled());
    expect(state.capture).not.toHaveBeenCalled();
    for (let index = 0; index < 2; index++) {
      const next = port();
      state.connected.emit(next);
      next.onMessage.emit({ type: 'capture', requestId: 'r', url: 'https://example.com/' });
      await vi.waitFor(() => expect(next.postMessage).toHaveBeenCalled());
    }
    expect(loader).toHaveBeenCalledTimes(2);
    expect(state.capture).toHaveBeenCalledTimes(2);
  });
});
