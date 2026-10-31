import { t } from '../../../../../services/i18n';
import { weatherCityDefinitions, weatherProviderDefinitions } from '../index';
// Localized labels stay live when the application language changes.
export type { WeatherCityId, WeatherProvider } from '../index';
export const weatherCities = weatherCityDefinitions.map(({ labelKey, ...city }) => ({
  ...city,
  get label() {
    return t(labelKey);
  },
}));
export const weatherProviders = [
  {
    ...weatherProviderDefinitions[0],
    get label() {
      return t('weather.providers.yandex');
    },
  },
  { ...weatherProviderDefinitions[1], label: 'Gismeteo' },
] as const;
export function forecastLink(cityId: unknown, providerId: unknown) {
  const provider = weatherProviders.find((row) => row.id === providerId) ?? weatherProviders[0];
  const city = weatherCities.find((row) => row.id === cityId);
  return {
    city,
    provider,
    href: city
      ? provider.id === 'yandex'
        ? 'https://yandex.ru/pogoda/ru/' + city.yandex
        : 'https://www.gismeteo.ru/weather-' + city.gismeteo + '/'
      : provider.home,
  };
}
