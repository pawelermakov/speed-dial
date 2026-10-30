# Архитектура SpeedDial X

SpeedDial X постепенно переходит к модульной структуре по
[плану рефакторинга](REFACTORING_PLAN.md). Этот документ описывает реализованные
границы. WXT, Vue 3, TypeScript, Dexie и Tailwind сохраняются.

## Реализовано на этапах 1–2

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

## Как добавлять поведение

1. Определить feature-владельца и его чистые entities.
2. Описать нужные операции через порт в `services/interfaces.ts`, переиспользуя
   существующие контракты. Не копировать весь browser API в интерфейс.
3. Разместить сценарий в services, реализацию browser/storage/HTTP — в adapters.
   Их создание относится к фабрике/composition root, UI вызывает готовые действия.
4. Разместить unit-тест у владельца, browser/UI сценарий — в общей инфраструктуре.
   Общий сценарий должен выполняться в Chrome и Firefox с равнозначными assertions.

Конкретный пример factory → service → adapter → composable будет добавлен после
первого вертикального извлечения bookmarks. Пустые фабрики ради схемы не создаются.

## Проверки

```sh
npm run check
npm run build
npm run build:firefox
# Unit-тесты модуля sync:
npm test -- modules/dial/modules/sync
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
