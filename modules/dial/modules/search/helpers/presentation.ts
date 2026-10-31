import { t, message, LocalizedError } from '../../../../../services/i18n';
import type { SearchProviderId } from '../entities/models';
export const searchProviders: ReadonlyArray<{ id: SearchProviderId; label: string }> = [
  {
    id: 'yandex',
    get label() {
      return t('search.providers.yandex');
    },
  },
  { id: 'google', label: 'Google' },
  {
    id: 'bookmarks',
    get label() {
      return t('bookmarks.title');
    },
  },
  {
    id: 'kinopoisk',
    get label() {
      return t('search.providers.kinopoisk');
    },
  },
  { id: 'imdb', label: 'IMDb' },
  { id: 'myshows', label: 'MyShows' },
];

export function searchUrl(provider: SearchProviderId, query: string): string {
  const q = query.trim();
  switch (provider) {
    case 'bookmarks':
      throw new LocalizedError(message('search.bookmarks.local_only'));
    case 'yandex':
      return 'https://www.yandex.ru/yandsearch?' + new URLSearchParams({ text: q });
    case 'google':
      return 'https://www.google.com/search?' + new URLSearchParams({ q });
    case 'kinopoisk':
      return 'https://www.kinopoisk.ru/new-search/?' + new URLSearchParams({ text: q });
    case 'imdb':
      return 'https://www.imdb.com/find/?' + new URLSearchParams({ q });
    case 'myshows':
      return 'https://myshows.me/search/?' + new URLSearchParams({ q });
  }
}
