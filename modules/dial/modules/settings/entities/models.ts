import { defaultLanguage, type Language } from '../../../../../shared/i18n/contracts';
import type { SearchProviderId } from '../../search';
import type { ThemeMode } from '../../appearance';
import type { WeatherCityId, WeatherProvider } from '../../weather';

export interface Settings {
  language: Language;
  mailruEnabled: boolean;
  gmailEnabled: boolean;
  yandexMailEnabled: boolean;
  weatherEnabled: boolean;
  weatherCity: WeatherCityId;
  weatherProvider: WeatherProvider;
  theme: ThemeMode;
  width: number;
  countColumns: number;
  space: number;
  verticalCenter: boolean;
  addButton: boolean;
  bookmarkSearch: boolean;
  movieSearch: boolean;
  searchProvider: SearchProviderId;
}
export const defaults: Settings = {
  language: defaultLanguage,
  mailruEnabled: false,
  gmailEnabled: false,
  yandexMailEnabled: false,
  weatherEnabled: false,
  weatherCity: 'moscow',
  weatherProvider: 'yandex',
  theme: 'system',
  width: 100,
  countColumns: 6,
  space: 24,
  verticalCenter: false,
  addButton: false,
  bookmarkSearch: true,
  movieSearch: false,
  searchProvider: 'yandex',
};

export interface SettingsEnvelope {
  value: Settings;
}
