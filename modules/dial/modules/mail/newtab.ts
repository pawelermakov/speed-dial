import { createMailService } from './services/counter';
import { readMailru, readOtherProvider, MailError } from './adapters/counters';
export function createMailModule() {
  return createMailService(
    {
      mailru: readMailru,
      gmail: (signal) => readOtherProvider('gmail', signal),
      yandex: (signal) => readOtherProvider('yandex', signal),
    },
    (cause) => (cause instanceof MailError ? cause.kind : 'error'),
  );
}
