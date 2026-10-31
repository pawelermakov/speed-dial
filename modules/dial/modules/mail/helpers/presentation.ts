import { t } from '../../../../../services/i18n';
import type { Settings } from '../../settings';
export const mailProviders = [
  { id: 'mailru', name: 'Mail.ru', href: 'https://e.mail.ru/messages/inbox/' },
  { id: 'gmail', name: 'Gmail', href: 'https://mail.google.com/mail/u/0/' },
  {
    id: 'yandex',
    get name() {
      return t('mail.providers.yandex');
    },
    href: 'https://mail.yandex.ru/',
  },
] as const;
import type { MailProvider, MailStatus } from '../entities/models';
export type { MailProvider, MailStatus } from '../entities/models';
export function mailEnabled(settings: Settings, id: MailProvider): boolean {
  return id === 'mailru'
    ? settings.mailruEnabled
    : id === 'gmail'
      ? settings.gmailEnabled
      : settings.yandexMailEnabled;
}
export function mailTooltip(name: string, status: MailStatus): string {
  if (status === 'unauthenticated') return t('mail.status.sign_in', { provider_name: name });
  if (status === 'error') return t('mail.status.error', { provider_name: name });
  if (status === 'unsupported') return t('mail.status.unsupported', { provider_name: name });
  if (status === 'loading') return t('mail.status.loading', { provider_name: name });
  return name;
}
