import { message } from '../../../../common/i18n/messages';
import { MailError } from './errors';
import type { MailProvider } from '../../entities/models';
import type { MailServicePorts } from '../../services/interfaces';
import { mailruRequest, mailCounterRequest } from './requests';
import {
  parseMailCount,
  parseGmailCount,
  parseYandexMailCount,
  type MailruCounterResponse,
} from './responses';
export { MailError } from './errors';
export { parseMailCount, parseGmailCount, parseYandexMailCount } from './responses';
export { mailCounterUrls } from './requests';

export class MailApi implements MailServicePorts {
  readers: MailServicePorts['readers'] = {
    mailru: (signal) => this.readMailru(signal),
    gmail: (signal) => this.readOtherProvider('gmail', signal),
    yandex: (signal) => this.readOtherProvider('yandex', signal),
  };
  errorStatus: MailServicePorts['errorStatus'] = (cause) =>
    cause instanceof MailError ? cause.kind : 'error';
  readMailru = async (signal: AbortSignal): Promise<number> => {
    const read = async (email?: string): Promise<unknown> => {
      const request = mailruRequest(signal, email);
      const response = await fetch(request.url, request.init);
      if (response.status === 401)
        throw new MailError('unauthenticated', message('mail.errors.mailru.sign_in'));
      if (!response.ok) throw new MailError('error', message('mail.errors.check_failed'));
      return response.json();
    };
    const value = await read();
    const response = value as MailruCounterResponse | null;
    if (
      response?.status === 'noauth' ||
      response?.status !== 'ok' ||
      Object.hasOwn(response?.data ?? {}, 'mail_cnt')
    )
      return parseMailCount(value);
    const data = response.data;
    const validEmail = (value: unknown): value is string =>
      typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    let email = validEmail(data?.email) ? data.email : undefined;
    if (!email && Array.isArray(data?.list) && data.list.length === 1 && validEmail(data.list[0]))
      email = data.list[0];
    if (!email)
      throw new MailError('unsupported', message('mail.errors.mailru.current_account_missing'));
    // Only the current (or sole) account; never guess among multiple signed-in accounts.
    return parseMailCount(await read(email));
  };

  readOtherProvider = async (provider: MailProvider, signal: AbortSignal): Promise<number> => {
    if (provider === 'mailru') return this.readMailru(signal);
    const request = mailCounterRequest(provider, signal);
    const response = await fetch(request.url, request.init);
    if (response.status === 401)
      throw new MailError('unauthenticated', message('mail.errors.sign_in'));
    if (response.status === 404 || response.status === 410)
      throw new MailError('unsupported', message('mail.errors.service_unavailable'));
    if (!response.ok || response.type === 'opaqueredirect' || response.status >= 300)
      throw new MailError('error', message('mail.errors.check_failed'));
    return provider === 'gmail'
      ? parseGmailCount(await response.text())
      : parseYandexMailCount(await response.json());
  };
}
