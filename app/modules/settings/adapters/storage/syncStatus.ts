import type { BrowserStorage } from '../../../../common/infrastructure/browser/storage';
import type { SyncState } from '../../entities/sync';
import type { SyncStatusStoragePort } from '../../services/interfaces';
export class SyncStatusStorage implements SyncStatusStoragePort {
  private readonly item;
  constructor(storage: BrowserStorage) {
    this.item = storage.defineItem<SyncState>('local:settingsSyncState');
  }
  getValue = () => this.item.getValue();
  watch: SyncStatusStoragePort['watch'] = (callback) => this.item.watch(callback);
}
