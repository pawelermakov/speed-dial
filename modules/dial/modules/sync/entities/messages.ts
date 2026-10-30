import type { Settings } from '../../settings';
export type SyncAction = 'initialize' | 'flush' | 'retry' | 'patch' | 'folder' | 'confirm';
export type SettingsSyncMessage<Patch = Partial<Settings>> =
  | { type: 'settings-sync'; action: 'initialize' | 'flush' | 'retry'; value?: undefined }
  | { type: 'settings-sync'; action: 'patch'; value: Patch }
  | { type: 'settings-sync'; action: 'folder'; value: string }
  | { type: 'settings-sync'; action: 'confirm'; value: boolean };
export type IncomingSyncMessage = SettingsSyncMessage<Record<string, unknown>>;
