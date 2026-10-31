import type { SearchProviderId, SearchSuggestion } from '../entities/models';
import type { MessageText } from '../../../../../shared/i18n/contracts';
export interface SuggestionRequest {
  url: string;
  init?: RequestInit;
}
export interface SearchPorts {
  request(provider: SearchProviderId, query: string): SuggestionRequest;
  read(request: SuggestionRequest, signal: AbortSignal): Promise<unknown>;
  prepareKinopoisk(): Promise<void>;
  error(message: MessageText): Error;
  parse: Record<'text' | 'imdb' | 'kinopoisk' | 'myshows', (value: unknown) => SearchSuggestion[]>;
}
