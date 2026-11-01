import type { MessageText } from '../../../common/i18n/contracts';
export interface SyncState {
  error: MessageText;
  folder: MessageText;
  confirm: boolean;
}
export const syncStateKey = 'settingsSyncState';
export type SyncStatus = 'enabled' | 'disabled' | 'unknown' | 'unavailable';
export interface SyncInfo {
  status: SyncStatus;
  email: string;
}
