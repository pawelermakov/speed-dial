import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUpdatesChannel } from './updates';
import type { DialUpdate } from '../services/interfaces';
afterEach(() => vi.unstubAllGlobals());
describe('updates channel lifecycle', () => {
  it('accepts existing messages, unsubscribes and cannot publish after disposal', () => {
    const close = vi.fn(),
      post = vi.fn();
    let receive: ((event: { data: unknown }) => void) | null = null;
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor(readonly name: string) {
          expect(name).toBe('speed-dial-updates');
        }
        set onmessage(value: typeof receive) {
          receive = value;
        }
        postMessage = post;
        close = close;
      },
    );
    const channel = createUpdatesChannel();
    const messages: DialUpdate[] = [];
    const stop = channel.subscribe((message) => messages.push(message));
    const send = (data: unknown) => {
      if (receive) receive({ data });
    };
    send('updated');
    send({ type: 'updated', assets: true });
    send({ type: 'updated', background: true });
    send({ type: 'other' });
    expect(messages).toEqual([
      'updated',
      { type: 'updated', assets: true },
      { type: 'updated', background: true },
    ]);
    stop();
    send({ type: 'updated' });
    expect(messages).toHaveLength(3);
    channel.publish({ type: 'updated' });
    expect(post).toHaveBeenCalledTimes(1);
    const listener = vi.fn();
    channel.subscribe(listener);
    channel.dispose();
    channel.dispose();
    send('updated');
    channel.publish({ type: 'updated' });
    expect(listener).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
