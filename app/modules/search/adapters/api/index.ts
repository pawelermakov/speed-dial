import type { Translator } from '../../../../common/i18n/formatMessage';
import { message } from '../../../../common/i18n/messages';
import { LocalizedError } from '../../../../common/i18n/errors';
import type { SearchProviderId, SearchSuggestion } from '../../entities/models';
import type { SearchApi as SearchApiContract } from '../../services/interfaces';
import { suggestionRequest, type SuggestionRequest } from './requests';
import {
  parseTextSuggestions,
  parseImdbSuggestions,
  parseKinopoiskSuggestions,
  parseMyShowsSuggestions,
} from './responses';
export { suggestionRequest } from './requests';
export {
  parseTextSuggestions,
  parseImdbSuggestions,
  parseKinopoiskSuggestions,
  parseMyShowsSuggestions,
} from './responses';

export class SearchApi implements SearchApiContract {
  constructor(
    private readonly translate: Translator,
    private readonly prepareKinopoisk: () => Promise<void> = async () => {},
  ) {}
  suggestions = async (
    provider: SearchProviderId,
    q: string,
    signal: AbortSignal,
  ): Promise<SearchSuggestion[]> => {
    if (provider === 'bookmarks') return [];
    if (provider === 'kinopoisk') {
      await this.prepareKinopoisk();
      signal.throwIfAborted();
    }
    const request = suggestionRequest(provider, q);
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
    let value = await readSuggestionResponse(request, boundedSignal);
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
      value = await readSuggestionResponse(request, boundedSignal);
    }
    switch (provider) {
      case 'yandex':
      case 'google':
        return parseTextSuggestions(value);
      case 'imdb':
        return parseImdbSuggestions(value, this.translate);
      case 'kinopoisk':
        return parseKinopoiskSuggestions(value, this.translate);
      case 'myshows':
        return parseMyShowsSuggestions(value, this.translate);
    }
  };
}
const maxResponseBytes = 256 * 1024;
export async function readSuggestionResponse(
  request: SuggestionRequest,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(request.url, {
    ...request.init,
    credentials: 'omit',
    redirect: 'error',
    signal,
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (
    !mime ||
    !['application/json', 'text/json', 'text/javascript', 'application/javascript'].includes(mime)
  )
    throw new LocalizedError(message('search.errors.json_expected'));
  if (Number(response.headers.get('content-length')) > maxResponseBytes)
    throw new LocalizedError(message('search.errors.response_too_large'));
  const reader = response.body?.getReader();
  if (!reader) throw new LocalizedError(message('search.errors.empty_response'));
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxResponseBytes)
        throw new LocalizedError(message('search.errors.response_too_large'));
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
