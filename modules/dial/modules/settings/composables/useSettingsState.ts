import { ref, onUnmounted } from 'vue';
import { defaults, type Settings } from '../entities/models';
import { isMovieProvider, type SearchProviderId } from '../../search';
import { message } from '../../../../../shared/i18n/messages';
import type { MessageText } from '../../../../../shared/i18n/contracts';
import type { SettingsEnvelope } from '../entities/models';

export interface SettingsStateOptions {
  current(): Settings;
  canSave(): boolean;
  validate(input: unknown): Settings;
  save(patch: Partial<Settings>): Promise<Settings>;
  read(): Promise<Settings>;
  watch?: (callback: (value: SettingsEnvelope | null) => void) => () => void;
  setLanguage(language: Settings['language']): void;
  publish(settings: Settings): void;
  onReadError(error: unknown): void;
  errorText(error: unknown): MessageText;
  flushSync(): Promise<void>;
}
export function useSettingsState(options: SettingsStateOptions) {
  const ready = ref(false),
    errors = ref<Record<string, MessageText>>({});
  let confirmed: Settings = { ...defaults },
    settingsVersion = 0,
    settingsRead = 0,
    disposed = false;
  const pendingFields = new Map<
    keyof Settings,
    { version: number; value: Settings[keyof Settings] }
  >();
  const saves = new Set<Promise<unknown>>();
  const fieldLabels: Record<keyof Settings, MessageText> = {
    get language() {
      return message('settings.language.label');
    },
    mailruEnabled: 'Mail.ru',
    gmailEnabled: 'Gmail',
    get yandexMailEnabled() {
      return message('mail.providers.yandex');
    },
    get weatherEnabled() {
      return message('settings.weather.title');
    },
    get weatherCity() {
      return message('settings.weather.city');
    },
    get weatherProvider() {
      return message('settings.weather.provider');
    },
    get theme() {
      return message('settings.theme.label');
    },
    get width() {
      return message('settings.grid.width');
    },
    get countColumns() {
      return message('settings.grid.columns');
    },
    get space() {
      return message('settings.grid.spacing');
    },
    get verticalCenter() {
      return message('settings.grid.vertical_center');
    },
    get addButton() {
      return message('settings.bookmarks.add_button');
    },
    get bookmarkSearch() {
      return message('search.bookmarks.label');
    },
    get movieSearch() {
      return message('settings.bookmarks.movie_search');
    },
    get searchProvider() {
      return message('settings.search.provider');
    },
  };

  function publish(apply: (settings: Settings) => void = options.publish) {
    const settings = { ...confirmed };
    for (const [key, entry] of pendingFields) Object.assign(settings, { [key]: entry.value });
    options.setLanguage(settings.language);
    apply(settings);
    ready.value = true;
  }
  function confirm(settings: Settings, apply?: (settings: Settings) => void) {
    confirmed = settings;
    publish(apply);
  }
  function track<T>(promise: Promise<T>): Promise<T> {
    saves.add(promise);
    void promise.finally(() => saves.delete(promise)).catch(() => {});
    return promise;
  }
  async function flush() {
    while (saves.size) await Promise.allSettled([...saves]);
    await options.flushSync();
  }
  const updateSettings = (patch: Partial<Settings>): Promise<boolean> => {
    if (patch.movieSearch === false && isMovieProvider(options.current().searchProvider))
      patch = { ...patch, searchProvider: 'yandex' };
    if (patch.bookmarkSearch === false && options.current().searchProvider === 'bookmarks')
      patch = { ...patch, searchProvider: 'yandex' };
    if (!options.canSave()) return Promise.resolve(false);
    const version = ++settingsVersion,
      keys = Object.keys(patch) as Array<keyof Settings>;
    try {
      options.validate({ ...options.current(), ...patch });
    } catch (error) {
      errors.value = { ...errors.value, settings: options.errorText(error) };
      return Promise.resolve(false);
    }
    for (const key of keys) {
      pendingFields.set(key, { version, value: patch[key]! });
      delete errors.value[key];
    }
    publish();
    return track(
      (async () => {
        try {
          const next = await options.save(patch);
          confirmed = next;
          return true;
        } catch (error) {
          for (const key of keys)
            if (pendingFields.get(key)?.version === version)
              errors.value = {
                ...errors.value,
                [key]: message('settings.errors.save_field_failed', {
                  field_name: fieldLabels[key],
                  error: options.errorText(error),
                }),
              };
          return false;
        } finally {
          for (const key of keys)
            if (pendingFields.get(key)?.version === version) pendingFields.delete(key);
          if (!disposed) publish();
        }
      })(),
    );
  };
  const changeSearchProvider = (searchProvider: SearchProviderId) =>
    updateSettings({ searchProvider });

  const unwatch = options.watch?.(() => {
    const sequence = ++settingsRead;
    void options
      .read()
      .then((next) => {
        if (disposed || sequence !== settingsRead) return;
        confirmed = next;
        publish();
      })
      .catch((error) => {
        if (!disposed) options.onReadError(error);
      });
  });
  onUnmounted(() => {
    disposed = true;
    settingsRead++;
    unwatch?.();
  });
  return {
    ready,
    errors,
    confirm,
    track,
    flush,
    updateSettings,
    changeSearchProvider,
    clearErrors: () => {
      errors.value = {};
    },
  };
}
