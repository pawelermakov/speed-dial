import type { browser } from 'wxt/browser';
import type { SyncTransportPort } from '../services/interfaces';
export function createBrowserSyncTransport(api: typeof browser): SyncTransportPort {
  return {
    send: (message) => api.runtime.sendMessage(message),
    async unavailable(error) {
      const existing = await api.storage.local.get('settingsSyncState');
      await api.storage.local.set({
        settingsSyncState: {
          folder: '',
          confirm: false,
          ...(existing.settingsSyncState as object),
          error,
        },
      });
    },
  };
}
