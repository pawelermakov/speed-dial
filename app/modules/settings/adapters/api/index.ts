import type { browser } from 'wxt/browser';
import type { SyncTransportPort } from '../../services/interfaces';
import { syncStatus, type AccountStatusApi } from './syncAccountStatus';

export interface SettingsBrowserApi extends AccountStatusApi {
  runtime: Pick<typeof browser.runtime, 'sendMessage'>;
  storage: { local: Pick<typeof browser.storage.local, 'get' | 'set'> };
}

export class SettingsApi implements SyncTransportPort {
  constructor(private readonly api: SettingsBrowserApi) {}
  send: SyncTransportPort['send'] = (message) => this.api.runtime.sendMessage(message);
  unavailable: SyncTransportPort['unavailable'] = async (error) => {
    const existing = await this.api.storage.local.get('settingsSyncState');
    await this.api.storage.local.set({
      settingsSyncState: {
        folder: '',
        confirm: false,
        ...(existing.settingsSyncState as object),
        error,
      },
    });
  };
  getStatus = () => syncStatus(this.api);
}
