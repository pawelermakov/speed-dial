import { expect, it, vi } from 'vitest';
import { createCaptureQueue } from '../services/queue';
import type { CaptureHandler } from '../services/interfaces';

it('continues serial execution and releases capacity after a rejected job', async () => {
  let fail!: (reason: Error) => void;
  const execute = vi
    .fn<CaptureHandler>()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    )
    .mockImplementation(async (request) => ({ requestId: request.requestId }));
  const queue = createCaptureQueue(execute);
  const signal = new AbortController().signal;
  const request = (id: string) => ({
    type: 'capture' as const,
    requestId: id,
    url: 'https://example.com',
  });
  const first = queue(request('first'), 1, signal);
  const rejected = expect(first).rejects.toThrow('failed');
  const rest = Array.from({ length: 7 }, (_, i) => queue(request(String(i)), 1, signal));
  expect(await queue(request('overflow'), 1, signal)).toHaveProperty('error');
  expect(execute).toHaveBeenCalledTimes(1);
  fail(new Error('failed'));
  await rejected;
  await Promise.all(rest);
  expect(await queue(request('retry'), 1, signal)).toEqual({ requestId: 'retry' });
  expect(execute).toHaveBeenCalledTimes(9);
});
