import { message } from '../../../../../shared/i18n/messages';
import type { SyncAction, SettingsSyncMessage } from '../entities/messages';
import type { SyncClient, SyncTransportPort } from './interfaces';
export function createSyncClient(transport: SyncTransportPort): SyncClient {
  const outgoing = new Set<Promise<void>>();
  async function send(action: SyncAction, value: unknown) {
    try {
      await transport.send({ type: 'settings-sync', action, value } as SettingsSyncMessage);
    } catch {
      try {
        await transport.unavailable(message('sync.errors.unavailable_saved_locally'));
      } catch {
        /* Local settings remain usable. */
      }
    }
  }
  return async (action: SyncAction, value?: unknown) => {
    if (action === 'flush') await Promise.allSettled([...outgoing]);
    const task = send(action, value);
    if (action === 'patch' || action === 'folder') {
      outgoing.add(task);
      void task.finally(() => outgoing.delete(task));
    }
    await task;
  };
}
