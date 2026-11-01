import type { Translator } from '../../common/i18n/formatMessage';
import { WeatherService } from './services/weather';
export function New(translate: Translator) {
  return new WeatherService(translate);
}

export * from './entities';
export * from './services';
