import type { Translator } from '../../../../shared/i18n/formatMessage';
import { createSearchService } from './services/suggestions';
import { LocalizedError } from '../../../../shared/i18n/errors';
import { createLazyLoader } from '../../../../shared/helpers/lazy';
import {
  suggestionRequest,
  readSuggestionResponse,
  parseTextSuggestions,
  parseImdbSuggestions,
  parseKinopoiskSuggestions,
  parseMyShowsSuggestions,
} from './adapters/providers';
export function createSearchModule(t: Translator) {
  const network = createLazyLoader(async () => {
    const { createKinopoiskNetwork } = await import('./adapters/kinopoiskNetwork');
    return createKinopoiskNetwork();
  });
  const service = createSearchService({
    request: suggestionRequest,
    read: readSuggestionResponse,
    prepareKinopoisk: async () => {
      const prepare = await network.get();
      await prepare();
    },
    error: (message) => new LocalizedError(message),
    parse: {
      text: parseTextSuggestions,
      imdb: (value) => parseImdbSuggestions(value, t),
      kinopoisk: (value) => parseKinopoiskSuggestions(value, t),
      myshows: (value) => parseMyShowsSuggestions(value, t),
    },
  });
  return { ...service, dispose: network.dispose };
}
