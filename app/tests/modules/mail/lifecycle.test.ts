import { expect, it, vi } from 'vitest';
import { MailService } from '../../../modules/mail/services/counter';

it('cancels pending counters and rejects later checks after disposal', async () => {
  let signal!: AbortSignal;
  const read = vi.fn((value: AbortSignal) => {
    signal = value;
    return new Promise<number>(() => {});
  });
  const service = new MailService({
    readers: { gmail: read, mailru: read, yandex: read },
    errorStatus: () => 'error',
  });
  const pending = service.unread('gmail', new AbortController().signal);
  const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  service.dispose();
  service.dispose();
  await cancelled;
  expect(signal.aborted).toBe(true);
  await expect(service.unread('gmail', new AbortController().signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(read).toHaveBeenCalledTimes(1);
});
