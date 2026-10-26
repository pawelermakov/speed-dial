import { t } from '../services/i18n';
// Fixed city-to-page mappings checked against official provider pages on 2026-10-25.
// These are navigation links, never a source of current weather observations.
export const weatherCities=[
  {"id":"volgograd",get "label"(){return t('weather.cities.volgograd');},"yandex":"volgograd","gismeteo":"volgograd-5089"},
  {"id":"voronezh",get "label"(){return t('weather.cities.voronezh');},"yandex":"voronezh","gismeteo":"voronezh-5026"},
  {"id":"yekaterinburg",get "label"(){return t('weather.cities.yekaterinburg');},"yandex":"yekaterinburg","gismeteo":"yekaterinburg-4517"},
  {"id":"kazan",get "label"(){return t('weather.cities.kazan');},"yandex":"kazan","gismeteo":"kazan-4364"},
  {"id":"krasnodar",get "label"(){return t('weather.cities.krasnodar');},"yandex":"krasnodar","gismeteo":"krasnodar-5136"},
  {"id":"krasnoyarsk",get "label"(){return t('weather.cities.krasnoyarsk');},"yandex":"krasnoyarsk","gismeteo":"krasnoyarsk-4674"},
  {"id":"moscow",get "label"(){return t('weather.cities.moscow');},"yandex":"moscow","gismeteo":"moscow-4368"},
  {"id":"nizhny-novgorod",get "label"(){return t('weather.cities.nizhny_novgorod');},"yandex":"nizhny-novgorod","gismeteo":"nizhny-novgorod-4355"},
  {"id":"novosibirsk",get "label"(){return t('weather.cities.novosibirsk');},"yandex":"novosibirsk","gismeteo":"novosibirsk-4690"},
  {"id":"omsk",get "label"(){return t('weather.cities.omsk');},"yandex":"omsk","gismeteo":"omsk-4578"},
  {"id":"perm",get "label"(){return t('weather.cities.perm');},"yandex":"perm","gismeteo":"perm-4476"},
  {"id":"rostov-na-donu",get "label"(){return t('weather.cities.rostov_on_don');},"yandex":"rostov-na-donu","gismeteo":"rostov-na-donu-5110"},
  {"id":"samara",get "label"(){return t('weather.cities.samara');},"yandex":"samara","gismeteo":"samara-4618"},
  {"id":"saint-petersburg",get "label"(){return t('weather.cities.saint_petersburg');},"yandex":"saint-petersburg","gismeteo":"sankt-peterburg-4079"},
  {"id":"ufa",get "label"(){return t('weather.cities.ufa');},"yandex":"ufa","gismeteo":"ufa-4588"},
  {"id":"chelyabinsk",get "label"(){return t('weather.cities.chelyabinsk');},"yandex":"chelyabinsk","gismeteo":"chelyabinsk-4565"}
] as const;
export type WeatherCityId=typeof weatherCities[number]['id'];
export const weatherProviders=[{id:'yandex',get label(){return t('weather.providers.yandex');},home:'https://yandex.ru/pogoda/'},{id:'gismeteo',label:'Gismeteo',home:'https://www.gismeteo.ru/'}] as const;
export type WeatherProvider=typeof weatherProviders[number]['id'];
export function forecastLink(cityId:unknown,providerId:unknown){
  const provider=weatherProviders.find(row=>row.id===providerId)??weatherProviders[0];
  const city=weatherCities.find(row=>row.id===cityId);
  return {city,provider,href:city?(provider.id==='yandex'?'https://yandex.ru/pogoda/ru/'+city.yandex:'https://www.gismeteo.ru/weather-'+city.gismeteo+'/'):provider.home};
}
