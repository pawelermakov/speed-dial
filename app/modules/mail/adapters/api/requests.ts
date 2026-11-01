import type { MailProvider } from '../../entities/models';

export interface MailCounterRequest {
  url: string;
  init: RequestInit;
}
export const mailCounterUrls = {
  gmail: 'https://mail.google.com/mail/u/0/feed/atom',
  yandex: 'https://mail.yandex.ru/api/v2/serp/counters?silent',
} as const;

export function mailruRequest(signal: AbortSignal, email?: string): MailCounterRequest {
  const params = new URLSearchParams({ mac: '1' });
  if (email) params.set('Login', email);
  return {
    url: 'https://portal.mail.ru/NaviData?' + params,
    init: { signal, credentials: 'include', cache: 'no-store', redirect: 'error' },
  };
}
export function mailCounterRequest(
  provider: Exclude<MailProvider, 'mailru'>,
  signal: AbortSignal,
): MailCounterRequest {
  return {
    url: mailCounterUrls[provider],
    init: { credentials: 'include', cache: 'no-store', redirect: 'manual', signal },
  };
}
