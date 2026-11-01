import { message } from '../../../../common/i18n/messages';
import { MailError } from './errors';

export interface MailruCounterResponse {
  status?: unknown;
  data?: { mail_cnt?: unknown; email?: unknown; list?: unknown };
}
export interface YandexCounterResponse {
  error?: unknown;
  counters?: { unread?: unknown };
}

export function parseMailCount(value: unknown): number {
  const response = value as MailruCounterResponse | null;
  if (response?.status === 'noauth')
    throw new MailError('unauthenticated', message('mail.errors.mailru.sign_in'));
  if (response?.status !== undefined && response.status !== 'ok')
    throw new MailError('error', message('mail.errors.mailru.check_failed'));
  const raw = response?.data?.mail_cnt;
  const count = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
    throw new MailError('error', message('mail.errors.mailru.invalid_count'));
  return count;
}
function validCount(raw: unknown): number {
  const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new MailError('error', message('mail.errors.invalid_count'));
  return value;
}
export function parseGmailCount(xml: string): number {
  if (xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new MailError('error', message('mail.errors.gmail.invalid_format'));
  const document = new DOMParser().parseFromString(xml, 'application/xml'),
    root = document.documentElement;
  if (
    document.getElementsByTagNameNS('*', 'parsererror').length ||
    root.localName !== 'feed' ||
    !['http://purl.org/atom/ns#', 'http://www.w3.org/2005/Atom'].includes(root.namespaceURI ?? '')
  )
    throw new MailError('error', message('mail.errors.gmail.feed_missing'));
  const fields = [...root.children].filter(
    (node) => node.localName === 'fullcount' && node.namespaceURI === root.namespaceURI,
  );
  if (fields.length !== 1 || fields[0]!.children.length)
    throw new MailError('error', message('mail.errors.gmail.count_missing'));
  return validCount(fields[0]!.textContent?.trim());
}
export function parseYandexMailCount(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MailError('error', message('mail.errors.yandex.count_missing'));
  const data = value as YandexCounterResponse;
  if (data.error) throw new MailError('error', message('mail.errors.yandex.check_failed'));
  return validCount(data.counters?.unread);
}
