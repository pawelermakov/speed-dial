import { defaultLanguage, type Language } from '../../../common/i18n/contracts';
import type { SearchProviderId } from '../../search';
import type { ThemeMode } from '../../appearance';
import type { WeatherPreferences } from '../../weather';
import type { MailPreferences } from '../../mail';
import type { BookmarkGridOptions } from '../../bookmarks';

export interface Settings extends MailPreferences, WeatherPreferences, BookmarkGridOptions {
  language: Language;
  theme: ThemeMode;
  verticalCenter: boolean;
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
