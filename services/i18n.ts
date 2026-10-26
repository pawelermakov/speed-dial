import { shallowRef } from 'vue';
import ru from '../locales/ru.json';
import en from '../locales/en.json';
import es from '../locales/es.json';

export const languages = [
  { id: 'ru', label: ru['language.names.ru'] },
  { id: 'en', label: ru['language.names.en'] },
  { id: 'es', label: ru['language.names.es'] },
] as const;
export type Language = typeof languages[number]['id'];
export function isLanguage(value: unknown): value is Language { return languages.some(row => row.id === value); }
export const defaultLanguage: Language = 'ru';
function initialLanguage(): Language {
  try { const saved=localStorage.getItem('speed-dial-language');if(isLanguage(saved))return saved; } catch { /* Storage is optional. */ }
  return defaultLanguage;
}
export const language = shallowRef<Language>(initialLanguage());
export function setLanguage(value: Language) {
  language.value=value;
  if(typeof document!=='undefined')document.documentElement.lang=value;
  try{localStorage.setItem('speed-dial-language',value);}catch{/* The authoritative preference remains in extension storage. */}
}
export type MessageKey = keyof typeof ru;
// Both missing and additional keys are rejected by TypeScript.
type SameKeys<T> = Exclude<keyof T, MessageKey> extends never ? Record<MessageKey, string> : never;
const checkedEn: SameKeys<typeof en> = en;
const checkedEs: SameKeys<typeof es> = es;
const messages: Record<Language, Record<MessageKey, string>> = { ru, en: checkedEn, es: checkedEs };
export interface Message { key: MessageKey; params: Record<string, MessageValue> }
export interface MessageList { parts: MessageText[]; separator: string }
export type MessageText = string | Message | MessageList;
type MessageValue = MessageText | number | boolean | null | undefined;
export function message(key: MessageKey, params: Record<string, MessageValue> = {}): Message { return { key, params }; }
export function joinMessages(parts: (MessageText | undefined)[], separator = ' '): MessageText {
 const present = parts.filter((part): part is MessageText => !!part);
 return present.length ? { parts: present, separator } : '';
}
export function formatMessage(value: MessageText | null | undefined): string {
 if (value == null) return '';
 if (typeof value === 'string') return value;
 if ('parts' in value) return value.parts.map(formatMessage).filter(Boolean).join(value.separator);
 return t(value.key, value.params);
}
const pluralRules = { ru: new Intl.PluralRules('ru'), en: new Intl.PluralRules('en'), es: new Intl.PluralRules('es') };
export function t(key: MessageKey, params: Record<string, MessageValue> = {}): string {
 const pluralKey = typeof params.count === 'number' ? key + '.' + pluralRules[language.value].select(params.count) : key;
 const selected = Object.hasOwn(ru, pluralKey) ? pluralKey as MessageKey : key;
 const text = messages[language.value][selected] ?? messages.ru[selected];
 return text.replace(/\{(\w+)\}/g, (token, name) => {
  if (!Object.hasOwn(params, name)) return token;
  const value = params[name];
  return value == null ? '' : typeof value === 'object' ? formatMessage(value) : String(value);
 });
}
export class LocalizedError extends Error {
 constructor(readonly localized: MessageText) { super(formatMessage(localized)); this.name = 'LocalizedError'; }
}
export function errorMessage(error: unknown): MessageText {
 return error instanceof LocalizedError ? error.localized : error instanceof Error ? error.message : String(error);
}
