import type { ImportData } from '../types/models';
import { imageFromDataUrl, blobToDataUrl } from './images';
import { normalizeUrl, record, validateSettings } from './validation';
export function parseImport(text: string): ImportData {
  if (text.length > 40 * 1024 * 1024) throw new Error('JSON больше 40 МБ.');
  let json: unknown; try { json = JSON.parse(text); } catch { throw new Error('Некорректный JSON.'); }
  const data = record(json, 'JSON');
  if (data.version !== 2 || !Array.isArray(data.entries) || data.entries.length > 10000) throw new Error('Нужен экспорт Speed Dial версии 2, до 10000 элементов.');
  let count = 0;
  function title(value: unknown) { if (typeof value !== 'string' || value.length > 4096) throw new Error('Название: нужна строка до 4096 символов.'); return value; }
  function bookmark(value: unknown) {
    if (++count > 10000) throw new Error('Больше 10000 закладок.');
    const row = record(value, 'Закладка');
    if ('children' in row) throw new Error('Вложенные категории не поддерживаются.');
    return { title: title(row.title), url: normalizeUrl(row.url) };
  }
  const entries = data.entries.map(value => {
    const row = record(value, 'Элемент');
    if ('url' in row) return bookmark(row);
    if (!Array.isArray(row.children) || row.children.length > 10000) throw new Error('Категория: нужен массив children.');
    return { title: title(row.title), children: row.children.map(bookmark) };
  });
  return { entries, settings: validateSettings(data.settings), background: imageFromDataUrl(data.background, 'Фон') };
}
export async function serializeExport(data: ImportData): Promise<string> { return JSON.stringify({ version: 2, entries: data.entries, settings: data.settings, background: await blobToDataUrl(data.background) }, null, 2); }
export function downloadExport(text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'speed-dial.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
