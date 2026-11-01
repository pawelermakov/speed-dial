import type { Message, MessageKey, MessageValue, MessageText } from './contracts';

export function message(key: MessageKey, params: Record<string, MessageValue> = {}): Message {
  return { key, params };
}
export function joinMessages(parts: (MessageText | undefined)[], separator = ' '): MessageText {
  const present = parts.filter((part): part is MessageText => !!part);
  return present.length ? { parts: present, separator } : '';
}
