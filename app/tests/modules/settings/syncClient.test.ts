import { describe, expect, it, vi } from 'vitest';
import { SettingsSyncService } from '../../../modules/settings/services/syncClient';
import type { SyncTransportPort } from '../../../modules/settings/services/interfaces';
import type { SettingsSyncMessage } from '../../../modules/settings/entities/syncMessages';
const createService = (transport: SyncTransportPort) =>
  new SettingsSyncService({
    transport,
    storage: { getValue: async () => null, watch: () => () => {} },
    accountStatus: async () => ({ status: 'unavailable', email: '' }),
  });

describe('per-application settings sync service', () => {
  it('waits for both setting and folder writes before sending flush', async () => {
    const pending = new Map<string, () => void>();
    const send = vi.fn(async (message: SettingsSyncMessage) => {
      if (message.action === 'patch' || message.action === 'folder')
        await new Promise<void>((resolve) => pending.set(message.action, resolve));
    });
    const service = createService({ send, unavailable: async () => {} });
    const settings = service.request('patch', { width: 80 });
    const folder = service.request('folder', 'other');
    const flush = service.request('flush');
    pending.get('patch')!();
    await settings;
    expect(send.mock.calls.map(([message]) => message.action)).toEqual(['patch', 'folder']);
    pending.get('folder')!();
    await folder;
    await flush;
    expect(send.mock.calls.map(([message]) => message.action)).toEqual([
      'patch',
      'folder',
      'flush',
    ]);
  });
  it('flushes its own writes without waiting for another application queue', async () => {
    let finish!: () => void;
    const send = vi.fn(async (message: SettingsSyncMessage) => {
      if (message.action === 'patch')
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
    });
    const transport = { send, unavailable: async () => {} };
    const first = createService(transport),
      second = createService(transport);
    const write = first.request('patch', { width: 80 });
    const flush = first.request('flush');
    await second.request('flush');
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
    const client = createService({
      send: async () => {
        throw new Error('runtime unavailable');
      },
      unavailable,
    });
    await expect(client.request('patch', { space: 12 })).resolves.toBeUndefined();
    await expect(client.request('flush')).resolves.toBeUndefined();
    expect(unavailable).toHaveBeenCalledWith({
      key: 'sync.errors.unavailable_saved_locally',
      params: {},
    });
  });
});
