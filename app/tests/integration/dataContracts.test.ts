import { describe, expect, it } from 'vitest';
import { parseImport, serializeExport } from '../../modules/backup/adapters/json';
import { normalizeUrl } from '../../common/helpers/url';
import { imageFromDataUrl } from '../../common/helpers/imageData';
import { parseMailCount } from '../../modules/mail/adapters/api';
import { defaults } from '../../modules/settings';
describe('versioned append import validation', () => {
  it('round trips folders/order/settings without cache or profile IDs', async () => {
    const data = {
      entries: [
        { title: 'Site', url: 'https://example.com/' },
        { title: 'Empty', children: [] },
        { title: 'Work', children: [{ title: 'A', url: 'https://a.example/' }] },
      ],
      settings: defaults,
      background: null,
    };
    const text = await serializeExport(data);
    expect(parseImport(text)).toEqual(data);
    expect(text).not.toContain('favicon');
    expect(text).not.toContain('bookmarkId');
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    'file:///x',
    'chrome://settings',
    'about:blank',
    'https://user:pass@example.com',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => normalizeUrl(url)).toThrow();
    expect(() =>
      parseImport(JSON.stringify({ version: 3, entries: [{ title: 'A', url }] })),
    ).toThrow();
  });
  it.each([
    'invalid',
    '[]',
    '{}',
    '{"tabs":[]}',
    '{"version":3,"entries":null}',
    '{"version":3,"entries":[{"title":"A","children":[{"title":"B","children":[]}]}]}',
    '{"version":3,"entries":[],"settings":{"width":49}}',
  ])('rejects invalid %s before mutations', (text) => {
    expect(() => parseImport(text)).toThrow();
  });
  it('limits count and title length', () => {
    expect(() =>
      parseImport(
        JSON.stringify({
          version: 3,
          entries: Array(10001).fill({ title: 'A', url: 'https://a.example' }),
        }),
      ),
    ).toThrow();
    expect(() =>
      parseImport(
        JSON.stringify({ version: 3, entries: [{ title: 'x'.repeat(4097), children: [] }] }),
      ),
    ).toThrow();
  });
  it('accepts raster and rejects SVG/script/corrupt data', async () => {
    expect(await imageFromDataUrl('data:image/png;base64,YQ==')?.text()).toBe('a');
    expect(() => imageFromDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toThrow();
    expect(() => imageFromDataUrl('data:image/png;base64,a')).toThrow();
  });
  it('normalizes HTTP/HTTPS', () => {
    expect(normalizeUrl(' example.com ')).toBe('https://example.com/');
    expect(normalizeUrl('http://example.com')).toBe('http://example.com/');
  });
});
describe('service responses', () => {
  it('does not invent Mail.ru unread counts', () => {
    expect(parseMailCount({ data: { mail_cnt: 0 } })).toBe(0);
    expect(parseMailCount({ data: { mail_cnt: 7 } })).toBe(7);
    expect(parseMailCount({ data: { mail_cnt: '5' } })).toBe(5);
    expect(parseMailCount({ data: { mail_cnt: '0' } })).toBe(0);
    for (const count of [-1, '-5', '', ' ', '5x', '1.5', '1e3', null, NaN, 1.5, '9007199254740992'])
      expect(() => parseMailCount({ data: { mail_cnt: count } })).toThrow();
    expect(() => parseMailCount(null)).toThrow();
    expect(() => parseMailCount({ status: 'noauth', data: { mail_cnt: 0 } })).toThrowLocalized(
      'Нет авторизации',
    );
  });
});
