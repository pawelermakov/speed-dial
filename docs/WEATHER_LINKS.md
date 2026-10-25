# Ссылки виджета погоды

Сопоставления городов проверены 25 октября 2026 года по официальным страницам Яндекс Погоды и Gismeteo. Используются фиксированные названия страниц и идентификаторы, без транслитерации пользовательского ввода. При проверке части прямых запросов Gismeteo среда автоматизации получала HTTP 502; эти сопоставления подтверждены по индексированным официальным страницам прогноза и разделам `now`, `tomorrow` и `3-days`. Успешный доступ ко всем страницам в браузере пользователя не заявляется.

| Город | Яндекс Погода | Gismeteo |
| --- | --- | --- |
| Волгоград | [Прогноз](https://yandex.ru/pogoda/ru/volgograd) | [Прогноз](https://www.gismeteo.ru/weather-volgograd-5089/) |
| Воронеж | [Прогноз](https://yandex.ru/pogoda/ru/voronezh) | [Прогноз](https://www.gismeteo.ru/weather-voronezh-5026/) |
| Екатеринбург | [Прогноз](https://yandex.ru/pogoda/ru/yekaterinburg) | [Прогноз](https://www.gismeteo.ru/weather-yekaterinburg-4517/) |
| Казань | [Прогноз](https://yandex.ru/pogoda/ru/kazan) | [Прогноз](https://www.gismeteo.ru/weather-kazan-4364/) |
| Краснодар | [Прогноз](https://yandex.ru/pogoda/ru/krasnodar) | [Прогноз](https://www.gismeteo.ru/weather-krasnodar-5136/) |
| Красноярск | [Прогноз](https://yandex.ru/pogoda/ru/krasnoyarsk) | [Прогноз](https://www.gismeteo.ru/weather-krasnoyarsk-4674/) |
| Москва | [Прогноз](https://yandex.ru/pogoda/ru/moscow) | [Прогноз](https://www.gismeteo.ru/weather-moscow-4368/) |
| Нижний Новгород | [Прогноз](https://yandex.ru/pogoda/ru/nizhny-novgorod) | [Прогноз](https://www.gismeteo.ru/weather-nizhny-novgorod-4355/) |
| Новосибирск | [Прогноз](https://yandex.ru/pogoda/ru/novosibirsk) | [Прогноз](https://www.gismeteo.ru/weather-novosibirsk-4690/) |
| Омск | [Прогноз](https://yandex.ru/pogoda/ru/omsk) | [Прогноз](https://www.gismeteo.ru/weather-omsk-4578/) |
| Пермь | [Прогноз](https://yandex.ru/pogoda/ru/perm) | [Прогноз](https://www.gismeteo.ru/weather-perm-4476/) |
| Ростов-на-Дону | [Прогноз](https://yandex.ru/pogoda/ru/rostov-na-donu) | [Прогноз](https://www.gismeteo.ru/weather-rostov-na-donu-5110/) |
| Самара | [Прогноз](https://yandex.ru/pogoda/ru/samara) | [Прогноз](https://www.gismeteo.ru/weather-samara-4618/) |
| Санкт-Петербург | [Прогноз](https://yandex.ru/pogoda/ru/saint-petersburg) | [Прогноз](https://www.gismeteo.ru/weather-sankt-peterburg-4079/) |
| Уфа | [Прогноз](https://yandex.ru/pogoda/ru/ufa) | [Прогноз](https://www.gismeteo.ru/weather-ufa-4588/) |
| Челябинск | [Прогноз](https://yandex.ru/pogoda/ru/chelyabinsk) | [Прогноз](https://www.gismeteo.ru/weather-chelyabinsk-4565/) |

Виджет не читает эти страницы и не запрашивает их в фоне: это обычные ссылки. Для неизвестного города используется только главная страница выбранного сервиса. Настройки принимают лишь ID из фиксированного каталога; URL, координаты и геолокация не сохраняются и не синхронизируются.
