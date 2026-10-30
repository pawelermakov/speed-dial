import { describe, expect, it, vi } from 'vitest';
import { createSyncClient } from '../services/client';
import type { SettingsSyncMessage } from '../entities/messages';
describe('per-application sync client', () => {
  it('flushes its own writes without waiting for another application queue', async () => {
    let finish!: () => void;
    const send = vi.fn(async (message: SettingsSyncMessage) => {
      if (message.action === 'patch')
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
    });
    const transport = { send, unavailable: async () => {} };
    const first = createSyncClient(transport),
      second = createSyncClient(transport);
    const write = first('patch', { width: 80 });
    const flush = first('flush');
    await second('flush');
    expect(send.mock.calls.filter(([message]) => message.action === 'flush')).toHaveLength(1);
    finish();
    await write;
    await flush;
    expect(send.mock.calls.filter(([message]) => message.action === 'flush')).toHaveLength(2);
  });
  it('keeps transport and status-storage failures non-fatal to local settings', async () => {
    const unavailable = vi.fn(async () => {
      throw new Error('status unavailable');
    });
    const client = createSyncClient({
      send: async () => {
        throw new Error('runtime unavailable');
      },
      unavailable,
    });
    await expect(client('patch', { space: 12 })).resolves.toBeUndefined();
    await expect(client('flush')).resolves.toBeUndefined();
    expect(unavailable).toHaveBeenCalledWith({
      key: 'sync.errors.unavailable_saved_locally',
      params: {},
    });
  });
});
