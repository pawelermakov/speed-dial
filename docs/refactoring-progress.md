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

## Этап 8.1 — удаление compatibility-путей

Реализовано 31 октября 2026 года. Это первая часть этапа 8, а не завершение
финального этапа целиком.

- Удалены 27 старых файлов: общий types/models.ts, compatibility exports
  services, utils и composables. Импорты типов/значений разделены по реальным
  владельцам; настройки, schema, backup codec, sync, theme, bookmark search,
  reorder, weather и DB больше не требуют старых aliases.
- Удалён неиспользуемый re-export withDataLock из Repository. Реализация и имя
  data lock не менялись, все потребители используют shared infrastructure.
- Background создаёт AutoNameStore вместе с DB; обработчик onChanged вызывает
  тот же invalidate adapter. Удалён промежуточный конструктор на каждое событие;
  metadata, sender/cancellation и removed-tree cleanup сохранены.
- Добавлено ESLint-правило architecture/no-retired-imports. Оно разрешает путь
  относительно реального importer, поэтому не блокирует легитимные feature
  services с тем же именем. Проверены отрицательные примеры static import,
  re-export, dynamic import и import type: все старые пути отклонены.
- README и архитектурная карта обновлены. Runtime i18n, validation helpers
  и Repository пока остаются: их удаление/миграция — отдельные следующие части.

check прошёл: форматирование, ESLint, Stylelint, TypeScript, 43 файла / 325 тестов.
Обе production-сборки успешны. Smoke, i18n и data-management прошли в Chrome
и Firefox (Firefox вне песочницы), включая native capture, backup/reset,
смену языка, второй tab и восстановление в чистом Chrome-профиле.
Полные browser/UI suites на этом небольшом шаге не повторялись;
последний полный прогон выполнен на этапе 7. Финальный прогон остаётся обязательным.

GenerateBundle audit подтвердил прежние границы: нет test modules в production,
нет UI/runtime-dom/WXT storage в background, backup/capture остаются lazy.
Background Chrome 219442 / Firefox 219096 байт (−33 к этапу 7); стартовый newtab
413883 / 413513 (+8), lazy chunks прежнего размера. CSS-аудит подтвердил прежний
глобальный каскад и содержимое scoped blocks; размер CSS 57907 + 2600 не изменился.
Storage schema/keys, backup JSON, manifest и permissions не менялись.

Следом: заменить Repository прямыми feature-портами и отдельным snapshot reader,
завершить i18n по 7.2, строгие межмодульные границы и тестовую инфраструктуру
с полным паритетом Chrome/Firefox по 7.4. После этого — итоговые suites,
чистая установка/обновление и сравнение chunks/cold start с исходной точкой.

## Этап 8.2 — удаление Repository

Реализовано 31 октября 2026 года. Финальный этап 8 продолжается.

- Repository удалён вместе с совместимым конструктором и DialRepositoryPort.
  Production root создаёт source/actions, preferences, appearance и snapshot
  reader отдельно. UI получает только нужные операции через feature-порты,
  без нового агрегированного фасада.
- SnapshotReader координирует только чтение. prepareRead вызывается до
  параллельных settings/background/choices; completion — после их успеха.
  Сохранены read generation, fallback root guards и пропуск background при
  asset/bookmark-only refresh. Reader не захватывает data lock повторно.
- useDial перенесён к владельцу в modules/dial/composables. Settings/background
  записи, source changes и image cache вызывают отдельные сервисы. Snapshot
  по-прежнему публикуется согласованно, с прежними optimistic/dirty fences.
- Capture получает минимальные bound source/actions ports; bookmark/ticket
  фиксируются до lazy loading. Backup получает source и cache отдельно.
  Getters UI и backup service независимы; loaders принадлежат root и dispose.
- Корневые integration tests переименованы в dialIntegration.test.ts. Fixture
  собирает те же реальные модули и возвращает их отдельно; методы Repository
  в тестовый helper не скопированы. Все 325 прежних проверок сохранены, включая
  old-folder read, отказ параллельного read, stale cache, partial import/reset.
- Линтер запрещает возврат services/repository и старого пути useDial; чистый
  snapshot service включён в существующее правило границ services.

check прошёл: форматирование, ESLint, Stylelint, TypeScript, 43 файла / 325 тестов.
Обе production-сборки успешны. Chrome завершил все 23 текущих browser-сценария;
повторный полный Firefox-прогон прошёл все 21 (вне песочницы). Полные дополнительные UI suites
на этом шаге отдельно не повторялись; DOM/CSS не менялись.

Первый Firefox-прогон остановился в themes: после reload проверка получила []
вместо двух fixture tiles. Отдельный диагностический прогон прошёл все 18
комбинаций фон/ширина/тема с source Themes, двумя плитками и без page errors.
Обнаружен конкретный пробел ожидания теста: !querySelector(...)?.disabled
истинно и при отсутствующем элементе, а startup mirror ставит тему до mount.
Ожидание после reload теперь требует существующую enabled-кнопку, fixture
source и две плитки. Сравнения после смены темы не ослаблены; runtime продукта
ради этого не менялся. Это отдельная тестовая корректировка к механическому
удалению фасада. Themes Chrome и полный Firefox-набор повторно прошли после
исправления ожидания. Первый неудачный лог и диагностический прогон сохранены
в .browser-test/stage8-2-browser-firefox.log и stage8-2-themes-debug.log.

Production audit подтвердил отсутствие tests в bundles и UI/runtime-dom/WXT
storage в background. Background прежнего размера: 219442 / 219096 байт.
Стартовый newtab Chrome 411867 / Firefox 411497 (−2016 к 8.1); lazy backup
service 3746, dialog 21071, capture 1849, Kinopoisk 612. Добавлен общий lazy
chunk 72 байта с backup section constants; это feature entities, не возврат
общего types barrel. Backup/capture implementations не входят в стартовый chunk.
CSS cascade/scoped audit прошёл; CSS и bootstrap не менялись. Сравнительный
замер cold start пока не выполнен, изменение bytes не является замером скорости.

Далее — миграция i18n по 7.2, полные межмодульные проверки и инфраструктура
тестов с паритетом Chrome/Firefox по 7.4. Затем — окончательные suites,
чистая установка/обновление и сравнение cold start с исходной точкой.

## Этап 8.3 — Vue I18n

Реализовано 31 октября 2026 года. Этап 8 продолжается.

- Собственный services/i18n удалён. Vue I18n 11.4.16 устанавливается до mount;
  отдельный контекст принадлежит newtab application и его lifecycle.
  UI использует $t/useUiI18n; справочники и helpers получают переводчик.
- Словари остаются только в locales/ru.json, en.json, es.json. Девять plural-групп
  преобразованы в формат Vue I18n; сохранены базовые ключи, тексты и параметры.
  Плоские ключи разрешаются явно, категории выбирает Intl.PluralRules.
- DTO и ошибки не импортируют UI runtime. Error.message содержит диагностический
  ключ, пользовательский текст форматируется на UI-границе. Background больше
  не загружает Vue, Vue I18n и словари. ESLint запрещает обратные импорты.
- Settings.language, startup mirror, document.lang, remote updates и обновление
  открытого UI сохранены. Production singleton отсутствует.
- Три новых теста проверяют независимость контекстов, startup mirror и 14 274
  результата перевода по golden hashes прежнего runtime: 366 ключей, три языка,
  13 значений count, включая дробные/отрицательные, и параметры с @{}|.
  Прежние проверки ошибок явно проверяют локализованный текст через matcher.

npm run check прошёл: форматирование, ESLint, Stylelint, TypeScript, 44 файла /
328 тестов. Обе production-сборки успешны. Полные текущие browser suites прошли:
Chrome 23, Firefox 21. Дополнительные UI-сценарии (11 Chrome, 1 Firefox) также
прошли; вместе с пересечением browser suites проверены текущие UI-наборы 25/14.
Устранение различий наборов и allowlist остаётся обязательным следующим шагом 7.4.

Production audit подтвердил отсутствие тестов в bundles, Vue/Intlify/словарей/UI
и WXT storage в background, сохранение lazy backup/capture. Background
Chrome/Firefox: 120963 / 120617 байт (−98479 к 8.2). Стартовый newtab:
458610 / 458240 (+46743); новый UI runtime увеличивает стартовый chunk.
Lazy backup service 3746, dialog 21102, capture 1849, Kinopoisk 612, constants 72.
CSS прежний (57907 + 2600 байт); глобальный cascade и все scoped rules совпадают.
Оба manifest и все browser locale messages побайтно совпадают с 8.2.
CSP и permissions не менялись; JIT Vue I18n проверен в production обоих браузеров.
Изменение bytes не является сравнением скорости cold start.

Далее — полные архитектурные границы, тестовая инфраструктура и равнозначное
покрытие Chrome/Firefox по 7.4. Финальные suites, установка/обновление и
сравнительный cold start обязательны до завершения этапа 8.

## Этап 8.4 — архитектурные границы

Реализовано 31 октября 2026 года. Этап 8 продолжается.

- Добавлено architecture/import-boundaries: запрет внутренних импортов соседних
  features, обратной зависимости feature → dial и shared → app/modules,
  production → tests/fixtures/mocks, собственного barrel внутри feature.
  Публичные чистые entries перечислены явно. Проверяются static/type imports,
  re-exports, dynamic imports (включая строковый template literal) и @/~/ aliases.
- Entities/helpers/services не загружают Vue/browser/Dexie и конкретные adapters;
  composables получают адаптеры через зависимости. Type-only порты и ссылки на
  компоненты для refs допустимы. Старые удалённые пути также запрещены через aliases.
- Исправлены внутренний импорт SyncState и собственные barrels. BackgroundResource
  и preview operations собираются в newtab root; backup codec/download передаются
  composable при сборке lazy dialog. Открытие вкладки и bookmark events приходят
  из root вместо прямого импорта WXT в UI composables. Фильтр asset-only events
  сохраняет прежнюю семантику обновления списка папок и cleanup подписок.
- npm run test:architecture включён в check и существующий CI: десять тестов
  запрещённых/разрешённых импортов и обход 155 production TS/Vue файлов на
  статические runtime-циклы. Type-only и deferred dynamic edges исключены из
  проверки именно статических runtime-циклов.

check прошёл: форматирование, ESLint, Stylelint, 10 архитектурных тестов,
проверка графа, TypeScript и 328 unit-тестов в 44 файлах. Обе production-сборки
успешны. Проверены затронутые browser-сценарии smoke, settings-autosave,
folder-interaction, data-management, keyboard-navigation, themes, wallpaper-startup
в Chrome и Firefox; дополнительно theme-startup в Chrome. Полные browser/UI
наборы на этом шаге не повторялись; паритет Firefox ещё не реализован.

Production audit: tests отсутствуют в bundles; background не содержит Vue,
Intlify, словарей, UI и WXT storage; lazy backup/capture сохранены. Background
прежний: 120963 / 120617 байт. Стартовый newtab Chrome/Firefox 458680 / 458310
(+70); lazy dialog 21262 (+160), остальные lazy chunks прежнего размера.
CSS cascade и все scoped rules совпадают с baseline, размеры 57907 + 2600 байт.

Следующая часть — реорганизация тестов и матрица фактического покрытия по 7.4,
затем устранение всех browser/UI/live-пробелов и Firefox allowlist.

## Этап 8.5 — матрица и перенос browser/UI-сценариев

Реализовано 31 октября 2026 года. Это организационная часть 7.4;
рефакторинг тестов и обязательный паритет браузеров ещё не завершены.

- До переноса создана docs/browser-test-matrix.md по фактическим веткам,
  optional adapters, assertions и live-режиму. Матрица содержит все 34 уникальных
  scenario IDs и ожидаемые различия native APIs. У Firefox 12 отсутствующих
  реализаций и 16 сценариев с различиями assertions/visual artifacts; ещё шесть
  используют общий check без найденных односторонних проверок. В том числе
  выявлены пустой startup language trace, пропущенный offline, forced colors,
  screenshots, native downloads/file input и сокращённые feature-сценарии.
- Перенесены 37 MJS-файлов: сценарии в tests/browser/<feature> и tests/ui,
  общие browser helpers в tests/browser/helpers. Firefox smoke остаётся частью
  extension smoke, а не новым отдельным сценарием. Compatibility scripts не оставлены.
- tests/scenarios.mjs хранит suite membership и пути. Общие browser/UI сценарии
  включаются одним файлом; scripts/test.mjs содержит только orchestration.
  Команды npm test/test:browser/test:ui/test:live, browser flags, порядок запуска
  и исходное ограничение Firefox сохранены. Allowlist удалится после реализации
  полного паритета, а не за счёт успешного no-op или запуска Chrome вместо Firefox.
- Пять search provider fixtures перенесены к владельцу search вместе с source
  notes. Unit и browser чтение обновлены; shared favicon fixtures остались в tests.
  Live использует тот же provider entry, сеть на этом шаге отдельно не запускалась.
- ESLint учитывает browser globals новых MJS paths. Узкое исключение для
  scripts/test.mjs разрешает тестовому runner импорт реестра; production → tests
  остаётся запрещённым и проверяется отдельным negative test.
- Добавлены четыре проверки реестра: существование/уникальность сценариев,
  отсутствие незарегистрированных browser/UI файлов, относительные imports,
  live entry и наличие локальных provider fixtures. Они выполняются в check/CI.
  Остальная организация unit/integration tests и минимизация setup ещё предстоят.

Механическая сверка подтвердила неизменность AST всех 37 перенесённых scripts
после нормализации только import/fixture paths, syntax validation, прежние семь
вариантов --list и побайтную сохранность пяти provider fixtures. Assertions,
fixtures и browser branches не переписаны и не ослаблены.

check прошёл: форматирование, ESLint, Stylelint, 15 архитектурных/registry тестов,
production graph, TypeScript и 328 unit-тестов в 44 файлах. Обе production-сборки
успешны; все 18 файлов каждой сборки побайтно совпали с 8.4, включая chunks,
CSS, bootstrap, manifest и browser locales. Test-only код не добавил production bytes.

Полные текущие browser suites прошли: Chrome 23, Firefox 21 (вне песочницы).
Дополнительные UI-сценарии прошли: Chrome 11, Firefox 1; вместе с общими browser
сценариями выполнены текущие UI-наборы 25/14. Прогоны подтверждают сохранность
переноса, но не устранение пробелов из матрицы. Local reports/verification
сохранены в .browser-test/stage8-5-*.

Далее — общий driver/cases и закрытие всех отсутствующих и частичных Firefox
проверок, одинаковые live cases, обязательные отчёты и устранение allowlist.
Полное завершение 7.4 требует обновлённой матрицы без незакрытых пробелов.

## Этап 8.6 — паритет startup-тем

Реализована отдельная часть 31 октября 2026 года. Полный паритет по 7.4 и
рефакторинг тестов не завершены; native bookmark-drag Firefox остаётся открытым.

- theme-startup теперь выполняет один общий check на обеих платформах: десять
  обязательных cases. Сохранены четыре сочетания user mode / OS theme до mount,
  wallpaper shade, color-scheme/background, реальная вторая вкладка, focus,
  contrast, reduced transparency и forced colors. Добавлен native capability case.
- Общий driver использует Chrome/Marionette adapters. В копии production HTML
  app script остаётся инертным до release; bootstrap/CSS и все payload-файлы
  прежние. Отсутствующий/неоднозначный entry вызывает ошибку, mount после release
  обязателен. Production entry/manifest не изменяются. Firefox helper получил
  optional extension path с прежним default; legacy themes Firefox также прошёл.
- Firefox без feature-pref не даёт reduced-transparency signal: проверяются
  native query и прежняя translucent surface/backdrop. Затем только в тестовом
  профиле включается feature и повторно разбирается тот же CSS; opaque branch
  проходит те же assertions, что Chrome. Доступность/включение явно отражены
  boolean metadata, не выдаются за поддержку OS-сигнала обычным Firefox.
- Runner поддерживает --scenario=<id>, отказывает неизвестным/не реализованным
  на платформе scenarios и проверяет свежий UUID, status и точный case list.
  Отсутствующие, повторённые или stale cases не засчитываются как успех.
  CI сохраняет только coverage JSON фиксированной схемы: IDs, UUID, status,
  cases и boolean flags; пути и error text исключены и запрещены тестом схемы.
- Исследован native drag Firefox. Trusted dragstart получается, но native
  drop/reorder в проверенных headless backends не завершились. Эти прогоны не
  засчитаны как успех; обходы не включены в рабочий код. Chrome bookmark-drag
  восстановлен побайтно, Firefox не добавлен в его support list. Diagnostic trace
  находится в .browser-test/stage8-6-native-drag-diagnostic.log; матрица сохраняет пробел.

check прошёл: форматирование, ESLint, Stylelint, 21 архитектурная/registry/gate
проверка, production graph, TypeScript и 328 unit-тестов в 44 файлах. End-to-end
runner --scenario=theme-startup прошёл в Chrome и Firefox с десятью cases и
валидацией свежих отчётов. Обе production-сборки прошли; все 18 файлов каждой
побайтно совпадают с 8.4/8.5. Полные browser/UI suites на этом шаге не повторялись.

Реестр теперь содержит browser 23/22 и UI 25/15. Это списки реализации, а не
доказательство полного равенства assertions. Матрица: 11 отсутствующих Firefox
реализаций и 16 частичных; следующий шаг — native drag backend и остальные
UI/browser/live пробелы. Коммит этого шага не означает завершение этапа 8.

## Этап 8.7 — общие accessibility/offline/screenshot проверки

Реализовано 31 октября 2026 года. Закрыты пять частичных Firefox-пробелов:
weather-widget, mail-indicators, scroll-stability, confirmation-dialogs, empty-states.
Полный паритет по 7.4 и этап 8 ещё не завершены.

- Обе платформы используют один check и runSharedScenario. Отдельные Chrome/Firefox
  wrappers удалены; key/pointer/hover/wheel/resize/media/offline/screenshot операции
  находятся в общем driver с минимальными browser adapters. Старый wheel settling
  interval сохранён. Начальные media conditions задаются одинаково.
- Все 92 прежних assert calls общих core-функций сохранены — проверено по AST.
  Chrome-only forced-colors focus/motion/mask assertions перенесены в общий код.
  Mail использует прежний Gmail fixture. Native Firefox offline проверяется
  navigator.onLine, media conditions — matchMedia. Styles/status не подменяются.
- Удалены optional guards media/offline/shot/screenshot и default no-op shot.
  Firefox теперь проходит weather offline branch, focus/motion mail/weather,
  forced-colors mask scroll и empty-state focus; confirmation/empty screenshots
  обязательны. Успешный запуск требует всех десяти case IDs пяти сценариев.
- Проверяются 39 свежих PNG на платформу: weather 15, mail 5, scroll 2,
  confirmation 6, empty 11. Старый файл удаляется до capture; новый обязан иметь
  PNG header и ненулевые размеры. artifactCount проверяется по контракту и
  включён в строгий coverage JSON без путей/diagnostics. CI сохраняет отчёты
  этих пяти сценариев по явным безопасным путям, как theme-startup.
- Два новых инфраструктурных теста проверяют case/artifact contracts обеих
  платформ и отказ на пропуск, повтор, неверное число/тип artifacts, path metadata.

check прошёл: форматирование, ESLint, Stylelint, 23 инфраструктурных/архитектурных
проверки, production graph, TypeScript и 328 unit-тестов в 44 файлах. Все пять
сценариев прошли в Chrome и Firefox с одинаковыми 10 cases и 39 PNG. Theme-startup
повторно прошёл на обеих платформах после расширения media driver. Полные suites
на этом шаге отдельно не повторялись. Обе production-сборки успешны; все 18 файлов
каждой побайтно совпадают с 8.4/8.5/8.6, production-код не менялся.

Реестр остаётся browser 23/22, UI 25/15. По матрице остаются 11 отсутствующих
Firefox реализаций и 11 частичных; native bookmark-drag в их числе. Live-сеть на
этом шаге не запускалась. Прогоны и AST/report verification сохранены локально
в .browser-test/stage8-7-*.

## Этап 8.8 — паритет локализации при старте

Реализовано 31 октября 2026 года. Закрыт частичный Firefox-пробел i18n;
полный паритет по 7.4 и этап 8 ещё не завершены.

- Вместо Chrome-only addInitScript обе платформы получают один observer до
  production app entry в изолированной копии HTML. Bootstrap, CSS, manifest,
  app chunks и остальные production-файлы сохранены. Observer восстанавливается
  при настоящем reload и наблюдает также изменения title attribute.
- Проверки первого запуска и сохранённого испанского языка после reload требуют
  непустой trace. Отсутствующий observer, пустой/sparse trace и неверный язык
  не засчитываются как успех. Прежняя vacuous every-проверка заменена;
  остальные 18 assert-вызовов общего check сохранены по AST-сверке.
- Chrome и Firefox проходят один check для ru-RU/es-MX/de-DE/es-ES/fr-FR.
  Сохранено объединение всех прежних региональных fixtures обеих платформ.
  Runner требует пять точных locale cases со свежим UUID; CI загружает этот
  отчёт по явному пути и прежней безопасной схеме. Имена screenshots включают
  tag, поэтому шесть снимков каждого fixture не перезаписывают соседние.
- Общий extension driver получил locale option с прежним ru-RU default.
  Отдельные i18n browser wrappers удалены. Оценка длительности i18n в scheduler
  увеличена для пяти fixtures, чтобы сохранить распределение нагрузки.

Локально check прошёл: 31 инфраструктурная/архитектурная проверка, TypeScript,
328 unit-тестов в 44 файлах, lint/style/format. I18n runner прошёл в Chrome и
Firefox со всеми пятью locale cases. Обе сборки успешны; проверены все 18 файлов
каждого инструментированного fixture. Итоговый коммит должен пройти полный CI
перед завершением шага. Прогоны сохранены в .browser-test/stage8-8-*.

Реестр остаётся browser 23/22, UI 25/15. В матрице остаются 11 отсутствующих
Firefox-реализаций и 10 частичных; native bookmark-drag остаётся открытым.
Live-сеть на этом шаге не запускалась.

## Этап 8.9 — паритет стартового фона

Реализовано 31 октября 2026 года. Закрыт частичный Firefox-пробел wallpaper-startup;
полный паритет по 7.4 и этап 8 ещё не завершены.

- Две независимые browser-ветки заменены одним check с полным прежним Chrome
  поведением: preview до приложения, отсутствие Vue до release, удержанная
  декодировка оригинала, прозрачность слоёв и opacity до/после decode, fixed
  positioning, отсутствие fade, лимит размера preview, замена, удаление и
  очистка устаревшего preview без IndexedDB image.
- Тестовая копия HTML сохраняет production bootstrap/CSS/app payload. Prelude
  перед bootstrap собирает ошибки и unhandled rejections на каждом reload;
  decode hook сохраняет реальный decoder и его ошибки. Unit-проверки требуют
  завершения реальной decode promise и явного release; обычные/data images и
  последующие blob images не блокируются.
- На обеих платформах PNG 1920×1080 загружается через native file input.
  Общий driver получил setInputFiles adapter; Firefox использует WebDriver
  ElementSendKeys с реальным локальным файлом вместо синтетического File или
  прежней прямой записи assets в IndexedDB.
- Runner требует четыре case IDs и три свежих PNG на браузер. Старые snapshots
  удаляются перед capture, проверяются PNG header и ненулевые размеры.
  CI получает фиксированный безопасный JSON по явному пути.

Локально check прошёл: 35 инфраструктурных/архитектурных проверок, TypeScript,
328 unit-тестов в 44 файлах, lint/style/format. Wallpaper-startup runner прошёл
в Chrome и Firefox: одинаковые четыре cases и три screenshots. Обе сборки
успешны. Полные suites локально на этом шаге не повторялись; CI запускается
после push. Прогоны сохранены в .browser-test/stage8-9-*.

Реестр остаётся browser 23/22, UI 25/15. В матрице остаются 11 отсутствующих
Firefox-реализаций и 9 частичных; native bookmark-drag остаётся открытым.
Live-сеть на этом шаге не запускалась.

## Этап 8.10 — паритет текстовых плиток

Реализовано 31 октября 2026 года. Закрыт частичный Firefox-пробел text-tiles;
полный паритет по 7.4 и этап 8 ещё не завершены.

- Chrome/Firefox выполняют один check. Прежние Chrome asset, rename и ICO
  fixture callbacks перенесены без изменения данных и операций, кроме доступа
  к browser/chrome API. Сохранены favicon-only, valid/corrupt thumbnails,
  отсутствие caption у текстовой плитки, normalized hostname, безопасный title,
  цвета и их равенство, стабильность при reload и rename, наблюдение коротких
  text fallbacks, размеры/nowrap/font constraints девяти layouts, оба ICO RGB
  и белый текст после двух reload. Firefox-only hostname assertion включён в
  общий check. Полнота не заменена одним успешным exit code.
- Общий prelude перед production bootstrap сохраняет медленный decoder 100 ms
  и frame sampler; исходный интервал наблюдения 250 ms сохранён. Записываются
  ошибки/unhandled rejections на каждом reload. Обе платформы отключают внешнюю
  сеть через native offline adapter; assets/ICO остаются локальными fixtures.
- Driver поддерживает movePointer и optional element screenshot: Chrome locator
  screenshot, Firefox native TakeScreenshot с element ID. Для снимка сетки PNG
  dimensions сверяются с её bounding rect; остальные девять — снимки окна.
  Перед capture старые PNG удаляются, header и ненулевые размеры обязательны.
- Runner требует четыре точных case IDs и десять artifacts на браузер. CI
  загружает отчёт по явному пути и прежней безопасной схеме. Три инфраструктурных
  теста проверяют sampler, slow decode, ранний prelude и полноту report contract.

Локально check прошёл: 38 инфраструктурных/архитектурных проверок, TypeScript,
328 unit-тестов в 44 файлах, lint/style/format. Text-tiles runner прошёл в Chrome
и Firefox: четыре cases и десять screenshots. Обе сборки успешны. Полные suites
локально не повторялись; CI запускается после push. Прогоны сохранены в
.browser-test/stage8-10-*.

Реестр остаётся browser 23/22, UI 25/15. В матрице остаются 11 отсутствующих
Firefox-реализаций и 8 частичных; native bookmark-drag остаётся открытым.
Live-сеть на этом шаге не запускалась.

## 8.11. Полный общий набор Chrome и Firefox

Все 34 сценария используют одинаковый полный реестр и обязательные case
contracts. Закрыты 11 отсутствующих Firefox-реализаций и восемь сокращённых
веток: native drag, UI/style/accessibility/startup, download/import в чистый
профиль, folder/dialog/provider проверки, autosave, sync и smoke. Сохранены
Firefox-only проверки, перенесённые в общий check с явными assertions для
различий нативных API. Сокращённый firefox-smoke удалён. CI загружает все
34 валидируемых отчёта; архитектурные проверки запрещают пробелы реестра,
contracts и списка артефактов.

Общий драйвер использует настоящий Marionette input, BiDi network interception,
native download/file input, независимые вкладки/профили и точные узкие viewport.
Firefox native HTML5 drag завершается через текущую browser drag session после
настоящего pointer-down/move; trusted events и persisted order проверяются
отдельно от сохранённых синтетических regression fixtures. В startup сохранены
проверки реальных screenshot clips и fractional DPR. Профильные runtime-запросы
в fixtures завершаются до закрытия вкладки, ошибки приложения не фильтруются.

Обнаруженные общими тестами исправления приложения:

- Tooltip остаётся в viewport после native wheel, включая короткое окно.
- Keyboard focus использует уже существующий app modality flag и сохраняет
  кольца в Firefox после программного focus; pointer modality очищает этот flag.
- Auto-name ticket переживает промежуточные title/URL события Chrome при
  редактировании между разными доменами. Два unit regression tests сохраняют
  строгую инвалидизацию при внешней смене заголовка. Тип записи IndexedDB
  синхронизирован с моделью; формат хранилища и версия базы не меняются.

TypeScript, 330 unit-тестов в 44 файлах, 39 архитектурных проверок, lint и
stylelint прошли. Полный локальный набор прошёл: 34/34 в Chrome и 34/34 в Firefox, по 205
контрольных точек и 331 свежему PNG. После исправления error collector
Firefox themes повторён отдельно, остальные сценарии продолжены с валидацией
свежих отчётов. Сверены одинаковые ordered cases и artifact counts всех
68 отчётов. CI по просьбе пользователя не ожидается.
Live-проверка выполнена по шесть запросов на браузер: Firefox 6 PASS,
Chrome 4 PASS и два MyShows BLOCKED (HTTP 502/HTML); детерминированные
provider fixtures прошли в обоих браузерах.
