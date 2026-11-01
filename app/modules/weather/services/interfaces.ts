import type { WeatherCityId, WeatherProvider } from '../entities/models';

export interface WeatherCity {
  id: WeatherCityId;
  readonly label: string;
  yandex: string;
  gismeteo: string;
}
export interface WeatherProviderInfo {
  id: WeatherProvider;
  readonly label: string;
  home: string;
}
export interface IWeatherService {
  readonly weatherCities: readonly WeatherCity[];
  readonly weatherProviders: readonly WeatherProviderInfo[];
  forecastLink(
    cityId: unknown,
    providerId: unknown,
  ): {
    city: WeatherCity | undefined;
    provider: WeatherProviderInfo;
    href: string;
  };
}
