import { storage } from 'wxt/utils/storage';
import { syncRequest } from './syncClient';
import { settingKeys } from './settingsSchema';
import { validateSettings } from './validation';
import { defaults } from '../types/models';
import type { Settings } from '../types/models';
export interface SettingsEnvelope { value: Settings }
export interface SettingsPort {
  getValue(): Promise<SettingsEnvelope | null>;
  setValue(value: SettingsEnvelope, replace?: boolean): Promise<void>;
  watch?(callback: (value: SettingsEnvelope | null) => void): () => void;
}
const localItem = storage.defineItem<SettingsEnvelope>('local:settings');
export const settingsItem: SettingsPort = {
  getValue: () => localItem.getValue(),
  watch: callback => localItem.watch(callback),
  async setValue(envelope, replace=false) {
    const previous = await localItem.getValue();
    let before:Settings;
    try{before=validateSettings(previous?.value);}catch{before={...defaults};}
    await localItem.setValue(envelope);
    const patch = Object.fromEntries(settingKeys.filter(key => replace||before[key] !== envelope.value[key]).map(key => [key, envelope.value[key]]));
    // Do not wait under the repository data lock: remote application uses that
    // same cross-context lock. The background owns the durable local snapshot.
    if (Object.keys(patch).length) void syncRequest('patch', patch);
  },
};
