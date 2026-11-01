import { message } from '../i18n/messages';
import { LocalizedError } from '../i18n/errors';
export function normalizeUrl(input: unknown): string {
  if (typeof input !== 'string' || !input.trim())
    throw new LocalizedError(message('validation.url.required'));
  const text = input.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : 'https://' + text);
  } catch {
    throw new LocalizedError(message('validation.url.invalid'));
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password)
    throw new LocalizedError(message('validation.url.http_without_credentials'));
  return url.href;
}
export function safeFavicon(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string')
    throw new LocalizedError(message('validation.favicon.string_required'));
  if (/^data:image\/(?:png|jpeg|webp|gif|x-icon|vnd.microsoft.icon);base64,/i.test(value))
    return value;
  return normalizeUrl(value);
}
