import { isLanguage } from '../../../common/i18n/contracts';
import { message } from '../../../common/i18n/messages';
import { LocalizedError } from '../../../common/i18n/errors';
import {
  weatherCityDefinitions as weatherCities,
  weatherProviderDefinitions as weatherProviders,
} from '../../weather';
import { defaults, type Settings } from '../entities/models';
import { themeModes, type ThemeMode } from '../../appearance';
import { searchProviderIds, isMovieProvider, type SearchProviderId } from '../../search';
import { record } from '../../../common/helpers/validation';
function boolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  throw new LocalizedError(message('validation.switch.invalid'));
}
export function validateSettings(input: unknown): Settings {
  const data = input === undefined ? {} : record(input, message('settings.title'));
  if (Object.keys(data).some((key) => !Object.hasOwn(defaults, key)))
    throw new LocalizedError(message('validation.settings.unknown_field'));
  if (data.theme !== undefined && !themeModes.includes(data.theme as ThemeMode))
    throw new LocalizedError(message('validation.theme.invalid'));
  if (
    data.searchProvider !== undefined &&
    !searchProviderIds.includes(data.searchProvider as SearchProviderId)
  )
    throw new LocalizedError(message('validation.search_provider.invalid'));
  if (
    data.weatherCity !== undefined &&
    data.weatherCity !== '' &&
    !weatherCities.some((row) => row.id === data.weatherCity)
  )
    throw new LocalizedError(message('validation.weather_city.invalid'));
  if (
    data.weatherProvider !== undefined &&
    !weatherProviders.some((row) => row.id === data.weatherProvider)
  )
    throw new LocalizedError(message('validation.weather_provider.invalid'));
  const bookmarkSearch = boolean(data.bookmarkSearch, defaults.bookmarkSearch),
    movieSearch = boolean(data.movieSearch, defaults.movieSearch);
  const number = (key: 'width' | 'countColumns' | 'space', min: number, max: number) => {
    const value = data[key] === undefined || data[key] === '' ? defaults[key] : Number(data[key]);
    if (
      (typeof data[key] !== 'number' && typeof data[key] !== 'string' && data[key] !== undefined) ||
      !Number.isInteger(value) ||
      value < min ||
      value > max
    )
      throw new LocalizedError(
        message('validation.number.named_range', { field_name: key, min: min, max: max }),
      );
    return value;
  };
  if (data.language !== undefined && !isLanguage(data.language))
    throw new LocalizedError(message('validation.language.invalid'));
  return {
    language:
      data.language === undefined ? defaults.language : (data.language as Settings['language']),
    mailruEnabled: boolean(data.mailruEnabled, false),
    gmailEnabled: boolean(data.gmailEnabled, false),
    yandexMailEnabled: boolean(data.yandexMailEnabled, false),
    weatherEnabled: boolean(data.weatherEnabled, defaults.weatherEnabled),
    weatherCity: (data.weatherCity || defaults.weatherCity) as Settings['weatherCity'],
    weatherProvider: (data.weatherProvider ??
      defaults.weatherProvider) as Settings['weatherProvider'],
    theme: themeModes.includes(data.theme as ThemeMode) ? (data.theme as ThemeMode) : 'system',
    width: number('width', 50, 100),
    countColumns: number('countColumns', 2, 12),
    space: number('space', 0, 48),
    verticalCenter: boolean(data.verticalCenter, false),
    addButton: boolean(data.addButton, false),
    bookmarkSearch,
    movieSearch,
    searchProvider:
      (!bookmarkSearch && data.searchProvider === 'bookmarks') ||
      (!movieSearch && isMovieProvider(data.searchProvider))
        ? 'yandex'
        : searchProviderIds.includes(data.searchProvider as SearchProviderId)
          ? (data.searchProvider as SearchProviderId)
          : 'yandex',
  };
}
