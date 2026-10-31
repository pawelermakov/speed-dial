import type { Translator } from '../../../../../shared/i18n/formatMessage';
import { message } from '../../../../../shared/i18n/messages';
import { LocalizedError } from '../../../../../shared/i18n/errors';
import type { SearchProviderId, SearchSuggestion } from '../entities/models';
import { kinopoiskQuery } from './kinopoiskQuery';

const maxResponseBytes = 256 * 1024;
type Row = Record<string, unknown>;
const object = (value: unknown): Row | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : undefined;
function text(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.trim() &&
    value.length <= 300 &&
    // eslint-disable-next-line no-control-regex -- Reject control characters in provider URLs.
    !/[\u0000-\u001f\u007f]/.test(value)
    ? value.trim()
    : undefined;
}
const id = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
const year = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1800 && value <= 3000
    ? String(value)
    : undefined;
function unique(rows: SearchSuggestion[]): SearchSuggestion[] {
  return [...new Map(rows.map((row) => [row.id, row])).values()].slice(0, 8);
}
function invalid(): never {
  throw new LocalizedError(message('search.errors.unknown_suggestion_format'));
}

export function parseTextSuggestions(value: unknown): SearchSuggestion[] {
  if (!Array.isArray(value) || !Array.isArray(value[1])) return invalid();
  return unique(
    value[1].flatMap((item) => {
      const label = text(item);
      return label ? [{ id: label, label }] : [];
    }),
  );
}
export function parseImdbSuggestions(value: unknown, t: Translator): SearchSuggestion[] {
  const root = object(value);
  if (
    !root ||
    (root.d !== undefined && !Array.isArray(root.d)) ||
    (root.d === undefined && typeof root.q !== 'string')
  )
    return invalid();
  return unique(
    ((root.d ?? []) as unknown[]).flatMap((value) => {
      const row = object(value),
        label = text(row?.l),
        key = row?.id;
      if (!label || typeof key !== 'string' || !/^(tt|nm)\d{5,12}$/.test(key)) return [];
      const person = key.startsWith('nm');
      const kind = person
        ? t('search.result_types.person')
        : row?.qid === 'movie'
          ? t('search.result_types.movie')
          : row?.qid === 'tvSeries' || row?.qid === 'tvMiniSeries'
            ? t('search.result_types.series')
            : undefined;
      return [
        {
          id: key,
          label,
          subtitle: [year(row?.y), kind].filter(Boolean).join(' · ') || undefined,
          targetUrl: 'https://www.imdb.com/' + (person ? 'name/' : 'title/') + key + '/',
        },
      ];
    }),
  );
}
export function parseMyShowsSuggestions(value: unknown, t: Translator): SearchSuggestion[] {
  const root = object(value);
  if (!root || root.jsonrpc !== '2.0' || root.error || !Array.isArray(root.result))
    return invalid();
  return unique(
    root.result.flatMap((value) => {
      const row = object(value),
        key = id(row?.id),
        label = text(row?.title) ?? text(row?.titleOriginal);
      return key && label
        ? [
            {
              id: key,
              label,
              subtitle: [year(row?.year), t('search.result_types.series')]
                .filter(Boolean)
                .join(' · '),
              targetUrl: 'https://myshows.me/view/' + key + '/',
            },
          ]
        : [];
    }),
  );
}
export function parseKinopoiskSuggestions(value: unknown, t: Translator): SearchSuggestion[] {
  const root = object(value),
    top = object(object(object(root?.data)?.suggest)?.top);
  if (!top || !Array.isArray(top.movies)) return invalid();
  const values = [
    object(top.topResult)?.global,
    ...top.movies.map((value) => object(value)?.movie),
  ];
  return unique(
    values.flatMap((value) => {
      const row = object(value),
        key = id(row?.id),
        title = object(row?.title),
        label = text(title?.russian) ?? text(title?.original);
      const film = row?.__typename === 'Film',
        series = ['TvSeries', 'TvShow', 'MiniSeries'].includes(String(row?.__typename));
      if (!key || !label || (!film && !series)) return [];
      return [
        {
          id: key,
          label,
          subtitle: [
            year(row?.productionYear) ?? year(object(row?.releaseYears)?.start),
            film ? t('search.result_types.movie') : t('search.result_types.series'),
          ]
            .filter(Boolean)
            .join(' · '),
          targetUrl: 'https://www.kinopoisk.ru/' + (film ? 'film/' : 'series/') + key + '/',
        },
      ];
    }),
  );
}

export function suggestionRequest(
  provider: SearchProviderId,
  query: string,
): { url: string; init?: RequestInit } {
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
          }),
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
          }),
        },
      };
  }
}
export async function readSuggestionResponse(
  request: ReturnType<typeof suggestionRequest>,
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
