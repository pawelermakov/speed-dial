import type ru from '../../../locales/ru.json';

export const languageIds = ['ru', 'en', 'es'] as const;
export type Language = (typeof languageIds)[number];
export const defaultLanguage: Language = 'ru';
export function isLanguage(value: unknown): value is Language {
  return languageIds.some((id) => id === value);
}
export type MessageKey = keyof typeof ru;

export interface Message {
  key: MessageKey;
  params: Record<string, MessageValue>;
}
export interface MessageList {
  parts: MessageText[];
  separator: string;
}
export type MessageText = string | Message | MessageList;
export type MessageValue = MessageText | number | boolean | null | undefined;
