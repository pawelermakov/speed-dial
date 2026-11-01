import { normalizeUrl } from '../../../common/helpers/url';
import { message } from '../../../common/i18n/messages';
import { LocalizedError } from '../../../common/i18n/errors';
export function normalizeBookmarkUrl(input: string): string {
  const value = normalizeUrl(input);
  const host = new URL(value).hostname.replace(/\.$/, '');
  const rawHost = input
    .trim()
    .replace(/^https?:\/\//i, '')
    .split(/[/?#]/, 1)[0]!
    .replace(/:\d*$/, '');
  if (/^(?:\d+\.){3}\d+$/.test(host)) {
    // URL accepts shorthand like "1" or "1.2" as IPv4. Require the full
    // dotted-decimal address the user actually entered instead.
    if (
      !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(rawHost) ||
      rawHost.split('.').some((part) => Number(part) > 255)
    )
      throw new LocalizedError(message('validation.url.full_ip_required'));
    return value;
  }
  // Accept public domains, localhost and IP literals without fetching the site.
  if (
    host !== 'localhost' &&
    !host.startsWith('[') &&
    (!host.includes('.') ||
      !/^(?:[a-z]{2,63}|xn--[a-z\d-]{2,59})$/i.test(host.split('.').at(-1)!) ||
      host.length > 253 ||
      host.split('.').some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label)))
  )
    throw new LocalizedError(message('validation.url.full_address_required'));
  return value;
}
