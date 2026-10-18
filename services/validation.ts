import { defaults, searchProviderIds, type Settings, type SearchProviderId } from '../types/models';
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
function boolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (value === true || value === 'true' || value === 'on' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '' || value === '0' || value === 0) return false;
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
  const appearanceNumber=(key:'uiRadius'|'uiTransparency',max:number)=>{
    const raw=data[key],value=typeof raw==='number'||typeof raw==='string'&&raw.trim()!==''?Number(raw):NaN;
    return Number.isInteger(value)&&value>=0&&value<=max?value:defaults[key];
  };
  let uiBlur=defaults.uiBlur;
  try{uiBlur=boolean(data.uiBlur,defaults.uiBlur);}catch{/* Older or damaged preferences use the safe default. */}
  if (typeof email !== 'string' || email.length > 254 || (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())))
    throw new Error('Некорректный E-mail.');
  return {
    width: number('width', 50, 100), countColumns: number('countColumns', 2, 12), space: number('space', 0, 48),
    verticalCenter: boolean(data.verticalCenter, false), addButton: boolean(data.addButton, false), bookmarkSearch: boolean(data.bookmarkSearch, true), email: email.trim(),
    searchProvider: searchProviderIds.includes(data.searchProvider as SearchProviderId) ? data.searchProvider as SearchProviderId : 'yandex',
    uiRadius:appearanceNumber('uiRadius',24),uiTransparency:appearanceNumber('uiTransparency',50),uiBlur,
    uiAccent:typeof data.uiAccent==='string'&&/^#[0-9a-f]{6}$/i.test(data.uiAccent)?data.uiAccent.toUpperCase():defaults.uiAccent,
  };
}
export function safeFavicon(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw new Error('favicon: ожидается строка.');
  if (/^data:image\/(?:png|jpeg|webp|gif|x-icon|vnd.microsoft.icon);base64,/i.test(value)) return value;
  return normalizeUrl(value);
}
