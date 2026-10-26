import { isLanguage, message, LocalizedError, type MessageText } from './i18n';
import { weatherCities, weatherProviders } from '../utils/weather';
import { defaults, themeModes, type ThemeMode, searchProviderIds, isMovieProvider, type Settings, type SearchProviderId } from '../types/models';
export function record(value: unknown, label: MessageText): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LocalizedError(message('validation.object.required', {field_name: label}));
  return value as Record<string, unknown>;
}
export function normalizeUrl(input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) throw new LocalizedError(message('validation.url.required'));
  const text = input.trim();
  let url: URL;
  try { url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : 'https://' + text); }
  catch { throw new LocalizedError(message('validation.url.invalid')); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password)
    throw new LocalizedError(message('validation.url.http_without_credentials'));
  return url.href;
}
export function normalizeBookmarkUrl(input: string): string {
  const value = normalizeUrl(input);
  const host = new URL(value).hostname.replace(/\.$/, '');
  const rawHost = input.trim().replace(/^https?:\/\//i, '').split(/[/?#]/, 1)[0]!.replace(/:\d*$/, '');
  if (/^(?:\d+\.){3}\d+$/.test(host)) {
    // URL accepts shorthand like "1" or "1.2" as IPv4. Require the full
    // dotted-decimal address the user actually entered instead.
    if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(rawHost) || rawHost.split('.').some(part => Number(part) > 255))
      throw new LocalizedError(message('validation.url.full_ip_required'));
    return value;
  }
  // Accept public domains, localhost and IP literals without fetching the site.
  if (host !== 'localhost' && !host.startsWith('[') &&
    (!host.includes('.') || !/^(?:[a-z]{2,63}|xn--[a-z\d-]{2,59})$/i.test(host.split('.').at(-1)!) || host.length > 253 || host.split('.').some(label =>
      !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))))
    throw new LocalizedError(message('validation.url.full_address_required'));
  return value;
}
function boolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  throw new LocalizedError(message('validation.switch.invalid'));
}
export function validateSettings(input: unknown): Settings {
  const data = input === undefined ? {} : record(input, message('settings.title'));
  if(Object.keys(data).some(key=>!Object.hasOwn(defaults,key)))throw new LocalizedError(message('validation.settings.unknown_field'));
  if(data.theme!==undefined&&!themeModes.includes(data.theme as ThemeMode))throw new LocalizedError(message('validation.theme.invalid'));
  if(data.searchProvider!==undefined&&!searchProviderIds.includes(data.searchProvider as SearchProviderId))throw new LocalizedError(message('validation.search_provider.invalid'));
  if(data.weatherCity!==undefined&&data.weatherCity!==''&&!weatherCities.some(row=>row.id===data.weatherCity))throw new LocalizedError(message('validation.weather_city.invalid'));
  if(data.weatherProvider!==undefined&&!weatherProviders.some(row=>row.id===data.weatherProvider))throw new LocalizedError(message('validation.weather_provider.invalid'));
  const bookmarkSearch=boolean(data.bookmarkSearch,defaults.bookmarkSearch),movieSearch=boolean(data.movieSearch,defaults.movieSearch);
  const number = (key: 'width' | 'countColumns' | 'space', min: number, max: number) => {
    const value = data[key] === undefined || data[key] === '' ? defaults[key] : Number(data[key]);
    if ((typeof data[key] !== 'number' && typeof data[key] !== 'string' && data[key] !== undefined) ||
      !Number.isInteger(value) || value < min || value > max) throw new LocalizedError(message('validation.number.named_range', {field_name: key, min: min, max: max}));
    return value;
  };
  if(data.language!==undefined&&!isLanguage(data.language))throw new LocalizedError(message('validation.language.invalid'));
  return {
    language:data.language===undefined?defaults.language:data.language as Settings['language'],
    mailruEnabled:boolean(data.mailruEnabled,false),gmailEnabled:boolean(data.gmailEnabled,false),yandexMailEnabled:boolean(data.yandexMailEnabled,false),
    weatherEnabled:boolean(data.weatherEnabled,defaults.weatherEnabled),weatherCity:(data.weatherCity||defaults.weatherCity) as Settings['weatherCity'],weatherProvider:(data.weatherProvider??defaults.weatherProvider) as Settings['weatherProvider'],
    theme: themeModes.includes(data.theme as ThemeMode) ? data.theme as ThemeMode : 'system',
    width: number('width', 50, 100), countColumns: number('countColumns', 2, 12), space: number('space', 0, 48),
    verticalCenter: boolean(data.verticalCenter, false), addButton: boolean(data.addButton, false), bookmarkSearch, movieSearch,
    searchProvider: ((!bookmarkSearch && data.searchProvider === 'bookmarks') || (!movieSearch && isMovieProvider(data.searchProvider))) ? 'yandex' : searchProviderIds.includes(data.searchProvider as SearchProviderId) ? data.searchProvider as SearchProviderId : 'yandex',
  };
}
export function safeFavicon(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw new LocalizedError(message('validation.favicon.string_required'));
  if (/^data:image\/(?:png|jpeg|webp|gif|x-icon|vnd.microsoft.icon);base64,/i.test(value)) return value;
  return normalizeUrl(value);
}
