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

Следом: этап 4 — settings, appearance и sync с сохранением optimistic patches,
flush, background coordinator и wire contracts.
При рефакторинге тестовой инфраструктуры обязателен полный паритет Chrome и
Firefox по разделу 7.4 плана: аудит всех browser/UI/live сценариев и assertions,
устранение всех пробелов (включая theme-startup, bookmark-drag и UI allowlist),
общий реестр сценариев и контроль фактического выполнения в CI. Текущие
23/21 browser-сценария фиксируют исходный разрыв и не являются целевым покрытием.
Проверки границ импортов усиливать при появлении целевых модулей. Изменение форматов хранения,
разрешений расширения и пользовательских сценариев в эту работу не входит.
