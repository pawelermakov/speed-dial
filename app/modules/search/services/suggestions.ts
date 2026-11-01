import { message } from '../../../common/i18n/messages';
import { abortable } from '../../../common/helpers/abortable';
import type { SearchProviderId, SearchSuggestion } from '../entities/models';
import type { SearchPorts, ISearchService } from './interfaces';
export const maxSearchQuery = 256;
export class SearchService implements ISearchService {
  private readonly lifetime = new AbortController();
  constructor(
    private readonly ports: SearchPorts,
    private readonly cleanup: () => void = () => {},
  ) {}

  dispose = () => {
    if (this.lifetime.signal.aborted) return;
    this.lifetime.abort(new DOMException('Search service is disposed', 'AbortError'));
    this.cleanup();
  };

  suggestions = async (
    provider: SearchProviderId,
    query: string,
    cancellation: AbortSignal,
  ): Promise<SearchSuggestion[]> => {
    this.lifetime.signal.throwIfAborted();
    const signal = AbortSignal.any([cancellation, this.lifetime.signal]);
    const q = query.trim();
    if (!q || provider === 'bookmarks') return [];
    if (q.length > maxSearchQuery) throw this.ports.error(message('search.errors.query_too_long'));
    return abortable(signal, () => this.ports.api.suggestions(provider, q, signal));
  };
}
