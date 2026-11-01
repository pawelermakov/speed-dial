import { SettingsService } from './services/settings';
import type { BrowserStorage } from '../../common/infrastructure/browser/storage';
import { SettingsSyncService } from './services/syncClient';
import { SettingsApi, type SettingsBrowserApi } from './adapters/api';
import { SyncStatusStorage } from './adapters/storage/syncStatus';
import { SettingsStorage } from './adapters/storage';
import { type SettingsServicePorts } from './services/interfaces';
import { validateSettings } from './schema';
import { LocalizedError, errorMessage } from '../../common/i18n/errors';

export function New(
  dependencies: Pick<SettingsServicePorts, 'background' | 'source'> & {
    browser: SettingsBrowserApi;
    storage: BrowserStorage;
  },
) {
  const sync = createSettingsSync(dependencies.browser, dependencies.storage);
  const storage = new SettingsStorage(dependencies.storage, (patch) => {
    void sync.request('patch', patch);
  });
  return new SettingsService({
    background: dependencies.background,
    source: dependencies.source,
    storage,
    validate: validateSettings,
    error: (message) => new LocalizedError(message),
    errorText: errorMessage,
    sync,
  });
}
function createSettingsSync(api: SettingsBrowserApi, storage: BrowserStorage) {
  const transport = new SettingsApi(api);
  return new SettingsSyncService({
    transport,
    storage: new SyncStatusStorage(storage),
    accountStatus: transport.getStatus,
  });
}

export * from './entities';
export * from './services';
