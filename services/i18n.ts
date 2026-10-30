import { shallowRef } from 'vue';
import {
  defaultLanguage,
  isLanguage,
  type Language,
  type MessageKey,
  type MessageText,
  type MessageValue,
} from '../shared/i18n/contracts';
export { defaultLanguage, isLanguage } from '../shared/i18n/contracts';
export type {
  Language,
  MessageKey,
  Message,
  MessageList,
  MessageText,
} from '../shared/i18n/contracts';
export { message, joinMessages } from '../shared/i18n/messages';
import ru from '../locales/ru.json';
import en from '../locales/en.json';
import es from '../locales/es.json';

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
    /* Storage is optional. */
  }
  return defaultLanguage;
}
export const language = shallowRef<Language>(initialLanguage());
export function setLanguage(value: Language) {
  language.value = value;
  if (typeof document !== 'undefined') document.documentElement.lang = value;
  try {
    localStorage.setItem('speed-dial-language', value);
  } catch {
    /* The authoritative preference remains in extension storage. */
  }
}
// Both missing and additional keys are rejected by TypeScript.
type SameKeys<T> = Exclude<keyof T, MessageKey> extends never ? Record<MessageKey, string> : never;
const checkedEn: SameKeys<typeof en> = en;
const checkedEs: SameKeys<typeof es> = es;
const messages: Record<Language, Record<MessageKey, string>> = { ru, en: checkedEn, es: checkedEs };
export function formatMessage(value: MessageText | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if ('parts' in value) return value.parts.map(formatMessage).filter(Boolean).join(value.separator);
  return t(value.key, value.params);
}
const pluralRules = {
  ru: new Intl.PluralRules('ru'),
  en: new Intl.PluralRules('en'),
  es: new Intl.PluralRules('es'),
};
export function t(key: MessageKey, params: Record<string, MessageValue> = {}): string {
  const pluralKey =
    typeof params.count === 'number'
      ? key + '.' + pluralRules[language.value].select(params.count)
      : key;
  const selected = Object.hasOwn(ru, pluralKey) ? (pluralKey as MessageKey) : key;
  const text = messages[language.value][selected] ?? messages.ru[selected];
  return text.replace(/\{(\w+)\}/g, (token, name) => {
    if (!Object.hasOwn(params, name)) return token;
    const value = params[name];
    return value == null ? '' : typeof value === 'object' ? formatMessage(value) : String(value);
  });
}
export class LocalizedError extends Error {
  constructor(readonly localized: MessageText) {
    super(formatMessage(localized));
    this.name = 'LocalizedError';
  }
}
export function errorMessage(error: unknown): MessageText {
  return error instanceof LocalizedError
    ? error.localized
    : error instanceof Error
      ? error.message
      : String(error);
}
