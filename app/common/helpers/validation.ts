import type { MessageText } from '../i18n/contracts';
import { message } from '../i18n/messages';
import { LocalizedError } from '../i18n/errors';
export function record(value: unknown, label: MessageText): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new LocalizedError(message('validation.object.required', { field_name: label }));
  return value as Record<string, unknown>;
}
