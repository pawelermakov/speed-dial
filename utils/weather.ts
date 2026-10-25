// Fixed city-to-page mappings checked against official provider pages on 2026-10-25.
// These are navigation links, never a source of current weather observations.
export const weatherCities=[
  {"id":"volgograd","label":"Волгоград","yandex":"volgograd","gismeteo":"volgograd-5089"},
  {"id":"voronezh","label":"Воронеж","yandex":"voronezh","gismeteo":"voronezh-5026"},
  {"id":"yekaterinburg","label":"Екатеринбург","yandex":"yekaterinburg","gismeteo":"yekaterinburg-4517"},
  {"id":"kazan","label":"Казань","yandex":"kazan","gismeteo":"kazan-4364"},
  {"id":"krasnodar","label":"Краснодар","yandex":"krasnodar","gismeteo":"krasnodar-5136"},
  {"id":"krasnoyarsk","label":"Красноярск","yandex":"krasnoyarsk","gismeteo":"krasnoyarsk-4674"},
  {"id":"moscow","label":"Москва","yandex":"moscow","gismeteo":"moscow-4368"},
  {"id":"nizhny-novgorod","label":"Нижний Новгород","yandex":"nizhny-novgorod","gismeteo":"nizhny-novgorod-4355"},
  {"id":"novosibirsk","label":"Новосибирск","yandex":"novosibirsk","gismeteo":"novosibirsk-4690"},
  {"id":"omsk","label":"Омск","yandex":"omsk","gismeteo":"omsk-4578"},
  {"id":"perm","label":"Пермь","yandex":"perm","gismeteo":"perm-4476"},
  {"id":"rostov-na-donu","label":"Ростов-на-Дону","yandex":"rostov-na-donu","gismeteo":"rostov-na-donu-5110"},
  {"id":"samara","label":"Самара","yandex":"samara","gismeteo":"samara-4618"},
  {"id":"saint-petersburg","label":"Санкт-Петербург","yandex":"saint-petersburg","gismeteo":"sankt-peterburg-4079"},
  {"id":"ufa","label":"Уфа","yandex":"ufa","gismeteo":"ufa-4588"},
  {"id":"chelyabinsk","label":"Челябинск","yandex":"chelyabinsk","gismeteo":"chelyabinsk-4565"}
] as const;
export type WeatherCityId=typeof weatherCities[number]['id'];
export const weatherProviders=[{id:'yandex',label:'Яндекс Погода',home:'https://yandex.ru/pogoda/'},{id:'gismeteo',label:'Gismeteo',home:'https://www.gismeteo.ru/'}] as const;
export type WeatherProvider=typeof weatherProviders[number]['id'];
export function forecastLink(cityId:unknown,providerId:unknown){
  const provider=weatherProviders.find(row=>row.id===providerId)??weatherProviders[0];
  const city=weatherCities.find(row=>row.id===cityId);
  return {city,provider,href:city?(provider.id==='yandex'?'https://yandex.ru/pogoda/ru/'+city.yandex:'https://www.gismeteo.ru/weather-'+city.gismeteo+'/'):provider.home};
}
