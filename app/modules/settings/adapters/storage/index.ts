import type { BrowserStorage } from '../../../../common/infrastructure/browser/storage';
import { settingKeys, storedSettings } from '../../schema';
import { defaults, type Settings } from '../../entities/models';
import type { SettingsEnvelope } from '../../entities/models';
import type { SettingsPort, SettingsChangeSink } from '../../services/interfaces';
export class SettingsStorage implements SettingsPort {
  private readonly localItem;
  constructor(
    storage: BrowserStorage,
    private readonly changed: SettingsChangeSink,
  ) {
    this.localItem = storage.defineItem<SettingsEnvelope>('local:settings');
  }

  getValue = async () => {
    const value = await this.localItem.getValue();
    return value ? { value: storedSettings(value.value) } : null;
  };
  watch: NonNullable<SettingsPort['watch']> = (callback) =>
    this.localItem.watch((value) =>
      callback(value ? { value: storedSettings(value.value) } : null),
    );
  setValue = async (envelope: SettingsEnvelope, replace = false) => {
    const previous = await this.localItem.getValue();
    let before: Settings;
    try {
      before = storedSettings(previous?.value);
    } catch {
      before = { ...defaults };
    }
    await this.localItem.setValue(envelope);
    const patch = Object.fromEntries(
      settingKeys
        .filter((key) => replace || before[key] !== envelope.value[key])
        .map((key) => [key, envelope.value[key]]),
    );
    // Do not wait under the shared data lock: remote application uses that
    // same cross-context lock. The background owns the durable local snapshot.
    if (Object.keys(patch).length) this.changed(patch);
  };
}
