import type { SearchProviderId, SearchSuggestion } from '../entities/models';
import type { MessageText } from '../../../common/i18n/contracts';

export interface SearchApi {
  suggestions(
    provider: SearchProviderId,
    query: string,
    signal: AbortSignal,
  ): Promise<SearchSuggestion[]>;
}
export interface SearchPorts {
  api: SearchApi;
  error(message: MessageText): Error;
}
export type ISearchService = SearchApi;
