import { defaults, type Settings } from '../entities/models';
import type { SearchProviderId } from '../../search';
import type { ISettingsService, SettingsServicePorts, SaveSettingsInput } from './interfaces';
import { message, joinMessages } from '../../../common/i18n/messages';
export class SettingsService implements ISettingsService {
  constructor(private readonly ports: SettingsServicePorts) {}

  getValue = () => this.ports.storage.getValue();
  watch: ISettingsService['watch'] = (callback) =>
    this.ports.storage.watch?.(callback) ?? (() => {});
  get sync() {
    return this.ports.sync;
  }

  saveSettings = async ({ settings, background, rootId, replace = false }: SaveSettingsInput) => {
    const next = this.ports.validate(settings);
    if (rootId !== undefined) await this.ports.source.folder(rootId);
    const previous = await this.ports.storage.getValue();
    let previousSettings: Settings;
    try {
      previousSettings = this.ports.validate(previous?.value);
    } catch {
      previousSettings = { ...defaults };
    }
    const settingsChanged = (Object.keys(defaults) as Array<keyof Settings>).some(
      (key) => next[key] !== previousSettings[key],
    );
    const previousBackground =
      background !== undefined ? await this.ports.background.readStored() : undefined;
    let wroteSettings = false,
      wroteBackground = false;
    try {
      if (settingsChanged || replace) {
        await this.ports.storage.setValue({ value: next }, replace);
        wroteSettings = true;
      }
      if (background !== undefined) {
        await this.ports.background.save(background);
        wroteBackground = true;
      }
      // Commit the source last: failed writes cannot silently switch the root.
      if (rootId !== undefined) await this.ports.source.selectRoot(rootId);
    } catch (error) {
      const rollback = await Promise.allSettled([
        wroteSettings
          ? this.ports.storage.setValue(previous ?? { value: { ...defaults } })
          : Promise.resolve(),
        wroteBackground ? this.ports.background.restore(previousBackground) : Promise.resolve(),
      ]);
      const detail = rollback.some((result) => result.status === 'rejected')
        ? message('settings.errors.partial_restore')
        : '';
      throw this.ports.error(joinMessages([this.ports.errorText(error), detail], ''));
    }
  };
  saveSearchProvider = async (searchProvider: SearchProviderId) => {
    await this.patchSettings({ searchProvider });
  };
  patchSettings = async (patch: Partial<Settings>): Promise<Settings> => {
    if (Object.keys(patch).some((key) => !Object.hasOwn(defaults, key)))
      throw this.ports.error(message('validation.settings.unknown_field'));
    const current = this.ports.validate((await this.ports.storage.getValue())?.value);
    const next = this.ports.validate({ ...current, ...patch });
    await this.saveSettings({ settings: next });
    return next;
  };
}
