import { storage } from 'wxt/utils/storage';
import type { SyncState } from '../entities/models';
import type { SyncStatusStoragePort } from '../services/interfaces';
export function createSyncStateStorage(): SyncStatusStoragePort {
  return storage.defineItem<SyncState>('local:settingsSyncState');
}
