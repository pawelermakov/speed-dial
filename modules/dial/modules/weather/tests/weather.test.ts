import { describe, expect, it } from 'vitest';
import { weatherCities, weatherProviders, forecastLink } from '../helpers/links';
import { validateSettings } from '../../../../../services/validation';
import { defaults } from '../../../../../types/models';
import { parseImport, serializeExport } from '../../../../../services/importExport';
import { syncPatch, syncPrefix, validSetting } from '../../../../../services/settingsSchema';

describe('compact forecast links', () => {
  it('offers exactly the 16 agreed cities, sorted with Moscow selected by default', () => {
    expect(weatherCities.map((row) => row.label)).toEqual([
      'Волгоград',
      'Воронеж',
      'Екатеринбург',
      'Казань',
      'Краснодар',
      'Красноярск',
      'Москва',
      'Нижний Новгород',
      'Новосибирск',
      'Омск',
      'Пермь',
      'Ростов-на-Дону',
      'Самара',
      'Санкт-Петербург',
      'Уфа',
      'Челябинск',
    ]);
    expect(new Set(weatherCities.map((row) => row.id)).size).toBe(16);
    expect(validateSettings(undefined)).toMatchObject({
      weatherEnabled: false,
      weatherCity: 'moscow',
      weatherProvider: 'yandex',
    });
  });
  it('uses fixed city-specific HTTPS pages on the selected service only', () => {
    for (const city of weatherCities)
      for (const provider of weatherProviders) {
        const link = forecastLink(city.id, provider.id),
          url = new URL(link.href);
        expect(link.city).toBe(city);
        expect(url.protocol).toBe('https:');
        expect(url.hostname).toBe(provider.id === 'yandex' ? 'yandex.ru' : 'www.gismeteo.ru');
        expect(url.username + url.password + url.search + url.hash).toBe('');
        expect(url.pathname).toMatch(
          provider.id === 'yandex' ? /^\/pogoda\/ru\/[a-z-]+$/ : /^\/weather-[a-z-]+-\d+\/$/,
        );
      }
    expect(forecastLink('saint-petersburg', 'gismeteo').href).toBe(
      'https://www.gismeteo.ru/weather-sankt-peterburg-4079/',
    );
  });
  it('falls back to the service homepage for unknown or unsafe city input', () => {
    for (const city of ['', 'unknown', 'https://evil.example/', '__proto__', null, {}]) {
      expect(forecastLink(city, 'yandex').href).toBe('https://yandex.ru/pogoda/');
      expect(forecastLink(city, 'gismeteo').href).toBe('https://www.gismeteo.ru/');
      expect(forecastLink(city, 'gismeteo').city).toBeUndefined();
    }
    expect(forecastLink('moscow', 'evil').provider.id).toBe('yandex');
  });
  it('validates weather settings and keeps visibility independent from a saved city', () => {
    expect(
      validateSettings({
        ...defaults,
        weatherEnabled: false,
        weatherCity: 'moscow',
        weatherProvider: 'gismeteo',
      }),
    ).toMatchObject({ weatherEnabled: false, weatherCity: 'moscow', weatherProvider: 'gismeteo' });
    expect(validateSettings({ ...defaults, weatherCity: '' }).weatherCity).toBe('moscow');
    expect(validSetting('weatherCity', '')).toBe(false);
    for (const patch of [
      { weatherCity: 'unknown' },
      { weatherCity: null },
      { weatherProvider: 'evil' },
      { weatherProvider: null },
      { weatherEnabled: 'true' },
    ])
      expect(() => validateSettings({ ...defaults, ...patch })).toThrow();
  });
  it('exports, imports and synchronizes only the three small weather preferences', async () => {
    const settings = {
      ...defaults,
      weatherEnabled: true,
      weatherCity: 'nizhny-novgorod' as const,
      weatherProvider: 'gismeteo' as const,
    };
    const text = await serializeExport({ entries: [], settings, background: null });
    expect(parseImport(text).settings).toEqual(settings);
    expect(text).not.toContain('gismeteo.ru');
    expect(
      syncPatch({
        [syncPrefix + 'weatherEnabled']: true,
        [syncPrefix + 'weatherCity']: 'nizhny-novgorod',
        [syncPrefix + 'weatherProvider']: 'gismeteo',
      }),
    ).toEqual({
      weatherEnabled: true,
      weatherCity: 'nizhny-novgorod',
      weatherProvider: 'gismeteo',
    });
    expect(validSetting('weatherEnabled', 'true')).toBe(false);
    expect(validSetting('weatherCity', 'unknown')).toBe(false);
    expect(validSetting('weatherProvider', 'evil')).toBe(false);
  });
});
