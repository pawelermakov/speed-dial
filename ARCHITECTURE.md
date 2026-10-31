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
`BookmarkAssetStore` реализует AssetsPort, Repository использует этот контракт.
DataLock, UpdatesPort и SyncClient передаются через DialDependencies. Сигнатура SyncClient пока сохраняет строковый action; типизированные
сообщения и runtime validation будут мигрировать вместе на этапе 4.

## Сборка и lifecycle

- `app/createNewtabApplication.ts` собирает отдельные Repository, settings/root
  storage, соединение Dexie, browser events и BroadcastChannel для вкладки.
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

- `types/models.ts` — compatibility barrel для существующих потребителей до
  этапа 8. Новые владельцы типов не импортируют его.
- `services/bookmarks.ts` и `services/i18n.ts` временно реэкспортируют перенесённые
  контракты. `services/settings.ts` сохраняет только type exports; settings storage
  создаётся через feature adapter. `services/database.ts` реэкспортирует класс
  подключения, `services/repository.ts` — общую блокировку, без второго экземпляра очереди.
- `utils/weather.ts` временно содержит локализованные getters и forecastLink;
  данные и типы уже принадлежат weather. При смене языка подписи вычисляются заново.
- Repository остаётся совместимым фасадом до извлечения функций на этапах 3–5.
  App/SettingsPanel получают его через контекст. useDial работает с минимальным
  DialRepositoryPort, без импорта класса или создания реальной инфраструктуры.
- Текущий UI runtime переводов остаётся прежним. Переход на vue-i18n выполняется
  отдельно по разделу 7.2 плана; словари остаются в корневой папке `locales/`.

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
- Repository только делегирует bookmark-операции. Backup пока
  остаётся в фасаде; settings/appearance делегируются профильным сервисам; их методы не читают feature-таблицы напрямую, а используют порты.
- prepareRead фиксирует поколение/выбор до асинхронных операций. Repository ждёт
  settings/background/choices, затем завершает чтение bookmarks. При ошибке раннего
  чтения fallback root не сохраняется; старое чтение не меняет новый active/root.
- `composables/useBookmarkSearch.ts` принадлежит bookmarks и принимает минимальные
  BookmarkSearchPort и BookmarkSearchView. Подмодуль не зависит от родительского Snapshot.
- Тесты в `bookmarks/tests` проверяют factory → source/actions → adapters через
  MockBookmarks/fake-indexeddb, auto-name tickets, assets, folders, search и reorder.
  Межмодульные проверки согласованного snapshot/backup/reset и совместимости фасада
  остаются в корневых tests. Общий fake находится в tests/helpers с type-only contract import.

В production Repository получает уже собранный BookmarksModule пятым аргументом.
Его конструктор с четырьмя аргументами временно сохранён для legacy-потребителей:
он собирает тот же модуль, не создавая второго владельца source state. Удалить
эту совместимость вместе с фасадом на этапе 8. Старые services/bookmarks,
services/bookmarkAssets, services/autoNames, composables/useBookmarkSearch и
utils/reorder остаются только compatibility wrappers до миграции пользователей.

## Settings, appearance и sync

- settings/services/settings.ts сохраняет/patch-ит текущие настройки через порты,
  проверяет source до записи, фиксирует root последним и выполняет прежний rollback
  настроек/фона при сбое. Production root передаёт этот сервис в фасад Repository.
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
- Schema helper пока использует legacy validateSettings. Старый runtime i18n и
  этот мост нормализации остаются до отдельной миграции переводов/удаления legacy;
  они не заменены вторым переводчиком. Старые пути сохраняют compatibility exports.

Тесты theme/background/appearance и settingsSync/accountStatus перенесены к
владельцам. Новые тесты покрывают concurrent optimistic edits, flush связанных
записей, rollback/partial restore, stale background, независимые sync queues,
transport failures и malformed wire messages. Межмодульные useDial/Repository
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
  Composition root владеет loaders; Repository пока делегирует backup через
  отдельный loader до удаления compatibility facade.

Production audit подтверждает отдельные chunks codec/dialog, backup service и
capture client/workflow в обоих браузерах. В стартовом newtab chunk их нет;
в background нет UI/test modules, runtime-dom и WXT storage.

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
