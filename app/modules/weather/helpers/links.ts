import type { Translator } from '../../../common/i18n/formatMessage';
import { WeatherService } from '../services/weather';
export type { WeatherCityId, WeatherProvider } from '../entities/models';
export const getWeatherTranslates = (translate: Translator) => new WeatherService(translate);
