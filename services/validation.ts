import { defaults, themeModes, type ThemeMode, searchProviderIds, isMovieProvider, type Settings, type SearchProviderId } from '../types/models';
export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ': ожидается объект.');
  return value as Record<string, unknown>;
}
export function normalizeUrl(input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) throw new Error('Введите адрес сайта.');
  const text = input.trim();
  let url: URL;
  try { url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : 'https://' + text); }
  catch { throw new Error('Некорректный адрес сайта.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password)
    throw new Error('Разрешены только HTTP/HTTPS адреса без логина и пароля.');
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
      throw new Error('Введите полный IP-адрес сайта.');
    return value;
  }
  // Accept public domains, localhost and IP literals without fetching the site.
  if (host !== 'localhost' && !host.startsWith('[') &&
    (!host.includes('.') || !/^(?:[a-z]{2,63}|xn--[a-z\d-]{2,59})$/i.test(host.split('.').at(-1)!) || host.length > 253 || host.split('.').some(label =>
      !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))))
    throw new Error('Введите полный адрес сайта, например example.com.');
  return value;
}
function boolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  throw new Error('Некорректное значение переключателя.');
}
export function validateSettings(input: unknown): Settings {
  const data = input === undefined ? {} : record(input, 'Настройки');
  const number = (key: 'width' | 'countColumns' | 'space', min: number, max: number) => {
    const value = data[key] === undefined || data[key] === '' ? defaults[key] : Number(data[key]);
    if ((typeof data[key] !== 'number' && typeof data[key] !== 'string' && data[key] !== undefined) ||
      !Number.isInteger(value) || value < min || value > max) throw new Error(key + ': допустимо целое число ' + min + '–' + max + '.');
    return value;
  };
  const email = data.email ?? '';
  if (typeof email !== 'string' || email.length > 254 || (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())))
    throw new Error('Некорректный E-mail.');
  return {
    theme: themeModes.includes(data.theme as ThemeMode) ? data.theme as ThemeMode : 'system',
    width: number('width', 50, 100), countColumns: number('countColumns', 2, 12), space: number('space', 0, 48),
    verticalCenter: boolean(data.verticalCenter, false), addButton: boolean(data.addButton, false), bookmarkSearch: boolean(data.bookmarkSearch, true), movieSearch: boolean(data.movieSearch, isMovieProvider(data.searchProvider)), email: email.trim(),
    searchProvider: ((data.bookmarkSearch === false && data.searchProvider === 'bookmarks') || (data.movieSearch === false && isMovieProvider(data.searchProvider))) ? 'yandex' : searchProviderIds.includes(data.searchProvider as SearchProviderId) ? data.searchProvider as SearchProviderId : 'yandex',
  };
}
export function safeFavicon(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw new Error('favicon: ожидается строка.');
  if (/^data:image\/(?:png|jpeg|webp|gif|x-icon|vnd.microsoft.icon);base64,/i.test(value)) return value;
  return normalizeUrl(value);
}
