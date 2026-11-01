// Fixed navigation mappings, verified on 2026-10-25; not live weather observations.
export const weatherCityDefinitions = [
  {
    id: 'volgograd',
    labelKey: 'weather.cities.volgograd',
    yandex: 'volgograd',
    gismeteo: 'volgograd-5089',
  },
  {
    id: 'voronezh',
    labelKey: 'weather.cities.voronezh',
    yandex: 'voronezh',
    gismeteo: 'voronezh-5026',
  },
  {
    id: 'yekaterinburg',
    labelKey: 'weather.cities.yekaterinburg',
    yandex: 'yekaterinburg',
    gismeteo: 'yekaterinburg-4517',
  },
  {
    id: 'kazan',
    labelKey: 'weather.cities.kazan',
    yandex: 'kazan',
    gismeteo: 'kazan-4364',
  },
  {
    id: 'krasnodar',
    labelKey: 'weather.cities.krasnodar',
    yandex: 'krasnodar',
    gismeteo: 'krasnodar-5136',
  },
  {
    id: 'krasnoyarsk',
    labelKey: 'weather.cities.krasnoyarsk',
    yandex: 'krasnoyarsk',
    gismeteo: 'krasnoyarsk-4674',
  },
  {
    id: 'moscow',
    labelKey: 'weather.cities.moscow',
    yandex: 'moscow',
    gismeteo: 'moscow-4368',
  },
  {
    id: 'nizhny-novgorod',
    labelKey: 'weather.cities.nizhny_novgorod',
    yandex: 'nizhny-novgorod',
    gismeteo: 'nizhny-novgorod-4355',
  },
  {
    id: 'novosibirsk',
    labelKey: 'weather.cities.novosibirsk',
    yandex: 'novosibirsk',
    gismeteo: 'novosibirsk-4690',
  },
  {
    id: 'omsk',
    labelKey: 'weather.cities.omsk',
    yandex: 'omsk',
    gismeteo: 'omsk-4578',
  },
  {
    id: 'perm',
    labelKey: 'weather.cities.perm',
    yandex: 'perm',
    gismeteo: 'perm-4476',
  },
  {
    id: 'rostov-na-donu',
    labelKey: 'weather.cities.rostov_on_don',
    yandex: 'rostov-na-donu',
    gismeteo: 'rostov-na-donu-5110',
  },
  {
    id: 'samara',
    labelKey: 'weather.cities.samara',
    yandex: 'samara',
    gismeteo: 'samara-4618',
  },
  {
    id: 'saint-petersburg',
    labelKey: 'weather.cities.saint_petersburg',
    yandex: 'saint-petersburg',
    gismeteo: 'sankt-peterburg-4079',
  },
  {
    id: 'ufa',
    labelKey: 'weather.cities.ufa',
    yandex: 'ufa',
    gismeteo: 'ufa-4588',
  },
  {
    id: 'chelyabinsk',
    labelKey: 'weather.cities.chelyabinsk',
    yandex: 'chelyabinsk',
    gismeteo: 'chelyabinsk-4565',
  },
] as const;
export type WeatherCityId = (typeof weatherCityDefinitions)[number]['id'];
export const weatherProviderDefinitions = [
  { id: 'yandex', home: 'https://yandex.ru/pogoda/' },
  { id: 'gismeteo', home: 'https://www.gismeteo.ru/' },
] as const;
export type WeatherProvider = (typeof weatherProviderDefinitions)[number]['id'];

export interface WeatherPreferences {
  weatherEnabled: boolean;
  weatherCity: WeatherCityId;
  weatherProvider: WeatherProvider;
}
