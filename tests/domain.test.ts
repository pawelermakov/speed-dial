import { describe, expect, it } from 'vitest';
import fixture from './fixtures/legacy-export.json';
import { parseImport, serializeExport } from '../services/importExport';
import { legacySettings, normalizeUrl, validateSettings } from '../services/validation';
import { imageFromDataUrl } from '../services/images';
import { parseMailCount, parseSuggestions } from '../services/network';
import { defaults } from '../types/models';

describe('legacy import and validation', () => {
  it('preserves legacy fields and parses string booleans', () => {
    const result = parseImport(JSON.stringify(fixture));
    expect(result.settings).toEqual({ ...defaults, verticalCenter: true });
    expect(result.tabs[1]?.title).toBe('<b>Текст, не HTML</b>');
    expect(result.tabs[0]?.favicon).toBe(fixture.tabs[0]?.favicon);
    expect(result.tabs[0]?.thumbnail).toBeNull();
  });
  it('handles empty/partial exports and missing localStorage', () => {
    expect(parseImport('{"tabs":[]}')).toEqual({ tabs: [], settings: defaults, background: null });
    expect(validateSettings(legacySettings(null))).toEqual(defaults);
    expect(validateSettings(legacySettings({ getItem: key => key === 'addButton' ? 'false' : key === 'space' ? '0' : null }))).toEqual({ ...defaults, space: 0 });
  });
  it.each(['javascript:alert(1)', 'data:text/html,x', 'file:///x', 'chrome://settings', 'about:blank', 'https://user:pass@example.com'])('rejects unsafe URL %s', url => {
    expect(() => normalizeUrl(url)).toThrow();
  });
  it('normalizes HTTP/HTTPS without switching provider', () => {
    expect(normalizeUrl(' example.com ')).toBe('https://example.com/');
    expect(normalizeUrl('http://example.com')).toBe('http://example.com/');
  });
  it.each(['invalid', '[]', '{}', '{"tabs":null}', '{"tabs":[{"url":"javascript:x"}]}', '{"tabs":[],"settings":{"width":49}}', '{"tabs":[],"settings":{"space":true}}'])('rejects %s', text => {
    expect(() => parseImport(text)).toThrow();
  });
  it('normalizes duplicate IDs, missing IDs, tied/gapped positions deterministically', () => {
    const input = JSON.stringify({ tabs: [
      { id: 2, url: 'https://a.example', position: 8 },
      { id: 2, url: 'https://b.example', position: 1 },
      { url: 'https://c.example', position: 1 },
      { id: 3, url: 'https://d.example', position: 10 },
    ] });
    const first = parseImport(input);
    expect(first.tabs.map(tab => tab.position)).toEqual([1, 2, 3, 4]);
    expect(first.tabs.map(tab => tab.url)).toEqual(['https://b.example/', 'https://c.example/', 'https://a.example/', 'https://d.example/']);
    expect(new Set(first.tabs.map(tab => tab.id)).size).toBe(4);
    expect(parseImport(input)).toEqual(first);
  });
  it('exports without mutating thumbnails; round trips IDs/order/settings', async () => {
    const snapshot = parseImport(JSON.stringify(fixture));
    snapshot.tabs[0]!.thumbnail = new Blob(['image'], { type: 'image/png' });
    const before = snapshot.tabs[0]!.thumbnail;
    const text = await serializeExport(snapshot);
    expect(snapshot.tabs[0]!.thumbnail).toBe(before);
    const roundTrip = parseImport(text);
    expect(roundTrip.settings).toEqual(snapshot.settings);
    expect(roundTrip.tabs.map(tab => tab.id)).toEqual([1, 2]);
    expect(roundTrip.tabs[0]?.thumbnail).toBeNull();
  });
  it('accepts raster data URLs and rejects SVG/script images', async () => {
    expect(await imageFromDataUrl('data:image/png;base64,YQ==')?.text()).toBe('a');
    expect(() => imageFromDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toThrow();
    expect(() => imageFromDataUrl('data:image/png;base64,a')).toThrow();
  });
});
describe('service responses', () => {
  it('extracts only textual Yandex suggestions', () => {
    expect(parseSuggestions(['q', ['a', '<img src=x onerror=x>', 3]])).toEqual(['a', '<img src=x onerror=x>']);
    expect(() => parseSuggestions({})).toThrow();
  });
  it('does not invent Mail.ru unread counts', () => {
    expect(parseMailCount({ data: { mail_cnt: 0 } })).toBe(0);
    expect(parseMailCount({ data: { mail_cnt: 7 } })).toBe(7);
    expect(parseMailCount({ data: { mail_cnt: '5' } })).toBe(5);
    expect(parseMailCount({ data: { mail_cnt: '0' } })).toBe(0);
    for (const count of [-1, '-5', '', ' ', '5x', '1.5', '1e3', null, NaN, 1.5, '9007199254740992']) expect(() => parseMailCount({ data: { mail_cnt: count } })).toThrow();
    expect(() => parseMailCount(null)).toThrow();
    expect(() => parseMailCount({ status: 'noauth', data: { mail_cnt: 0 } })).toThrow('Нет авторизации');
  });
});
