import { defaults, type Settings } from '../types/models';
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
  if (typeof email !== 'string' || email.length > 254 || (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())))
    throw new Error('Некорректный E-mail.');
  return {
    width: number('width', 50, 100), countColumns: number('countColumns', 2, 12), space: number('space', 0, 48),
    verticalCenter: boolean(data.verticalCenter, false), addButton: boolean(data.addButton, false), email: email.trim(),
  };
}
export function safeFavicon(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw new Error('favicon: ожидается строка.');
  if (/^data:image\/(?:png|jpeg|webp|gif|x-icon|vnd.microsoft.icon);base64,/i.test(value)) return value;
  return normalizeUrl(value);
}
