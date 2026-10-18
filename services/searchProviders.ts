import type { SearchProviderId, SearchSuggestion } from '../types/models';
import { kinopoiskQuery } from './kinopoiskQuery';

export const searchProviders: ReadonlyArray<{ id: SearchProviderId; label: string }> = [
  { id:'yandex', label:'Яндекс' }, { id:'google', label:'Google' }, { id:'kinopoisk', label:'Кинопоиск' },
  { id:'imdb', label:'IMDb' }, { id:'myshows', label:'MyShows' },
];
export const maxSearchQuery = 256;
const maxResponseBytes = 256 * 1024;
type Row = Record<string, unknown>;
const object = (value: unknown): Row | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : undefined;
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= 300 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : undefined;
}
const id = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
const year = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 1800 && value <= 3000 ? String(value) : undefined;
function unique(rows: SearchSuggestion[]): SearchSuggestion[] { return [...new Map(rows.map(row => [row.id,row])).values()].slice(0,8); }
function invalid(): never { throw new Error('Неизвестный формат подсказок.'); }

export function searchUrl(provider: SearchProviderId, query: string): string {
  const q = query.trim();
  switch (provider) {
    case 'yandex': return 'https://www.yandex.ru/yandsearch?' + new URLSearchParams({text:q});
    case 'google': return 'https://www.google.com/search?' + new URLSearchParams({q});
    case 'kinopoisk': return 'https://www.kinopoisk.ru/new-search/?' + new URLSearchParams({text:q});
    case 'imdb': return 'https://www.imdb.com/find/?' + new URLSearchParams({q});
    case 'myshows': return 'https://myshows.me/search/?' + new URLSearchParams({q});
  }
}

export function parseTextSuggestions(value: unknown): SearchSuggestion[] {
  if (!Array.isArray(value) || !Array.isArray(value[1])) return invalid();
  return unique(value[1].flatMap(item => { const label=text(item); return label ? [{id:label,label}] : []; }));
}
export function parseImdbSuggestions(value: unknown): SearchSuggestion[] {
  const root=object(value);
  if (!root || (root.d !== undefined && !Array.isArray(root.d)) || (root.d === undefined && typeof root.q !== 'string')) return invalid();
  return unique(((root.d ?? []) as unknown[]).flatMap(value => {
    const row=object(value), label=text(row?.l), key=row?.id;
    if (!label || typeof key !== 'string' || !/^(tt|nm)\d{5,12}$/.test(key)) return [];
    const person=key.startsWith('nm');
    const kind=person ? 'человек' : row?.qid === 'movie' ? 'фильм' : row?.qid === 'tvSeries' || row?.qid === 'tvMiniSeries' ? 'сериал' : undefined;
    return [{id:key,label,subtitle:[year(row?.y),kind].filter(Boolean).join(' · ') || undefined,
      targetUrl:'https://www.imdb.com/' + (person?'name/':'title/') + key + '/'}];
  }));
}
export function parseMyShowsSuggestions(value: unknown): SearchSuggestion[] {
  const root=object(value);
  if (!root || root.jsonrpc !== '2.0' || root.error || !Array.isArray(root.result)) return invalid();
  return unique(root.result.flatMap(value => {
    const row=object(value), key=id(row?.id), label=text(row?.title) ?? text(row?.titleOriginal);
    return key && label ? [{id:key,label,subtitle:[year(row?.year),'сериал'].filter(Boolean).join(' · '),targetUrl:'https://myshows.me/view/'+key+'/'}] : [];
  }));
}
export function parseKinopoiskSuggestions(value: unknown): SearchSuggestion[] {
  const root=object(value), top=object(object(object(root?.data)?.suggest)?.top);
  if (!top || !Array.isArray(top.movies)) return invalid();
  const values=[object(top.topResult)?.global,...top.movies.map(value=>object(value)?.movie)];
  return unique(values.flatMap(value=>{
    const row=object(value), key=id(row?.id), title=object(row?.title), label=text(title?.russian) ?? text(title?.original);
    const film=row?.__typename === 'Film', series=['TvSeries','TvShow','MiniSeries'].includes(String(row?.__typename));
    if (!key || !label || (!film && !series)) return [];
    return [{id:key,label,subtitle:[year(row?.productionYear) ?? year(object(row?.releaseYears)?.start),film?'фильм':'сериал'].filter(Boolean).join(' · '),
      targetUrl:'https://www.kinopoisk.ru/'+(film?'film/':'series/')+key+'/'}];
  }));
}

export function suggestionRequest(provider: SearchProviderId, query: string): {url:string; init?:RequestInit} {
  const q=query.trim();
  switch (provider) {
    case 'yandex': return {url:'https://suggest.yandex.ru/suggest-sl?'+new URLSearchParams({part:q})};
    case 'google': return {url:'https://suggestqueries.google.com/complete/search?'+new URLSearchParams({client:'firefox',q})};
    case 'imdb': return {url:'https://v3.sg.media-imdb.com/suggestion/x/'+encodeURIComponent(q)+'.json'};
    case 'myshows': return {url:'https://api.myshows.me/v2/rpc/',init:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'shows.Search',params:{query:q},id:1})}};
    case 'kinopoisk': return {url:'https://graphql.kinopoisk.ru/graphql/?operationName=SuggestSearch',init:{method:'POST',headers:{'content-type':'application/json','service-id':'25'},body:JSON.stringify({operationName:'SuggestSearch',variables:{keyword:q,limit:6,withUserData:false},query:kinopoiskQuery})}};
  }
}
export async function providerSuggestions(provider: SearchProviderId, query: string, signal: AbortSignal): Promise<SearchSuggestion[]> {
  const q=query.trim();
  if (!q) return [];
  if (q.length > maxSearchQuery) throw new Error('Слишком длинный запрос для подсказок.');
  if (provider === 'kinopoisk') {
    const { prepareKinopoiskNetwork } = await import('./kinopoiskNetwork');
    await prepareKinopoiskNetwork();
    signal.throwIfAborted();
  }
  const request=suggestionRequest(provider,q);
  const boundedSignal=AbortSignal.any([signal,AbortSignal.timeout(8000)]);
  let value=await readSuggestionResponse(request,boundedSignal);
  // Kinopoisk occasionally returns a transient GraphQL error with HTTP 200.
  // Retry once within the original deadline; never retry access denials.
  const errors=object(value)?.errors;
  if(provider==='kinopoisk' && Array.isArray(errors) && errors.length &&
    errors.every(error=>object(object(error)?.extensions)?.code==='InternalServerError')) {
    boundedSignal.throwIfAborted();
    value=await readSuggestionResponse(request,boundedSignal);
  }
  switch(provider){case 'yandex':case 'google':return parseTextSuggestions(value);case 'imdb':return parseImdbSuggestions(value);case 'kinopoisk':return parseKinopoiskSuggestions(value);case 'myshows':return parseMyShowsSuggestions(value);}
}
async function readSuggestionResponse(request:ReturnType<typeof suggestionRequest>,signal:AbortSignal):Promise<unknown> {
  const response=await fetch(request.url,{...request.init,credentials:'omit',redirect:'error',signal});
  if (!response.ok) throw new Error('HTTP '+response.status);
  const mime=response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (!mime || !['application/json','text/json','text/javascript','application/javascript'].includes(mime)) throw new Error('Ожидался JSON-ответ.');
  if (Number(response.headers.get('content-length')) > maxResponseBytes) throw new Error('Слишком большой ответ.');
  const reader=response.body?.getReader();
  if (!reader) throw new Error('Пустой ответ сервиса.');
  const chunks:Uint8Array[]=[];let size=0;
  try { while (true) { const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxResponseBytes)throw new Error('Слишком большой ответ.');chunks.push(value); } }
  finally { await reader.cancel().catch(()=>{});reader.releaseLock(); }
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
