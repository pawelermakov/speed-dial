import { message } from '../../../../../shared/i18n/messages';
import type { SearchProviderId, SearchSuggestion } from '../entities/models';
import type { SearchPorts } from './interfaces';
export const maxSearchQuery = 256;
export function createSearchService(ports: SearchPorts) {
  async function suggestions(
    provider: SearchProviderId,
    query: string,
    signal: AbortSignal,
  ): Promise<SearchSuggestion[]> {
    const q = query.trim();
    if (!q || provider === 'bookmarks') return [];
    if (q.length > maxSearchQuery) throw ports.error(message('search.errors.query_too_long'));
    if (provider === 'kinopoisk') {
      await ports.prepareKinopoisk();
      signal.throwIfAborted();
    }
    const request = ports.request(provider, q);
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
    let value = await ports.read(request, boundedSignal);
    // Kinopoisk occasionally returns a transient GraphQL error with HTTP 200.
    // Retry once within the original deadline; never retry access denials.
    const object = (value: unknown): Record<string, unknown> | undefined =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
    const errors = object(value)?.errors;
    if (
      provider === 'kinopoisk' &&
      Array.isArray(errors) &&
      errors.length &&
      errors.every((error) => object(object(error)?.extensions)?.code === 'InternalServerError')
    ) {
      boundedSignal.throwIfAborted();
      value = await ports.read(request, boundedSignal);
    }
    switch (provider) {
      case 'yandex':
      case 'google':
        return ports.parse.text(value);
      case 'imdb':
        return ports.parse.imdb(value);
      case 'kinopoisk':
        return ports.parse.kinopoisk(value);
      case 'myshows':
        return ports.parse.myshows(value);
    }
  }

  return { suggestions };
}
