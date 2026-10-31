import { expect, it, vi } from 'vitest';
import { createSearchService } from '../services/suggestions';
import type { SearchPorts } from '../services/interfaces';
it('does not issue HTTP after cancellation while preparing Kinopoisk', async () => {
  let ready!: () => void;
  const ports: SearchPorts = {
    prepareKinopoisk: () =>
      new Promise((resolve) => {
        ready = resolve;
      }),
    read: vi.fn(),
    request: vi.fn(),
    error: () => new Error('invalid'),
    parse: { text: vi.fn(), imdb: vi.fn(), kinopoisk: vi.fn(), myshows: vi.fn() },
  };
  const controller = new AbortController();
  const result = createSearchService(ports).suggestions('kinopoisk', 'test', controller.signal);
  const rejected = expect(result).rejects.toThrow();
  controller.abort();
  ready();
  await rejected;
  expect(ports.request).not.toHaveBeenCalled();
  expect(ports.read).not.toHaveBeenCalled();
});
