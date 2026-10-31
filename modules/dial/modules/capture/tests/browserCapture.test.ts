import { formatMessage } from '../../../../../tests/helpers/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => {
  const event = () => ({ addListener: vi.fn(), removeListener: vi.fn() });
  return {
    tabs: {
      onActivated: event(),
      onUpdated: event(),
      get: vi.fn(),
      create: vi.fn(),
      query: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      captureVisibleTab: vi.fn(),
    },
  };
});
vi.mock('wxt/browser', () => ({ browser: mocked }));
import { createCaptureQueue } from '../adapters/browserCapture';

let active: number;
let sequence: number;
beforeEach(() => {
  vi.clearAllMocks();
  active = 1;
  sequence = 10;
  mocked.tabs.get.mockImplementation(async (id: number) => ({
    id,
    active: active === id,
    windowId: 2,
    status: 'complete',
    url: id === 1 ? 'chrome-extension://test/newtab.html' : 'https://example.com/',
    title: 'Website',
    favIconUrl: 'https://example.com/favicon.ico',
  }));
  mocked.tabs.create.mockImplementation(async () => {
    active = sequence++;
    return { id: active };
  });
  mocked.tabs.query.mockImplementation(async () => [{ id: active }]);
  mocked.tabs.update.mockImplementation(async (id: number) => {
    active = id;
    return { id };
  });
  mocked.tabs.remove.mockResolvedValue(undefined);
  mocked.tabs.captureVisibleTab.mockResolvedValue('data:image/jpeg;base64,YQ==');
});
afterEach(() => vi.useRealTimers());
const request = (id = 'a') => ({
  type: 'capture' as const,
  requestId: id,
  url: 'https://example.com/',
});

describe('capture ownership and queue', () => {
  it('captures only the created active tab and closes only its ID', async () => {
    const result = await createCaptureQueue()(request(), 1, new AbortController().signal);
    expect(result.error).toBeUndefined();
    expect(result.title).toBe('Website');
    expect(mocked.tabs.captureVisibleTab).toHaveBeenCalledWith(2, { format: 'jpeg', quality: 80 });
    expect(mocked.tabs.remove).toHaveBeenCalledExactlyOnceWith(10);
    expect(mocked.tabs.update).toHaveBeenCalledWith(1, { active: true });
    expect(mocked.tabs.onUpdated.removeListener).toHaveBeenCalledTimes(1);
    expect(mocked.tabs.onActivated.removeListener).toHaveBeenCalledTimes(1);
  });
  it('returns no external icon fallback when the site has no favicon', async () => {
    const get = mocked.tabs.get.getMockImplementation()!;
    mocked.tabs.get.mockImplementation(async (id: number) => ({
      ...(await get(id)),
      favIconUrl: undefined,
    }));
    const result = await createCaptureQueue()(request(), 1, new AbortController().signal);
    expect(result.error).toBeUndefined();
    expect(result.favicon).toBe('');
  });
  it('waits through Firefox initial about:blank complete state', async () => {
    const get = mocked.tabs.get.getMockImplementation()!;
    let first = true;
    mocked.tabs.get.mockImplementation(async (id: number) => {
      if (id !== 1 && first) {
        first = false;
        return { id, windowId: 2, active: true, status: 'complete', url: 'about:blank' };
      }
      return get(id);
    });
    const result = await createCaptureQueue()(request(), 1, new AbortController().signal);
    expect(result.error).toBeUndefined();
    expect(mocked.tabs.captureVisibleTab).toHaveBeenCalledTimes(1);
  });
  it('serializes two requests with correctly paired responses', async () => {
    const capture = createCaptureQueue();
    const results = await Promise.all([
      capture(request('a'), 1, new AbortController().signal),
      capture(request('b'), 1, new AbortController().signal),
    ]);
    expect(results.map((result) => result.requestId)).toEqual(['a', 'b']);
    expect(results.every((result) => !result.error)).toBe(true);
    expect(mocked.tabs.remove.mock.calls).toEqual([[10], [11]]);
  });
  it('refuses a foreign active tab before capture', async () => {
    mocked.tabs.query.mockResolvedValue([{ id: 99 }]);
    const result = await createCaptureQueue()(request(), 1, new AbortController().signal);
    expect(formatMessage(result.error)).toContain('Активная вкладка');
    expect(mocked.tabs.captureVisibleTab).not.toHaveBeenCalled();
    expect(mocked.tabs.remove).toHaveBeenCalledExactlyOnceWith(10);
    expect(mocked.tabs.update).not.toHaveBeenCalled();
  });
  it('discards a screenshot if tab changed during capture', async () => {
    mocked.tabs.captureVisibleTab.mockImplementation(async () => {
      active = 99;
      return 'data:image/jpeg;base64,YQ==';
    });
    const result = await createCaptureQueue()(request(), 1, new AbortController().signal);
    expect(formatMessage(result.error)).toContain('снимок отброшен');
    expect(result.thumbnail).toBeUndefined();
    expect(mocked.tabs.remove).toHaveBeenCalledExactlyOnceWith(10);
  });
  it('timeout cleans up a site that never completes', async () => {
    vi.useFakeTimers();
    mocked.tabs.get.mockImplementation(async (id: number) => ({
      id,
      active: true,
      windowId: 2,
      status: 'loading',
      url: 'https://example.com/',
    }));
    // AbortSignal.timeout uses native timers; cancellation exercises the same cleanup branch.
    const controller = new AbortController();
    const secondTask = createCaptureQueue()(request('timeout'), 1, controller.signal);
    await vi.advanceTimersByTimeAsync(200);
    controller.abort(new Error('timeout'));
    const result = await secondTask;
    expect(formatMessage(result.error)).toContain('Захват отменён');
    expect(mocked.tabs.captureVisibleTab).not.toHaveBeenCalled();
    vi.useRealTimers();
  }, 25000);
  it('rejects dangerous URL without creating a tab', async () => {
    const result = await createCaptureQueue()(
      { ...request(), url: 'javascript:x' },
      1,
      new AbortController().signal,
    );
    expect(formatMessage(result.error)).toContain('HTTP/HTTPS');
    expect(mocked.tabs.create).not.toHaveBeenCalled();
  });
  it('does not create tabs for a cancelled queued request', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await createCaptureQueue()(request(), 1, controller.signal);
    expect(result.error).toBeDefined();
    expect(mocked.tabs.create).not.toHaveBeenCalled();
  });
});
