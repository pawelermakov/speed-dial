# Архитектура SpeedDial X

SpeedDial X постепенно переходит к модульной структуре по
[плану рефакторинга](REFACTORING_PLAN.md). Этот документ описывает реализованные
границы. WXT, Vue 3, TypeScript, Dexie и Tailwind сохраняются.

## Реализовано на этапах 1–4

| Владелец                        | Контракты                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `modules/dial`                  | Составной `Snapshot`, сообщения обновления вкладок, `UpdatesPort`                         |
| `dial/modules/bookmarks`        | Bookmark, Folder, FolderChoice, BookmarkNode, assets; BookmarksPort, RootPort, AssetsPort |
| `dial/modules/settings`         | Settings, defaults, SettingsEnvelope, SettingsPort                                        |
| `dial/modules/appearance`       | ThemeMode и themeModes                                                                    |
| `dial/modules/search`           | Провайдеры поиска, SearchSuggestion                                                       |
| `dial/modules/backup`           | Формат импорта/экспорта, выбор разделов, отчёты                                           |
| `dial/modules/capture`          | Запрос/ответ захвата                                                                      |
| `dial/modules/weather`          | Чистые справочники городов и провайдеров, их ID                                           |
| `dial/modules/sync`             | SyncClient с существующей сигнатурой отправки                                             |
| `shared/i18n`                   | Чистые Language/MessageKey/MessageText и фабрики message/joinMessages                     |
| `shared/infrastructure/browser` | Контракт и реализация DataLock                                                            |

Пути `dial/modules/...` в таблице относительны к `modules/`. Каждый feature имеет
публичный `index.ts`. Внутри feature используются прямые относительные импорты,
между feature — публичные контракты. Snapshot принадлежит dial: подмодули не
должны импортировать его или возвращаться за своими типами в `types/models.ts`.

Entities и чистые helpers не загружают Vue, WXT, Dexie, локальное хранилище или
DOM. Импорт JSON в `shared/i18n/contracts.ts` — только type import для проверки
ключей; он не загружает словарь в runtime. Defaults всегда используют русский
язык; выбранный язык UI устанавливается отдельно при запуске вкладки.

Сервисы получают минимальные порты. BookmarksPort описывает операции над деревом,
SettingsPort — envelope настроек, AssetsPort — локальные изображения.
`BookmarkAssetStore` реализует AssetsPort. Модули получают этот контракт через
composition root. DataLock, UpdatesPort и SyncClient передаются через
DialDependencies; sync messages типизированы и отдельно проверяются в runtime.

## Сборка и lifecycle

- `app/createNewtabApplication.ts` собирает source/actions bookmarks, preferences,
  appearance, snapshot reader, settings/root storage, соединение Dexie,
  browser events и BroadcastChannel для вкладки.
- `entrypoints/newtab/main.ts` устанавливает язык до mount и передаёт приложение
  через типизированный provide/inject из `app/serviceContext.ts`. На UI-границе
  вызывается useServices; useDial также принимает DialDependencies явно для тестов.
- `app/createBackgroundApplication.ts` отдельно собирает background sync,
  capture queue и bookmark metadata listeners. Проверки sender/runtime ID/newtab URL,
  валидация запросов и отмена capture при disconnect сохраняются.
- Schema Dexie находится в shared/infrastructure/database, имя SpeedDialX и версия 3
  прежние. TileAssetRecord описывает persisted row, а BookmarkAssets — feature-модель;
  они структурно совместимы. Shared schema не импортирует feature-контракты.
- Блокировка speed-dial-data находится в shared infrastructure; fallback queue одна
  на JS-контекст. Newtab и background используют один контракт, но разные JS-контексты.
- useDial владеет реактивным состоянием, timers и своими подписками storage/events/updates.
  При unmount он снимает их и отсекает поздние результаты. Root dispose закрывает
  свой канал, оставшиеся browser event subscriptions и соединение Dexie; HMR вызывает cleanup.
- Background dispose снимает listeners sync/metadata/capture, останавливает coordinator,
  отменяет активные capture connections и закрывает DB. Повторный dispose безопасен.
- BroadcastChannel сохраняет имя speed-dial-updates, сообщения updated/assets/background
  и поддержку старой строки updated. Asset-only обновления не инвалидируют drag.

## Переходные части

- На этапе 8.1 удалены `types/models.ts` и старые feature aliases из services,
  utils и composables. Типы, helpers, schema, adapters и UI composables
  импортируются у владельцев. DB импортируется из shared infrastructure;
  data lock сохраняет единственную реализацию.
- `architecture/no-retired-imports` проверяет static imports, re-exports,
  dynamic imports и import types по разрешённому абсолютному пути. Он не
  запрещает feature-local services только из-за совпадения basename.
- Background root создаёт AutoNameStore вместе с DB и передаёт изменения в
  тот же metadata adapter, без промежуточной compatibility-функции.
- Repository и DialRepositoryPort удалены на этапе 8.2. useDial принадлежит
  dial/composables и получает отдельные порты source/actions, preferences,
  appearance и SnapshotReader. Старый путь useDial также запрещён линтером.
- На этапе 8.3 UI переведён на Vue I18n 11 (Composition API). Экземпляр принадлежит
  newtab application, устанавливается до mount и освобождается при dispose.
  Словари остаются только в корневой папке `locales/`.
- UI использует useUiI18n/$t; обычные helpers получают переводчик явно.
  contracts/messages/errors/formatMessage остаются чистыми. Background передаёт
  DTO без загрузки Vue, переводчика и словарей. Production singleton отсутствует.
- Плоские ключи разрешаются явно, plurals используют категории Intl.PluralRules.
  Settings.language обновляет locale, document.lang и startup mirror.
  JIT Vue I18n работает с прежней CSP; manifest messages генерируются отдельно WXT.

ESLint проверяет чистоту новых entities и независимость shared от modules.
Ограничения legacy-каталогов усиливаются при их переносе. Не добавлять новые
функции в старые общие каталоги только ради использования привычного пути.

## Вертикальный сценарий bookmarks

В `app/createNewtabApplication.ts` создаётся BookmarksModule через
`createBookmarksModule({database, bookmarks, root, lock, normalizeUrl, presentation})`.
Фабрика собирает BookmarksSource, BookmarkActions, BookmarkAssetStore и AutoNameStore
с тем же соединением Dexie. UI не создаёт эти зависимости.

- `services/source.ts` владеет root/active selection, read generation и recovery
  notice; читает дерево/папки, ищет локальные закладки и добавляет assets к view.
- `services/actions.ts` выполняет CRUD, folder operations, reorder, capture title
  и image guards через BookmarkSourcePort, BookmarksPort, AssetsPort и AutoNamesPort.
- Сервисы не импортируют Vue, WXT, Dexie или адаптеры. Перевод/создание ошибок,
  нормализация URL, data lock и преобразование native move index передаются извне.
- `helpers/folders.ts` содержит правила native folders/separators и подписи через
  переданный переводчик. `adapters/moveIndex.ts` сохраняет разницу Chrome/Firefox.
- `adapters/assets.ts` и `adapters/autoNames.ts` инкапсулируют доступ к feature
  таблицам. getStored читает raw assets для backup без декодирования/фильтрации;
  обычные get/getMany сохраняют best-effort обработку необязательных изображений.
- UI actions вызывают source и actions напрямую. Backup использует source,
  cache action, metadata/assets и профильные settings/appearance порты.
- prepareRead фиксирует поколение/выбор до асинхронных операций. SnapshotReader ждёт
  settings/background/choices, затем завершает чтение bookmarks. При ошибке раннего
  чтения fallback root не сохраняется; старое чтение не меняет новый active/root.
- `composables/useBookmarkSearch.ts` принадлежит bookmarks и принимает минимальные
  BookmarkSearchPort и BookmarkSearchView. Подмодуль не зависит от родительского Snapshot.
- Тесты в `bookmarks/tests` проверяют factory → source/actions → adapters через
  MockBookmarks/fake-indexeddb, auto-name tickets, assets, folders, search и reorder.
  Межмодульные проверки согласованного snapshot/backup/reset находятся в
  tests/dialIntegration.test.ts. Общий fake находится в tests/helpers с type-only contract import.

В production root создаёт BookmarksModule один раз. Fixture интеграционных
тестов собирает те же реализации и возвращает отдельные модули, без тестовой
копии фасада или совместимого конструктора. Старые wrappers удалены на этапе 8.1.

## Settings, appearance и sync

- settings/services/settings.ts сохраняет/patch-ит текущие настройки через порты,
  проверяет source до записи, фиксирует root последним и выполняет прежний rollback
  настроек/фона при сбое. Production root передаёт этот сервис как preferences.
- settings/composables/useSettingsState.ts владеет confirmed/pending fields,
  версиями записей, field errors и ready. Он возвращает overlay для одного publish
  общего snapshot. track/flush учитывают также незавершённые операции root/background
  редактора; sync flush вызывается после local writes.
- Settings storage сообщает об успешном сохранении через SettingsChangeSink.
  Он не импортирует sync module и не ожидает runtime message под data lock.
  Composition root связывает sink с SyncClient; remote apply coordinator пишет
  низкоуровневый local storage и не создаёт echo через этот sink.
- appearance/services/appearance.ts и adapters/storage.ts владеют background row.
  useBackgroundState содержит dirty/version и startup-read guards. UI adapters
  BackgroundResource/backgroundPreview и composable useTheme находятся в appearance;
  public wallpaper-bootstrap.js, URL, mirrors, CSS и порядок первого paint сохранены.
- sync/services/coordinator.ts содержит прежний SettingsSync с sparse writes,
  rate limit, retry, account/folder epochs и portable source locator. Алгоритм
  сохранён; нативная инфраструктура находится в adapters/background.ts.
- sync/services/client.ts создаёт личную outgoing queue на приложение. Browser
  transport находится в adapters/browserClient.ts; ошибка доставки не отменяет
  успешный local save, а записывается в отдельный sync status.
- SettingsSyncMessage — discriminated union исходящих сообщений; incoming patch
  имеет Record<string,unknown>. Декодер проверяет action/type, формы payload и
  ограничения folder ID, а coordinator отдельно валидирует ключи/значения patch.
  Sender/runtime ID/newtab URL проверяются независимо от TypeScript.
- SyncState/SyncInfo отделены от Settings. UI получает sync client, status storage
  и account-status reader через useServices; email остаётся только в памяти UI.
- Portable locator и native folder rules опубликованы отдельными pure entries
  bookmarks/locators.ts и bookmarks/folders.ts, без импорта UI/фабрики bookmarks.
- Schema helper пока использует validateSettings. Мост нормализации сохраняется;
  services/i18n удалён на этапе 8.3, compatibility aliases — на этапе 8.1.

Тесты theme/background/appearance и settingsSync/accountStatus перенесены к
владельцам. Новые тесты покрывают concurrent optimistic edits, flush связанных
записей, rollback/partial restore, stale background, независимые sync queues,
transport failures и malformed wire messages. Межмодульные useDial/snapshot
проверки остаются в корневой инфраструктуре.

## Backup, capture и отложенная загрузка (этап 5)

- backup/services/backup.ts владеет export/import/reset через порты bookmarks,
  settings и appearance. Сохраняются expected-state guards, внешний data lock,
  частичные отчёты и формат JSON v3. adapters/json.ts содержит codec/limits;
  adapters/download.ts отдельно выполняет DOM download.
- backup/newtab.ts загружает диалог управления данными по запросу. Пока загрузка
  не завершена, settings остаются открыты; ошибка показывается локализованно.
  Закрытие settings или приложения во время ожидания не открывает диалог позже.
- capture/services/workflow.ts координирует thumbnail, favicon и защищённое
  автоимя. prepare.ts фиксирует исходное состояние до ожидания lazy module.
  Клиент runtime port, очередь и browser tab handler разделены по владельцам.
- capture/newtab.ts создаёт клиент на экземпляр приложения. Dispose отменяет
  ожидающие запросы, снимает listeners/timers и запрещает позднюю публикацию.
  Клиентский timeout 45 секунд включает очередь background; активный capture
  ограничен 20 секундами. Сохранены предел очереди, sender checks и owned-tab cleanup.
- Background регистрирует listeners синхронно и создаёт единственную очередь
  при первом допустимом запросе. Его factory импортируется статически: WXT
  собирает background в один файл; runtime dynamic import для него не нужен.
  Отмена во время ожидания factory не запускает захват.
- shared/helpers/lazy.ts хранит один Promise на экземпляр, сбрасывает его после
  ошибки и освобождает ресурсы, включая результат, полученный после dispose.
  Composition root владеет loaders; UI и backup service имеют отдельные getters.
  Backup service создаётся с минимальными bound ports к реальным модулям.

Production audit подтверждает отдельные chunks codec/dialog, backup service и
capture client/workflow в обоих браузерах. В стартовом newtab chunk их нет;
в background нет UI/test modules, runtime-dom и WXT storage.

## Search, mail и weather (этап 6)

- Search service координирует query limit, deadline и единственную повторную
  попытку transient GraphQL ошибки. HTTP, ограничение MIME/размера, provider DTO
  и парсеры принадлежат adapters/providers.ts. UI получает SearchSuggestion[].
  Тексты/навигация находятся в helpers/presentation.ts, без сетевых операций.
- SearchBar использует feature useProviderSuggestions: debounce 250 мс,
  generation fence, abort при изменении query/provider/language и при unmount.
  Локальные bookmark queries никогда не передаются сетевому сервису.
- newtab root создаёт search service. Инициализатор Origin rule Кинопоиска
  загружается лениво и принадлежит экземпляру приложения; конкурентная
  подготовка разделяет Promise, ошибка позволяет повторить установку.
  Общая session rule не удаляется при закрытии одной вкладки.
- MailIndicator использует useMailCounter с внедрённым mail service, без HTTP
  в компоненте. Composable хранит unknown count до успешного ответа, отменяет
  старый запрос и отбрасывает поздние результаты. Polling не добавлен.
- Mail service задаёт общий timeout 8 секунд и выбирает reader. Адаптеры
  владеют credentialed HTTP, текущим Mail.ru account, XML/JSON parsers и
  классификацией ошибок. Error status не превращается в нулевой счётчик.
- Weather остаётся справочником городов/провайдеров и localized link helpers.
  Forecast API, fetch и новое persistent state не добавлены.
- Unit-тесты функций перенесены в модули. Общие search fixtures остаются
  в tests/fixtures: их используют также browser/UI сценарии, без дублирования.
  Compatibility exports services/utils удалены на этапе 8.1.

Компоненты экрана пока находятся в components; их композиция и разбор App
относятся к этапу 7. Шаблоны и CSS на этапе 6 не менялись.

## Экран и стили (этап 7)

- App.vue — оболочка NewtabView. NewtabView собирает NewtabToolbar,
  NewtabBookmarks и NewtabDialogHost без дополнительных DOM wrappers.
- useNewtabScreen содержит только создание и связывание сценариев.
  useBookmarkActions, useFolderActions, useBackupFlow, useSettingsPanel и
  useConfirmation владеют своими действиями и состоянием. useContextActions
  координирует выбранную закладку/папку, не копируя CRUD.
- useBookmarkSearchView, usePagePresentation, useScreenFocus и usePageKeyboard
  владеют UI lifecycle: поиск, background resource, media/listeners, focus
  targets и shortcuts. Их ресурсы освобождаются вместе с NewtabView.
- screenContext передаёт те же refs дочерним частям одного экрана через Vue
  provide/inject. Он создаётся на экран, не является глобальным container.
  DOM-типы focus/context находятся в screenTypes.ts, отдельно от pure entities.
- SettingsPanel использует feature useSettingsForm: buffered fields, flush,
  source selector и background file flow. WeatherSettings — отдельная секция.
  BookmarkGrid использует useBookmarkGridDrag, сохраняя image/reveal lifecycle.
- DataManagementDialog оставляет markup и exposed close, useBackupDialog
  владеет его UI flow. Scoped CSS вынесен в backup/styles/data-management.css;
  codec и операции backup остаются у прежних владельцев.
- assets/style.css — упорядоченный entry: Tailwind, themes, foundations,
  layout, surfaces, panels, controls, media и refinements. CSS разрезан по
  top-level узлам без перестановки правил. Аудит production CSS сравнивает
  глобальный каскад и содержимое каждого scoped блока отдельно: компонентная
  композиция меняет порядок независимых scoped блоков и их scope IDs.
- В appearance-проверке снимки настроек/диалога ожидают завершения enter
  transition, чтобы видимость layout box не подменяла завершённое отображение.

Сценарии фокуса, клавиатуры, modal handoff, drag, scroll и reduced motion
проверяются общими browser/UI suites; unit-тесты дополнительно фиксируют
повторное открытие settings во время flush и защиту confirmation от дублей.

## Как добавлять поведение

1. Определить feature-владельца и его чистые entities.
2. Описать нужные операции через порт в `services/interfaces.ts`, переиспользуя
   существующие контракты. Не копировать весь browser API в интерфейс.
3. Разместить сценарий в services, реализацию browser/storage/HTTP — в adapters.
   Их создание относится к фабрике/composition root, UI вызывает готовые действия.
4. Разместить unit-тест у владельца, browser/UI сценарий — в общей инфраструктуре.
   Общий сценарий должен выполняться в Chrome и Firefox с равнозначными assertions.

Реальный пример factory → service → adapter → composable приведён выше. Пустые
фабрики ради схемы не создаются.

## Проверки

```sh
npm run check
npm run build
npm run build:firefox
# Unit-тесты модуля sync:
npm test -- modules/dial/modules/bookmarks
# Один существующий browser-сценарий; предварительно собрать оба браузера:
node scripts/weather-widget.mjs --chrome-only
node scripts/weather-widget.mjs --firefox-only
```

Vitest обнаруживает tests в `tests/`, `modules/`, `shared/` и `app/`.
Корневые межмодульные тесты пока сохраняются на прежнем месте. Данные, ключи
storage/sync, схема `SpeedDialX` v3, backup JSON и browser IDs не меняются.

Полный паритет browser/UI/live-покрытия — обязательная отдельная работа по
разделу 7.4 плана. Существующий Firefox allowlist пока сохраняется; успешный
прогон его подмножества не означает устранение всех пробелов.
