import type { Settings } from '../../settings';
import type { MessageText } from '../../../../../shared/i18n/contracts';
import type { SettingsSyncMessage } from '../entities/messages';
export interface SyncClient {
  (action: 'initialize' | 'flush' | 'retry'): Promise<void>;
  (action: 'patch', value: Partial<Settings>): Promise<void>;
  (action: 'folder', value: string): Promise<void>;
  (action: 'confirm', value: boolean): Promise<void>;
}
export interface SyncTransportPort {
  send(message: SettingsSyncMessage): Promise<unknown>;
  unavailable(error: MessageText): Promise<void>;
}

export interface SyncStatusStoragePort {
  getValue(): Promise<import('../entities/models').SyncState | null>;
  watch(callback: (value: import('../entities/models').SyncState | null) => void): () => void;
}
