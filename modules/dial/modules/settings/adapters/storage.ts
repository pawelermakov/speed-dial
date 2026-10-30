import { storage } from 'wxt/utils/storage';
import { settingKeys, storedSettings } from '../../../../../services/settingsSchema';
import { defaults, type Settings } from '../entities/models';
import type { SettingsEnvelope } from '../entities/models';
import type { SettingsPort, SettingsChangeSink } from '../services/interfaces';
export function createSettingsStorage(changed: SettingsChangeSink): SettingsPort {
  const localItem = storage.defineItem<SettingsEnvelope>('local:settings');
  return {
    getValue: async () => {
      const value = await localItem.getValue();
      return value ? { value: storedSettings(value.value) } : null;
    },
    watch: (callback) =>
      localItem.watch((value) => callback(value ? { value: storedSettings(value.value) } : null)),
    async setValue(envelope, replace = false) {
      const previous = await localItem.getValue();
      let before: Settings;
      try {
        before = storedSettings(previous?.value);
      } catch {
        before = { ...defaults };
      }
      await localItem.setValue(envelope);
      const patch = Object.fromEntries(
        settingKeys
          .filter((key) => replace || before[key] !== envelope.value[key])
          .map((key) => [key, envelope.value[key]]),
      );
      // Do not wait under the repository data lock: remote application uses that
      // same cross-context lock. The background owns the durable local snapshot.
      if (Object.keys(patch).length) changed(patch);
    },
  };
}
