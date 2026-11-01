import type { MailProvider, MailStatus } from '../entities/models';

export type MailReaders = Record<MailProvider, (signal: AbortSignal) => Promise<number>>;
export type MailErrorStatus = Extract<MailStatus, 'unauthenticated' | 'error' | 'unsupported'>;

export interface MailServicePorts {
  readers: MailReaders;
  errorStatus(cause: unknown): MailErrorStatus;
}

export interface IMailService {
  unread(provider: MailProvider, signal: AbortSignal): Promise<number>;
  errorStatus(cause: unknown): MailErrorStatus;
}
