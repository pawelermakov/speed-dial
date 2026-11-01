export type MailProvider = 'mailru' | 'gmail' | 'yandex';
export type MailStatus = 'loading' | 'ready' | 'unauthenticated' | 'error' | 'unsupported';

export interface MailPreferences {
  mailruEnabled: boolean;
  gmailEnabled: boolean;
  yandexMailEnabled: boolean;
}
