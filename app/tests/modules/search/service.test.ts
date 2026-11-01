import { expect, it, vi } from 'vitest';
import { SearchService } from '../../../modules/search/services/suggestions';
import { SearchApi } from '../../../modules/search/adapters/api';
import { t } from '../../helpers/i18n';
it('does not issue HTTP after cancellation while preparing Kinopoisk', async () => {
  let ready!: () => void;
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const api = new SearchApi(
    t,
    () =>
      new Promise<void>((resolve) => {
        ready = resolve;
      }),
  );
  const controller = new AbortController();
  const result = new SearchService({ api, error: () => new Error('invalid') }).suggestions(
    'kinopoisk',
    'test',
    controller.signal,
  );
  const rejected = expect(result).rejects.toThrow();
  controller.abort();
  ready();
  await rejected;
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it('validates and normalizes queries before calling the API port', async () => {
  const api = { suggestions: vi.fn(async () => []) };
  const service = new SearchService({ api, error: () => new Error('invalid') });
  const signal = new AbortController().signal;
  await service.suggestions('google', '  query  ', signal);
  expect(api.suggestions).toHaveBeenCalledWith('google', 'query', expect.any(AbortSignal));
  await expect(service.suggestions('google', 'x'.repeat(257), signal)).rejects.toThrow('invalid');
  await service.suggestions('bookmarks', 'local', signal);
  await service.suggestions('google', '   ', signal);
  expect(api.suggestions).toHaveBeenCalledTimes(1);
});

it('aborts outstanding requests on dispose and never starts new ones', async () => {
  let received!: AbortSignal;
  const suggestions = vi.fn((_provider: string, _query: string, signal: AbortSignal) => {
    received = signal;
    return new Promise<[]>(() => {});
  });
  const service = new SearchService({ api: { suggestions }, error: () => new Error('invalid') });
  const pending = service.suggestions('google', 'query', new AbortController().signal);
  const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  service.dispose();
  await cancelled;
  expect(received.aborted).toBe(true);
  await expect(
    service.suggestions('google', '', new AbortController().signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(suggestions).toHaveBeenCalledTimes(1);
});

it('does not cancel unrelated queries when the caller aborts one request', async () => {
  const signals: AbortSignal[] = [];
  const suggestions = vi.fn((_provider: string, _query: string, signal: AbortSignal) => {
    signals.push(signal);
    return new Promise<[]>(() => {});
  });
  const service = new SearchService({ api: { suggestions }, error: () => new Error('invalid') });
  const controller = new AbortController();
  const first = service.suggestions('google', 'first', controller.signal);
  const second = service.suggestions('google', 'second', new AbortController().signal);
  const firstCancelled = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  const secondCancelled = expect(second).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await firstCancelled;
  expect(signals[1]!.aborted).toBe(false);
  service.dispose();
  await secondCancelled;
});

it('releases module resources once even when disposal is repeated', () => {
  const release = vi.fn();
  const service = new SearchService(
    {
      api: { suggestions: vi.fn(async () => []) },
      error: () => new Error('invalid'),
    },
    release,
  );
  service.dispose();
  service.dispose();
  expect(release).toHaveBeenCalledTimes(1);
});
