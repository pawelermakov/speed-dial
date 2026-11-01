import { t } from '../../helpers/i18n';
import { describe, expect, it } from 'vitest';
import {
  fitTileFont,
  fitTileColumns,
  tileColor,
  tileHostname,
  faviconTileColor,
} from '../../../modules/bookmarks/helpers/tile';

describe('text bookmark tiles', () => {
  it('caps columns at a usable card width without changing the requested setting', () => {
    expect(fitTileColumns(312, 12, 24)).toBe(2);
    expect(fitTileColumns(156, 12, 48)).toBe(1);
    expect(fitTileColumns(1232, 6, 24)).toBe(6);
    expect(fitTileColumns(1232, 12, 24)).toBe(7);
    expect(fitTileColumns(0, 12, 24)).toBe(1);
  });
  it('uses the same brightness cap for every icon', () => {
    const pixels = new Uint8ClampedArray([255, 90, 75, 255]);
    expect(faviconTileColor(pixels)).toBe('#a93c32');
  });
  it('darkens only bright colors while preserving their hue', () => {
    expect(faviconTileColor(new Uint8ClampedArray([150, 20, 20, 255]))).toBe('#961414');
    expect(faviconTileColor(new Uint8ClampedArray([255, 0, 0, 255]))).toBe('#c50000');
    expect(faviconTileColor(new Uint8ClampedArray([255, 90, 75, 255]))).toBe('#a93c32');
  });
  it('extracts the dominant mark, ignoring transparency and neutral backing', () => {
    const pixels = new Uint8ClampedArray([
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255,
      255, 0, 0, 0,
    ]);
    expect(faviconTileColor(pixels)).toBe('#0000ff');
    expect(faviconTileColor(new Uint8ClampedArray([255, 0, 0, 0]))).toBeUndefined();
    expect(faviconTileColor(new Uint8ClampedArray())).toBeUndefined();
  });
  it('uses only a normalized hostname and a safe fallback', () => {
    expect(tileHostname('https://www.Example.com/a?q=x#b', t('bookmarks.fallback.website'))).toBe(
      'example.com',
    );
    expect(tileHostname('https://пример.рф', t('bookmarks.fallback.website'))).toBe(
      'xn--e1afmkfd.xn--p1ai',
    );
    expect(tileHostname('invalid', t('bookmarks.fallback.website'))).toBe('Сайт');
    expect(tileHostname('file:///tmp/a', t('bookmarks.fallback.website'))).toBe('Сайт');
  });
  it('keeps color independent of paths, titles, ids and folders', () => {
    expect(
      tileColor(tileHostname('https://www.Example.com/a', t('bookmarks.fallback.website'))),
    ).toBe(tileColor(tileHostname('http://example.com/b', t('bookmarks.fallback.website'))));
    expect(tileColor('example.com')).toBe('#754691');
  });
  it('generates diverse colors with text contrast of at least 4.5', () => {
    const colors = new Set<string>();
    for (let i = 0; i < 20000; i++) {
      const color = tileColor(`site-${i}.example`);
      colors.add(color);
      const iconColor = faviconTileColor(
        new Uint8ClampedArray([i % 256, (i * 7) % 256, (i * 13) % 256, 255]),
      )!;
      for (const background of [color, iconColor]) {
        const channels = background
          .slice(1)
          .match(/../g)!
          .map((hex) => {
            const channel = parseInt(hex, 16) / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
        const luminance = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
        const contrast = 1.05 / (luminance + 0.05);
        expect(contrast).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(colors.size).toBeGreaterThan(10000);
  });
  it('finds the largest fitting font and preserves a readable minimum', () => {
    expect(fitTileFont(150, 100, (size) => size * 5)).toBe(28);
    expect(fitTileFont(10, 10, (size) => size * 100)).toBe(12);
    expect(fitTileFont(1000, 200, (size) => size)).toBe(40);
    expect(fitTileFont(200, 100, (size) => size * 5)).toBe(28);
  });
});
