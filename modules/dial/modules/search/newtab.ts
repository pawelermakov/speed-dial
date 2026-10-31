import { createSearchService } from './services/suggestions';
import { LocalizedError } from '../../../../services/i18n';
import { createLazyLoader } from '../../../../shared/helpers/lazy';
import {
  suggestionRequest,
  readSuggestionResponse,
  parseTextSuggestions,
  parseImdbSuggestions,
  parseKinopoiskSuggestions,
  parseMyShowsSuggestions,
} from './adapters/providers';
export function createSearchModule() {
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
      imdb: parseImdbSuggestions,
      kinopoisk: parseKinopoiskSuggestions,
      myshows: parseMyShowsSuggestions,
    },
  });
  return { ...service, dispose: network.dispose };
}
