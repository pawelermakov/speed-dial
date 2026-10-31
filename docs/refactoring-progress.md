# Ход рефакторинга

Начало реализации: 30 октября 2026 года. Порядок работ задан в
[REFACTORING_PLAN.md](../REFACTORING_PLAN.md). Выделены модульные контракты и composition roots этапов 1–2; bookmarks выделен на этапе 3.

## Исходная точка (этап 0)

- Требования проекта: Node.js >=22.12.0, npm >=10.
- Системный Node.js 20.20.2 не удовлетворяет требованиям. Для проверки использован
  доступный Node.js 24.22.1 и npm 10.8.2, без изменения системной установки.
- `npm ci`: успешно; WXT 0.21.4 подготовил типы.
- `npm test`: успешно, vue-tsc и 25 файлов / 276 тестов Vitest.
- `npm run build` и `npm run build:firefox`: успешно.
- Полный browser runner в песочнице остановился при запуске Firefox: Windows
  блокирует дочерние процессы (`SpawnTarget`). Повторный Firefox-прогон запущен
  вне песочницы с сохранением браузерной защиты.
- `npm run test:browser -- --chrome-only`: успешно, все 23 сценария.
- `npm run test:browser -- --firefox-only`: успешно, все 21 поддерживаемый сценарий,
  включая CRUD, capture, папки, import/export, sync, autosave и фон.
- Live-проверки внешних сервисов не входят в эту исходную точку.

Размеры production JavaScript до форматирования, в байтах (без gzip):

| Артефакт                     | Chrome MV3 | Firefox MV2 |
| ---------------------------- | ---------: | ----------: |
| background.js                |     217114 |      216838 |
| chunks/newtab-*.js           |     420984 |      420603 |
| chunks/kinopoiskNetwork-*.js |        591 |         591 |

Не считать старые артефакты в `.output/*-dev` частью production baseline.
Логи локальных browser-прогонов находятся в игнорируемом `.browser-test/`;
в репозиторий сохраняются результаты, а не профили браузеров.

## Этап 0.1

Добавлены отдельные Prettier, ESLint и Stylelint, EditorConfig, правила LF в Git,
Husky + lint-staged и GitHub Actions. Версии новых инструментов зафиксированы в
package.json и lockfile; сохранена совместимость с Node.js >=22.12.0. Конфигурации
исключают generated artifacts. Порядок импортов и Tailwind-классов не менялся.

Выполнено механическое форматирование существующей базы. ESLint проверяет TS,
Vue и JS/MJS; для TS/Vue включены проверки Promise с информацией о типах. Stylelint
проверяет CSS и style-блоки Vue, разрешая используемую директиву Tailwind `@theme`.
Три локальных исключения `no-control-regex` документируют намеренный запрет
управляющих символов в валидации данных.

Диагностики устранены небольшими правками: явно отмечены намеренно игнорируемые
Promise, изменена неизменяемая ссылка на массив на const, упрощено ветвление
Firefox driver. В browser-сценариях уточнены обращения к window и исправлен вызов
несуществующей setEmail в toolbar-аудите: используется имеющийся refreshMail.
В appearance-аудите исправлено устаревшее ожидание списка разделов: добавлена
«Погода», уже присутствовавшая в исходном SettingsPanel.vue до рефакторинга.

Проверки после изменений:

- `npm run check`: успешно (Prettier, ESLint, Stylelint, vue-tsc, 276 unit-тестов).
- Production-сборки Chrome/Firefox: успешно.
- Firefox вне песочницы: повторные smoke, appearance и wallpaper-startup успешны.
- Chrome: повторные smoke и appearance успешны, включая 320–1920 px, четыре фона,
  диалоги/меню, масштаб 200%, forced colors и reduced motion.
- Chrome: toolbar-styles и wallpaper-startup успешны; проверены состояния toolbar,
  счётчики и ошибки почты, ранний фон, замена/удаление и очистка устаревшего кеша.
- CI настроен; удалённый запуск в GitHub Actions в этой сессии не выполнялся.
- Полный UI suite и измерение времени холодного старта ещё не выполнены.

После форматирования background остался прежнего размера в обоих браузерах;
newtab вырос на 2 байта (Chrome 420986, Firefox 420605). Общий CSS вырос с 59946
до 60506 байт, ранний wallpaper-bootstrap — с 1471 до 1714 байт из-за форматирования.
Оптимизация этих артефактов не совмещалась с настройкой инструментов.

## Этап 1. Правила и модульные контракты

Завершён 30 октября 2026 года.

- Добавлены ARCHITECTURE.md и адаптированные правила .cursor/rules/architecture.mdc.
- Типы/defaults разнесены по dial, bookmarks, settings, appearance, search, backup,
  capture и weather. У каждого владельца есть публичный index.ts. Старый
  types/models.ts сохраняет именованные compatibility exports до этапа 8.
- Чистые контракты языка/сообщений и message/joinMessages находятся в shared/i18n.
  Они не создают Vue refs и не читают localStorage. Runtime переводов пока прежний;
  переход на vue-i18n остаётся отдельной задачей.
- Справочники weather не зависят от переводчика. Локализованные getters и
  forecastLink временно остаются в utils/weather.ts; валидация использует чистые данные.
- BookmarksPort, RootPort, SettingsPort и SettingsEnvelope перенесены к владельцам;
  старые пути реэкспортируют их. Добавлен AssetsPort, реализуемый BookmarkAssetStore;
  Repository ссылается на интерфейс assets.
- Подготовлены минимальные DataLock, SyncClient и UpdatesPort для этапа 2.
  Создание реальных зависимостей и алгоритмы lifecycle пока не переносились.
- ESLint проверяет чистоту entities/i18n contracts и запрет modules в shared.
  Диагностика проверена на запрещённых импортах Vue и feature-контрактов в shared.
- Vitest теперь обнаруживает тесты в modules/shared/app; все существующие
  25 файлов и 276 тестов продолжают выполняться. Перенос самих suites остаётся
  отдельной работой, вместе с обязательным паритетом Chrome/Firefox.
- Добавлена поддержка форматирования .mdc в Prettier/lint-staged и LF в Git.

Проверки: npm run check, обе production-сборки, i18n и weather-widget в Chrome
и Firefox успешны. Проверены три языковых профиля каждого браузера, live-переключение
RU/EN/ES, ошибки/диалоги/export, persistence и вторая вкладка; для weather —
import/export, defaults, все города/провайдеры, отсутствие запросов погоды,
светлая/тёмная темы и ширины 320–1920 px. Firefox запускался вне песочницы.

Storage/sync keys, схема Dexie, backup format, browser IDs, permissions и UI
сохранены. Полные browser/UI suites на этом этапе не повторялись: выполнены
затронутые сценарии; исходные полные browser-прогоны записаны выше.

## Этап 2. Composition roots и инфраструктура

Завершён 30 октября 2026 года.

- Добавлены отдельные createNewtabApplication и createBackgroundApplication.
  DB, settings/root storage и Repository создаются в корнях сборки, без глобального
  экземпляра repository из composable. Repository пока сохраняет фасадный API.
- UI получает приложение через типизированный Vue provide/inject и useServices.
  useDial принимает DialDependencies явно; App и SettingsPanel используют один
  Repository своей вкладки. Раннее выставление языка и чтение wallpaper сохранены.
- Dexie schema перенесена в shared/infrastructure/database, где нет зависимостей
  от feature-модулей. Сохранены имя SpeedDialX, v3, таблицы и индексы. Создаётся
  отдельное соединение на контекст; services/database.ts оставляет export класса.
- Settings storage adapter создаётся фабрикой с переданным SyncClient. Сохранены
  envelope, replace/patch semantics и отправка patch без ожидания под data lock.
- Общая блокировка перенесена в shared infrastructure с прежним speed-dial-data
  и одной fallback queue на JS-контекст. Старый export Repository временно сохранён.
- Browser events и speed-dial-updates вынесены в адаптеры. Сохранены структурное
  invalidation, asset-only refresh и старая строка updated. Подписки снимаются,
  dispose канала и DB идемпотентен, завершение startup после unmount отсекается.
- Background sync получает API/lock извне, возвращает dispose и снимает все
  runtime/storage/bookmark/identity/tab listeners. Capture root сохраняет sender,
  runtime ID/newtab URL и validation, отменяет активные операции и поздние replies.
- useDial tests больше не подменяют WXT, Dexie, browser globals и Repository class;
  используют fake-порты. Добавлены проверки двух экземпляров/контекстов, cleanup,
  pending startup/settings reads, native/fallback lock, update wire compatibility,
  capture sender checks/disposal и sync initialization после dispose.
- ESLint запрещает прямую инфраструктуру в useDial и UI-импорты в background roots.

Проверки: npm run check — успешно, 30 файлов / 287 unit-тестов; обе production-сборки
успешны. Полные текущие browser-наборы прошли: 23 сценария Chrome и 21 сценарий
Firefox (вне песочницы). Проверены запуск и фон, выбор/смена root, несколько вкладок,
CRUD/capture, внешние события, импорт/экспорт, sync и autosave; Chrome также проверяет
нативный drag. Настоящая облачная доставка между авторизованными устройствами
не проверялась: sync-сценарии используют контролируемые fixtures. Полный отдельный
UI suite и live-сеть на этом этапе не запускались.

Размеры JS после этапа 2 (байт, без gzip): background Chrome 217607 / Firefox
217261; newtab Chrome 422029 / Firefox 421648. Относительно этапа 1 это +817/+747
байт background и +1148/+1149 байт newtab на сборку и cleanup. CSS и wallpaper
bootstrap не менялись. Отдельный замер времени холодного старта пока не выполнен.

## Этап 3. Bookmarks

Завершён 30 октября 2026 года.

- Добавлена createBookmarksModule; production root передаёт собранный модуль в
  Repository. Сохранён временный legacy-конструктор фасада для совместимости.
- BookmarksSource — единственный владелец root/active, read generation и recovery
  notice; BookmarksView не зависит от Settings/Snapshot. Repository координирует
  settings/background и завершение prepared read в прежнем порядке, без раннего
  fallback при сбое параллельных чтений.
- BookmarkActions содержит CRUD/папки/reorder, expected-state guards, assets и
  captured-title workflows. Сохранены смешанные slots, protected folders, Firefox
  separators, native move indices и отсутствие повторного data lock.
- Assets и auto-name metadata перенесены в feature adapters с прежними таблицами,
  ключами, validation, best-effort поведением и pendingEdit/ticket semantics.
  Backup читает raw assets через getStored; схема/backup JSON не менялись.
- Search composable и insertion helpers принадлежат bookmarks. Composable получает
  минимальный search port/view, не Repository class и не родительский Snapshot.
- Перенесены существующие tests assets/folders/search/reorder/autoNames. Проверки
  autoNames вызывают модуль напрямую; reset оставлен отдельным корневым integration
  test. MockBookmarks перемещён в tests/helpers с type-only публичными контрактами.
  Сохранены все 287 прежних тестов, добавлен guard-test параллельного snapshot failure.
- ESLint запрещает Vue/WXT/Dexie и адаптеры в bookmark services; правила представления
  и нормализация URL внедряются снаружи. ARCHITECTURE.md содержит реальный пример
  factory → services → adapters → composable → tests.

Проверки: check прошёл, 31 файл / 288 тестов; обе production-сборки успешны.
Полные текущие browser-наборы прошли: Chrome — 23 сценария, Firefox — 21 сценарий
(вне песочницы). Проверены root/fallback, внешние изменения, два окна/вкладки, CRUD,
folder operations, capture, partial backup/import, auto-name и stale guards,
Chrome native drag, Firefox native API sorting, settings/sync, темы и фон.
Отдельные полные UI/live suites не повторялись; реальная cloud-доставка между
авторизованными устройствами не проверялась.

Размеры JS: background Chrome 217935 / Firefox 217589 байт; newtab Chrome 426011 /
Firefox 425641 байт. Прирост к этапу 2: +328/+328 background и +3982/+3993 newtab;
он включает модульную сборку и временную делегацию фасада. CSS и wallpaper bootstrap
не менялись; отдельный замер холодного старта пока не выполнен.

## Этап 4. Settings, appearance и sync

Завершён 30 октября 2026 года.

- SettingsService и AppearanceService вынесены из Repository, production root
  передаёт собранные сервисы в совместимый фасад. Он больше не читает Dexie напрямую.
  Сохранены patch текущих значений, replace, source-last commit и rollback/partial restore.
- useSettingsState владеет confirmed/pending fields, версиями, field errors,
  ready и track/flush. Root/background writes входят в ту же очередь ожидания.
  useDial публикует общий snapshot один раз через переданный callback.
- useBackgroundState владеет version/dirty/startup guards; theme, preview и
  BackgroundResource перенесены в appearance. CSS, mirrors, bootstrap и URL прежние.
- SettingsChangeSink отделяет storage от sync; в composition root он отправляет
  patch без ожидания runtime message под lock. Remote apply не создаёт echo.
- SettingsSync перенесён почти без изменения алгоритма в sync/services/coordinator;
  browser wiring — в adapters/background. Portable locator/native folder helpers
  принадлежат bookmarks с отдельными публичными pure entries.
- SyncClient теперь factory с outgoing queue на экземпляр приложения; UI получает
  тот же клиент, status storage и status reader через typed context. Sync status
  не добавляется в persisted Settings, account identity остаётся только в памяти.
- Добавлены typed message union и отдельный runtime decoder; incoming patch остаётся
  untrusted record до coordinator validation. Сохранены sender/ID/URL checks.
- Перенесены существующие tests theme/background/appearance/settingsSync/status;
  исправлен относительный путь к существующему bootstrap fixture, без копирования.
  Сохранены все 288 предыдущих тестов; добавлены 17 проверок новых границ и гонок.

check прошёл: 36 файлов / 305 тестов, линтеры и TypeScript. Обе сборки успешны.
Полные текущие browser-наборы прошли: Chrome — 23 сценария, Firefox — 21 сценарий
(вне песочницы). После удаления лишней build-зависимости повторно прошли settings-sync,
settings-autosave и wallpaper-startup в обоих браузерах. Полные UI/live suites
на этом этапе отдельно не запускались; реальная cloud-доставка не проверялась.

Аудит generateBundle подтвердил отсутствие test modules в обоих production chunks,
а также UI modules/runtime-dom и WXT storage в background. Обнаруженный лишний импорт
WXT storage через параметр appearance-сервиса устранён переименованием этого параметра;
background уменьшился на 8704 байта, newtab не изменился. Временный audit plugin удалён,
wxt.config.ts восстановлен без diff. Локальные отчёты находятся в .browser-test/.

Итоговые JS размеры (байт, без gzip): background Chrome 218548 / Firefox 218202;
newtab Chrome 427905 / Firefox 427535. Прирост к этапу 3: +613/+613 background и
+1894/+1894 newtab. CSS — 60506 байт, wallpaper-bootstrap — 1714 байт; исходники
стилей, startup mirrors и bootstrap не менялись. Отдельный замер cold start остаётся
открытым.

Следующий после этапа 4: этап 5 — backup/capture и загрузка необязательной функциональности по требованию.
При рефакторинге тестовой инфраструктуры обязателен полный паритет Chrome и
Firefox по разделу 7.4 плана: аудит всех browser/UI/live сценариев и assertions,
устранение всех пробелов (включая theme-startup, bookmark-drag и UI allowlist),
общий реестр сценариев и контроль фактического выполнения в CI. Текущие
23/21 browser-сценария фиксируют исходный разрыв и не являются целевым покрытием.
Проверки границ импортов усиливать при появлении целевых модулей. Изменение форматов хранения,
разрешений расширения и пользовательских сценариев в эту работу не входит.

## Этап 5 — backup, capture и lazy loading

Реализовано 31 октября 2026 года:

- Backup codec/limits и диалог перенесены к владельцу; DOM download отделён.
  Export/import/reset извлечены из Repository в сервис с портами. Facade пока
  делегирует вызовы; формат v3, выбор секций, metadata, expected-state guards,
  внешний lock и частичные отчёты сохранены.
- Capture разделён на browser handler, последовательную очередь, runtime client
  и workflow обновления изображений. Состояние очереди/клиента принадлежит
  экземпляру приложения. Исходный bookmark/ticket фиксируются до lazy loading.
- Управление данными, backup service и клиент capture загружаются в newtab
  по требованию. Loader разделяет Promise конкурентных вызовов, сбрасывает его
  при ошибке, освобождает поздно полученный ресурс после dispose. Settings
  остаются открыты при загрузке диалога; ошибка локализована RU/EN/ES.
- Background listeners регистрируются синхронно; одна очередь создаётся при
  первом допустимом запросе. Отмена во время ожидания factory не запускает
  handler. Background factory импортируется статически в единый WXT bundle:
  динамический импорт не давал отдельного chunk и удерживал лишний runtime-dom.
  Newtab использует настоящие динамические chunks.
- Сохранены sender checks, request ID, очередь на 8 запросов, timeout клиента
  45 секунд включая ожидание очереди, активный timeout 20 секунд и owned-tab
  cleanup. Dispose снимает port listeners/timers и подавляет поздние записи/UI.
- Format/capture tests перенесены к владельцам; добавлены проверки retries,
  concurrent loading, late disposal, port cleanup/timeout/post failure,
  queue recovery и fallback при неудачном capture. ESLint ограничивает прямой
  доступ новых services к browser/storage/UI adapters.

check прошёл: TypeScript, форматирование, ESLint, Stylelint, 40 файлов / 318 тестов.
Обе production-сборки успешны. Полные текущие browser-наборы прошли: Chrome —
23 сценария, Firefox — 21 сценарий (вне песочницы). После уточнения статического
импорта background factory повторно прошли bookmark-dialogs Chrome с реальным
capture, отменой и stale guards, а также smoke Firefox с реальным capture.
Полные UI/live suites отдельно не запускались; реальная cloud-доставка не
проверялась. Исходные CSS/DOM диалога не менялись; data-management проверил
темы, responsive layouts и focus. Дополнительно просмотрен снимок Chrome 320px.

GenerateBundle audit выполнен отдельным config/output в .browser-test, без
изменения wxt.config.ts и без перезаписи сборок текущих browser-прогонов.
В обоих браузерах в стартовом newtab chunk нет backup codec/dialog/service
и capture client/workflow; в background нет UI/test modules, runtime-dom и
WXT storage. В production chunks нет тестовых модулей.

Итоговые размеры файлов (байт, без gzip): background Chrome 219475 / Firefox
219129 (+927 к этапу 4); стартовый newtab Chrome 405729 / Firefox 405359
(−22176). Lazy chunks: backup service 3776, dialog/codec/download 20450,
capture client/workflow 1849; прежний lazy kinopoisk chunk 591 не менялся.
CSS разделён на стартовый 57907 и lazy dialog 2600; bootstrap 1714 не менялся.
Это перераспределение загрузки, а не сокращение суммарного размера расширения.

Отдельная проверка сетевых запросов в чистом Chrome-профиле подтвердила:
backup/capture chunks не запрашиваются при открытии newtab; dialog/codec
загружается один раз при первом открытии управления данными, повторное
открытие не выполняет новый запрос. Resource Timing для extension resources
не предоставил записей, поэтому использовались события request браузерного
драйвера. Сравнительный замер cold start с этапом 4 пока не выполнен; уменьшение
стартового chunk само по себе не доказывает ускорение первого paint.

Следующий этап — search/mail/weather. Полный паритет Chrome/Firefox остаётся
обязательной работой этапа тестовой инфраструктуры по разделу 7.4 плана.

## Этап 6 — search, mail и weather

Реализовано 31 октября 2026 года:

- Search service получает порты request/read/parse/network preparation.
  Provider DTO/parsers, GraphQL query, bounded HTTP reader и Origin rule
  перенесены в adapters; navigation/локализованные labels отделены от HTTP.
  Сохранены query limit 256, response limit 256 KiB, MIME checks, deadline
  8 секунд и одна повторная попытка только InternalServerError Кинопоиска.
- useProviderSuggestions принадлежит search: debounce 250 мс, abort,
  generation fence, смена языка/провайдера и teardown сохранены. Локальные
  запросы закладок не уходят в сеть. Search service создаётся root приложения.
- Инициализатор Origin rule создаётся на экземпляр приложения и загружается
  по требованию. Concurrent setup разделяет Promise; failed setup допускает
  retry. Dispose закрывает lazy loader, общая session rule не удаляется
  при закрытии одной вкладки. Установка правила не выполняется на старте.
- Mail service выбирает reader и передаёт общий 8-секундный deadline.
  Credentialed HTTP, текущий Mail.ru account, XML/JSON parsers и ошибки
  находятся в adapters. Сохранены unknown count, auth/unsupported states,
  отсутствие polling и запрет угадывать account среди нескольких адресов.
- MailIndicator использует useMailCounter и внедрённый сервис. Composable
  отменяет предыдущий запрос, не публикует поздний ответ и останавливает watch
  при unmount; компонент не импортирует сетевую инфраструктуру.
- Weather configuration/links и живые переводы находятся в feature. Новый
  сетевой сервис не добавлен. Существующие шаблоны и CSS не менялись.
- Пять существующих test files перенесены к владельцам. Shared search fixtures
  оставлены на прежнем месте: ими пользуются также browser/UI сценарии.
  Добавлены 5 проверок: mail provider race, unknown auth count, teardown,
  отмена во время подготовки Кинопоиска и независимые initializer promises.
  Compatibility exports сохраняются до этапа 8. ESLint service boundaries
  распространены на search/mail.

check прошёл: форматирование, ESLint, Stylelint, TypeScript, 42 файла / 323 теста.
Обе сборки успешны. Полные текущие browser-наборы прошли: Chrome — 23 сценария,
Firefox — 21 сценарий (вне песочницы). В них проверены provider fixtures,
Кинопоиск, unified bookmark search, mail indicators, weather widget, смена языка,
settings/backup и существующие межмодульные сценарии. Полные UI/live suites
отдельно не запускались; live search и реальная cloud-доставка не проверялись.
Сравнение с предыдущим коммитом подтвердило точное совпадение шаблонов и
стилей пяти затронутых UI-компонентов.

GenerateBundle audit отдельного output подтвердил отсутствие test modules в
production и отсутствие UI/runtime-dom/WXT storage в background. Background
не изменился: Chrome 219475 / Firefox 219129 байт. Стартовый newtab — Chrome
407258 / Firefox 406888 (+1529 к этапу 5), Kinopoisk lazy chunk — 612 (+21).
Backup/capture по-прежнему отдельные lazy chunks; CSS и wallpaper-bootstrap
не изменились. Изменение размера связано с factories, service wiring и новым
composable; сравнительный замер cold start остаётся открытым.

Следующий этап — разделение экрана и стилей. Полный паритет Chrome/Firefox
остаётся обязательной работой тестовой инфраструктуры по разделу 7.4.

## Этап 7 — экран, сценарии и стили

Реализовано 31 октября 2026 года:

- App уменьшен с 1078 до 6 строк. NewtabView (66 строк) собирает toolbar
  (64), bookmarks area (120) и dialog host (177), сохраняя структуру DOM.
- useNewtabScreen (82 строки) связывает отдельные actions, backup flow,
  settings, confirmation, context menu, search view, presentation, focus и
  keyboard composables. Логика App не перенесена в один большой composable.
  Общие refs передаются через screen-local typed Vue context, без singleton.
- Сохранены stale revision guards, capture intent, частичные ошибки,
  переход settings → data management, возврат фокуса, shortcuts, inert во
  время leave и отмена listeners/resources на unmount.
- SettingsPanel уменьшен с 590 до 297 строк: form lifecycle принадлежит
  useSettingsForm, погода — отдельной WeatherSettings. BookmarkGrid уменьшен
  с 395 до 288 строк: drag lifecycle выделен отдельно от image/reveal.
- DataManagementDialog уменьшен с 806 до 330 строк: markup/exposed close
  отделены от useBackupDialog, scoped CSS перенесён в отдельный файл.
  Props/emits, внешний backup format и сценарии операций не менялись.
- Global CSS перенесён независимым механическим шагом в семь последовательных
  файлов. Перед переносом сохранён исходник; AST-разбиение восстановило его
  конкатенацией без изменений. Themes/tokens и порядок правил сохранены.
- Добавлены 2 unit-теста: reopen settings во время flush не закрывает новую
  панель; confirmation блокирует повторный запуск и сохраняет ошибку для retry.
- При визуальной проверке обнаружено, что appearance-снимок мог снимать
  settings до завершения enter transition. Добавлено явное ожидание завершения
  перехода для settings/dialog; сценарий повторно прошёл, снимки просмотрены.

check прошёл: форматирование, ESLint, Stylelint, TypeScript, 43 файла / 325 тестов.
Обе production-сборки успешны. Полные текущие browser-наборы прошли: Chrome —
23 сценария, Firefox — 21 (вне песочницы). Все текущие UI-наборы также проверены:
Chrome — 25 сценариев, Firefox — 14. Для этого выполнены 11 дополнительных
Chrome UI-сценариев и appearance Firefox; ещё 14/13 UI-сценариев совпадают с
browser-наборами. Пересечение исполнено один раз, без сокращения assertions;
отчёт union сохранён локально. После исправления ожидания анимации appearance
Chrome дополнительно повторён и прошёл.

Production audit отдельного output подтвердил отсутствие tests/UI/runtime-dom/
WXT storage в background; background не изменился: Chrome 219475 / Firefox
219129 байт. Backup/capture UI/codec/workflows остаются lazy. Стартовый newtab —
Chrome 413875 / Firefox 413505 (+6617 к этапу 6); lazy dialog — 21119 (+669),
остальные lazy chunks прежнего размера. Прирост относится к компонентным
границам, Vue context и выделенным UI controllers, без новых пользовательских
возможностей. Сравнительный замер cold start пока не выполнен.

CSS-аудит подтвердил точное совпадение последовательности 248 глобальных
production nodes и содержимого 7 scoped блоков после нормализации scope IDs.
Порядок независимых scoped блоков внутри bundle и IDs изменились из-за новой
композиции компонентов. Общий размер CSS прежний: 57907 + 2600 байт; startup
bootstrap — 1714. Просмотрены settings 1280px и data management 320px; browser/UI
assertions проверяют геометрию, focus, drag, scroll и accessibility modes.

Следующий этап — удаление compatibility слоя и финальные архитектурные границы.
Полный паритет Chrome/Firefox по разделу 7.4 остаётся обязательным; текущие
разные allowlists не означают завершённого паритета. Live search/cloud доставка
на этом этапе отдельно не проверялись.
