import type { Translator } from '../../../common/i18n/formatMessage';
import { weatherCityDefinitions, weatherProviderDefinitions } from '../entities/models';
import type { IWeatherService } from './interfaces';
// Localized labels stay live when the application language changes.
export type { WeatherCityId, WeatherProvider } from '../entities/models';
export class WeatherService implements IWeatherService {
  readonly weatherCities;
  readonly weatherProviders;
  constructor(t: Translator) {
    this.weatherCities = weatherCityDefinitions.map(({ labelKey, ...city }) => ({
      ...city,
      get label() {
        return t(labelKey);
      },
    }));
    this.weatherProviders = [
      {
        ...weatherProviderDefinitions[0],
        get label() {
          return t('weather.providers.yandex');
        },
      },
      { ...weatherProviderDefinitions[1], label: 'Gismeteo' },
    ] as const;
  }
  forecastLink = (cityId: unknown, providerId: unknown) => {
    const provider =
      this.weatherProviders.find((row) => row.id === providerId) ?? this.weatherProviders[0];
    const city = this.weatherCities.find((row) => row.id === cityId);
    return {
      city,
      provider,
      href: city
        ? provider.id === 'yandex'
          ? 'https://yandex.ru/pogoda/ru/' + city.yandex
          : 'https://www.gismeteo.ru/weather-' + city.gismeteo + '/'
        : provider.home,
    };
  };
}
