import { createI18n } from 'vue-i18n';
import type { App } from 'vue';
import { defaultLanguage, isLanguage, type Language, type MessageKey } from './contracts';
import { formatMessageWith, type Translator } from './formatMessage';
import { translationsKey } from './injection';
import ru from '../../../locales/ru.json';
import en from '../../../locales/en.json';
import es from '../../../locales/es.json';

type SameKeys<T> = Exclude<keyof T, MessageKey> extends never ? Record<MessageKey, string> : never;
const checkedEn: SameKeys<typeof en> = en,
  checkedEs: SameKeys<typeof es> = es;
const catalogs: Record<Language, Record<MessageKey, string>> = { ru, en: checkedEn, es: checkedEs };
export const languages = [
  { id: 'ru', label: ru['language.names.ru'] },
  { id: 'en', label: ru['language.names.en'] },
  { id: 'es', label: ru['language.names.es'] },
] as const;
function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem('speed-dial-language');
    if (isLanguage(saved)) return saved;
  } catch {
    /* Optional startup mirror. */
  }
  return defaultLanguage;
}
export function createTranslationContext(options: { language?: Language; mirror?: boolean } = {}) {
  const categories = ['one', 'few', 'many', 'other'];
  const pluralRules = Object.fromEntries(
    (['ru', 'en', 'es'] as const).map((code) => {
      const rule = new Intl.PluralRules(code);
      return [code, (count: number) => categories.indexOf(rule.select(count))];
    }),
  );
  const plugin = createI18n({
    legacy: false,
    globalInjection: true,
    locale: options.language ?? initialLanguage(),
    fallbackLocale: 'ru',
    messages: { ru: { ...catalogs.ru }, en: { ...catalogs.en }, es: { ...catalogs.es } },
    pluralRules,
    messageResolver: (object, path) =>
      object !== null && typeof object === 'object' && Object.hasOwn(object, path)
        ? (object as Record<string, string>)[path]!
        : null,
  });
  const language = plugin.global.locale;
  const t: Translator = (key, params = {}) => {
    const named = Object.fromEntries(
      Object.entries(params).map(([name, value]) => [
        name,
        value == null ? '' : typeof value === 'object' ? formatMessageWith(t, value) : value,
      ]),
    );
    return plugin.global.t(
      key,
      named,
      typeof params.count === 'number' ? { plural: params.count } : {},
    );
  };
  function setLanguage(value: Language) {
    language.value = value;
    if (options.mirror === false) return;
    if (typeof document !== 'undefined') document.documentElement.lang = value;
    try {
      localStorage.setItem('speed-dial-language', value);
    } catch {
      /* Storage is authoritative. */
    }
  }
  const context = {
    plugin,
    language,
    t,
    setLanguage,
    languages,
    formatMessage: (value: Parameters<typeof formatMessageWith>[1]) => formatMessageWith(t, value),
    d: plugin.global.d,
    dispose: () => plugin.dispose(),
    install(app: App) {
      app.use(plugin);
      app.provide(translationsKey, context);
    },
  };
  return context;
}
export type TranslationContext = ReturnType<typeof createTranslationContext>;
