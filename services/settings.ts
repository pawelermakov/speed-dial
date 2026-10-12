import { storage } from 'wxt/utils/storage';
import type { Settings } from '../types/models';
export interface SettingsEnvelope { value: Settings }
export interface SettingsPort {
  getValue(): Promise<SettingsEnvelope | null>;
  setValue(value: SettingsEnvelope): Promise<void>;
}
export const settingsItem = storage.defineItem<SettingsEnvelope>('local:settings');
