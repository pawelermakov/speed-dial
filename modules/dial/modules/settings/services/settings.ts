import { defaults, type Settings } from '../entities/models';
import type { SearchProviderId } from '../../search';
import type { AppearanceService } from '../../appearance';
import type { SettingsPort } from './interfaces';
import { message, joinMessages } from '../../../../../shared/i18n/messages';
import type { MessageText } from '../../../../../shared/i18n/contracts';
export interface SettingsServicePorts {
  storage: SettingsPort;
  background: AppearanceService;
  source: { folder(id: string): Promise<unknown>; selectRoot(id: string): Promise<void> };
  validate(input: unknown): Settings;
  error(message: MessageText): Error;
  errorText(error: unknown): MessageText;
}
export function createSettingsService(ports: SettingsServicePorts) {
  async function saveSettings(
    settings: Settings,
    background?: Blob | null,
    rootId?: string,
    replace = false,
  ) {
    const next = ports.validate(settings);
    if (rootId !== undefined) await ports.source.folder(rootId);
    const previous = await ports.storage.getValue();
    let previousSettings: Settings;
    try {
      previousSettings = ports.validate(previous?.value);
    } catch {
      previousSettings = { ...defaults };
    }
    const settingsChanged = (Object.keys(defaults) as Array<keyof Settings>).some(
      (key) => next[key] !== previousSettings[key],
    );
    const previousBackground =
      background !== undefined ? await ports.background.readStored() : undefined;
    let wroteSettings = false,
      wroteBackground = false;
    try {
      if (settingsChanged || replace) {
        await ports.storage.setValue({ value: next }, replace);
        wroteSettings = true;
      }
      if (background !== undefined) {
        await ports.background.save(background);
        wroteBackground = true;
      }
      // Commit the source last: failed writes cannot silently switch the root.
      if (rootId !== undefined) await ports.source.selectRoot(rootId);
    } catch (error) {
      const rollback = await Promise.allSettled([
        wroteSettings
          ? ports.storage.setValue(previous ?? { value: { ...defaults } })
          : Promise.resolve(),
        wroteBackground ? ports.background.restore(previousBackground) : Promise.resolve(),
      ]);
      const detail = rollback.some((result) => result.status === 'rejected')
        ? message('settings.errors.partial_restore')
        : '';
      throw ports.error(joinMessages([ports.errorText(error), detail], ''));
    }
  }
  async function saveSearchProvider(searchProvider: SearchProviderId) {
    await patchSettings({ searchProvider });
  }
  async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
    if (Object.keys(patch).some((key) => !Object.hasOwn(defaults, key)))
      throw ports.error(message('validation.settings.unknown_field'));
    const current = ports.validate((await ports.storage.getValue())?.value);
    const next = ports.validate({ ...current, ...patch });
    await saveSettings(next);
    return next;
  }

  return { saveSettings, patchSettings, saveSearchProvider };
}
export type SettingsService = ReturnType<typeof createSettingsService>;
