import type { Snapshot } from '../types/models';
import { imageFromDataUrl, blobToDataUrl } from './images';
import { normalizeUrl, record, safeFavicon, validateSettings } from './validation';
export function parseImport(text: string): Snapshot {
  if (text.length > 100 * 1024 * 1024) throw new Error('JSON больше 100 МБ.');
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error('Некорректный JSON.'); }
  const data = record(json, 'JSON');
  if (!Array.isArray(data.tabs) || data.tabs.length > 10000) throw new Error('tabs: ожидается массив до 10000 закладок.');
  const settingsData = data.settings === undefined ? {} : record(data.settings, 'settings');
  const ids = new Set<number>();
  const rows = data.tabs.map((value, index) => {
    const row = record(value, 'Закладка ' + (index + 1));
    try {
      const url = normalizeUrl(row.url);
      if (row.title !== undefined && typeof row.title !== 'string') throw new Error('title: ожидается строка.');
      if (row.id !== undefined && (!Number.isSafeInteger(row.id) || Number(row.id) < 1)) throw new Error('id: нужно положительное целое число.');
      if (row.position !== undefined && (!Number.isSafeInteger(row.position) || Number(row.position) < 0)) throw new Error('position: нужно неотрицательное целое число.');
      return { id: Number(row.id) || 0, url, title: (row.title as string | undefined) ?? new URL(url).hostname,
        favicon: safeFavicon(row.favicon), thumbnail: imageFromDataUrl(row.thumbnail, 'Эскиз'), position: Number(row.position ?? index + 1), index };
    } catch (error) { throw new Error('Закладка ' + (index + 1) + ': ' + (error instanceof Error ? error.message : error)); }
  });
  let nextId = Math.max(0, ...rows.map(row => row.id)) + 1;
  const tabs = rows.sort((a, b) => a.position - b.position || a.index - b.index).map((row, index) => {
    let id = row.id;
    if (!id || ids.has(id)) id = nextId++;
    if (!Number.isSafeInteger(id)) throw new Error('Слишком большой id.');
    ids.add(id);
    const { index: _index, ...bookmark } = row;
    return { ...bookmark, id, position: index + 1 };
  });
  return { tabs, settings: validateSettings(settingsData), background: imageFromDataUrl(settingsData.background, 'Фон') };
}
export async function serializeExport(snapshot: Snapshot): Promise<string> {
  const tabs = snapshot.tabs.slice().sort((a, b) => a.position - b.position).map(tab => ({ ...tab, thumbnail: '' }));
  return JSON.stringify({ tabs, settings: { ...snapshot.settings, background: await blobToDataUrl(snapshot.background) } }, null, 2);
}
export function downloadExport(text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'export.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
