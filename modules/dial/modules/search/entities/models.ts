export const searchProviderIds = [
  'yandex',
  'google',
  'kinopoisk',
  'imdb',
  'myshows',
  'bookmarks',
] as const;
export const movieProviderIds = ['kinopoisk', 'imdb', 'myshows'] as const;
export const isMovieProvider = (provider: unknown): boolean =>
  movieProviderIds.includes(provider as (typeof movieProviderIds)[number]);
export type SearchProviderId = (typeof searchProviderIds)[number];
export interface SearchSuggestion {
  id: string;
  label: string;
  subtitle?: string;
  targetUrl?: string;
}
