import type { MailProvider, MailStatus } from '../entities/models';
export type MailReaders = Record<MailProvider, (signal: AbortSignal) => Promise<number>>;
export function createMailService(
  readers: MailReaders,
  errorStatus: (cause: unknown) => Extract<MailStatus, 'unauthenticated' | 'error' | 'unsupported'>,
) {
  return {
    errorStatus,
    unread(provider: MailProvider, signal: AbortSignal): Promise<number> {
      return readers[provider](AbortSignal.any([signal, AbortSignal.timeout(8000)]));
    },
  };
}
export type MailService = ReturnType<typeof createMailService>;
