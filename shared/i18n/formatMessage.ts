import type { MessageKey, MessageText, MessageValue } from './contracts';
export type Translator = (key: MessageKey, params?: Record<string, MessageValue>) => string;
export function formatMessageWith(t: Translator, value: MessageText | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if ('parts' in value)
    return value.parts
      .map((part) => formatMessageWith(t, part))
      .filter(Boolean)
      .join(value.separator);
  return t(value.key, value.params);
}
