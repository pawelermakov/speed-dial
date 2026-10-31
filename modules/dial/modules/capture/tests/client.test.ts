import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCaptureClient } from '../adapters/client';
const state = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: { runtime: { connect: state.connect } } }));
function event() {
  const listeners = new Set<(value: never) => void>();
  return {
    listeners,
    addListener: (fn: (value: never) => void) => listeners.add(fn),
    removeListener: (fn: (value: never) => void) => listeners.delete(fn),
    emit: (value: unknown) => listeners.forEach((fn) => fn(value as never)),
  };
}
function port() {
  return { onMessage: event(), onDisconnect: event(), postMessage: vi.fn(), disconnect: vi.fn() };
}
beforeEach(() => {
  vi.useFakeTimers();
  state.connect.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});
describe('capture client ports', () => {
  it('ignores other request IDs and cleans its connection on success', async () => {
    const connection = port();
    state.connect.mockReturnValue(connection);
    const client = createCaptureClient(),
      result = client.requestThumbnail('https://example.com/');
    const request = connection.postMessage.mock.calls[0]![0] as { requestId: string };
    connection.onMessage.emit({ requestId: 'other', thumbnail: 'data:image/jpeg;base64,YQ==' });
    expect(connection.disconnect).not.toHaveBeenCalled();
    connection.onMessage.emit({
      requestId: request.requestId,
      thumbnail: 'data:image/jpeg;base64,YQ==',
    });
    expect((await result).thumbnail.size).toBe(1);
    expect(connection.onMessage.listeners.size).toBe(0);
    expect(connection.onDisconnect.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    client.dispose();
    expect(connection.disconnect).toHaveBeenCalledTimes(1);
  });
  it('disconnects and rejects pending work on disposal', async () => {
    const connection = port();
    state.connect.mockReturnValue(connection);
    const client = createCaptureClient(),
      result = client.requestThumbnail('https://example.com/');
    const rejected = expect(result).rejects.toThrow();
    client.dispose();
    client.dispose();
    await rejected;
    expect(connection.disconnect).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await expect(client.requestThumbnail('https://example.com/')).rejects.toThrow();
    expect(state.connect).toHaveBeenCalledTimes(1);
  });
  it('includes queue time in its 45 second timeout', async () => {
    const connection = port();
    state.connect.mockReturnValue(connection);
    const client = createCaptureClient(),
      result = client.requestThumbnail('https://example.com/');
    const failure = expect(result).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(45000);
    await failure;
    expect(connection.onMessage.listeners.size).toBe(0);
    expect(connection.disconnect).toHaveBeenCalledTimes(1);
    client.dispose();
  });
  it('cleans a connection if posting a request fails', async () => {
    const connection = port();
    connection.postMessage.mockImplementation(() => {
      throw new Error('post failed');
    });
    state.connect.mockReturnValue(connection);
    const client = createCaptureClient();
    await expect(client.requestThumbnail('https://example.com/')).rejects.toThrow('post failed');
    expect(vi.getTimerCount()).toBe(0);
    expect(connection.onMessage.listeners.size).toBe(0);
    client.dispose();
  });
});
