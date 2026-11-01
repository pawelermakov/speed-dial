import { message } from '../../../../common/i18n/messages';
import { LocalizedError } from '../../../../common/i18n/errors';
import type { SearchProviderId } from '../../entities/models';
import { kinopoiskQuery } from './kinopoiskQuery';

export interface SuggestionRequest {
  url: string;
  init?: RequestInit;
}
export interface MyShowsSearchRequest {
  jsonrpc: '2.0';
  method: 'shows.Search';
  params: { query: string };
  id: number;
}
export interface KinopoiskSearchRequest {
  operationName: 'SuggestSearch';
  variables: { keyword: string; limit: number; withUserData: boolean };
  query: string;
}

export function suggestionRequest(provider: SearchProviderId, query: string): SuggestionRequest {
  if (provider === 'bookmarks') throw new LocalizedError(message('search.bookmarks.local_only'));
  const q = query.trim();
  switch (provider) {
    case 'yandex':
      return { url: 'https://suggest.yandex.ru/suggest-sl?' + new URLSearchParams({ part: q }) };
    case 'google':
      return {
        url:
          'https://suggestqueries.google.com/complete/search?' +
          new URLSearchParams({ client: 'firefox', q }),
      };
    case 'imdb':
      return {
        url: 'https://v3.sg.media-imdb.com/suggestion/x/' + encodeURIComponent(q) + '.json',
      };
    case 'myshows':
      return {
        url: 'https://api.myshows.me/v2/rpc/',
        init: {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'shows.Search',
            params: { query: q },
            id: 1,
          } satisfies MyShowsSearchRequest),
        },
      };
    case 'kinopoisk':
      return {
        url: 'https://graphql.kinopoisk.ru/graphql/?operationName=SuggestSearch',
        init: {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'service-id': '25' },
          body: JSON.stringify({
            operationName: 'SuggestSearch',
            variables: { keyword: q, limit: 6, withUserData: false },
            query: kinopoiskQuery,
          } satisfies KinopoiskSearchRequest),
        },
      };
  }
}
