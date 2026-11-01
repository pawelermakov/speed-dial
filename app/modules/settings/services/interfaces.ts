import type { MessageText } from '../../../common/i18n/contracts';
import type { SettingsSyncMessage } from '../entities/syncMessages';
import type { IAppearanceService } from '../../appearance';
import type { SearchProviderId } from '../../search';
import type { Settings } from '../entities/models';
import type { SettingsEnvelope } from '../entities/models';
import type { SyncInfo } from '../entities/sync';

export interface SettingsPort {
  getValue(): Promise<SettingsEnvelope | null>;
  setValue(value: SettingsEnvelope, replace?: boolean): Promise<void>;
  watch?(callback: (value: SettingsEnvelope | null) => void): () => void;
}

// Called after local save; never awaited while the data lock is held.
export interface SettingsChangeSink {
  (patch: Partial<Settings>): void;
}

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
  getValue(): Promise<import('../entities/sync').SyncState | null>;
  watch(callback: (value: import('../entities/sync').SyncState | null) => void): () => void;
}

export interface SettingsServicePorts {
  storage: SettingsPort;
  background: Pick<IAppearanceService, 'readStored' | 'save' | 'restore'>;
  source: { folder(id: string): Promise<unknown>; selectRoot(id: string): Promise<void> };
  validate(input: unknown): Settings;
  error(message: MessageText): Error;
  errorText(error: unknown): MessageText;
  sync: ISettingsSyncService;
}

export interface ISettingsSyncService extends SyncStatusStoragePort {
  request: SyncClient;
  getStatus(): Promise<SyncInfo>;
}
export interface SettingsSyncDependencies {
  transport: SyncTransportPort;
  storage: SyncStatusStoragePort;
  accountStatus(): Promise<SyncInfo>;
}

export interface ISettingsService {
  readonly sync: ISettingsSyncService;
  getValue(): Promise<SettingsEnvelope | null>;
  watch(callback: (value: SettingsEnvelope | null) => void): () => void;
  saveSettings(input: SaveSettingsInput): Promise<void>;
  patchSettings(patch: Partial<Settings>): Promise<Settings>;
  saveSearchProvider(searchProvider: SearchProviderId): Promise<void>;
}
export interface SaveSettingsInput {
  settings: Settings;
  background?: Blob | null;
  rootId?: string;
  replace?: boolean;
}
