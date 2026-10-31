# План рефакторинга SpeedDial X

Дата: 30 октября 2026 года. Обновлено: 31 октября 2026 года. Статус: этап 6 завершён; следующий — этап 7 (разделение экрана и стилей).
Результаты проверок и текущий прогресс: [docs/refactoring-progress.md](docs/refactoring-progress.md).

## 1. Основания и цель

План составлен по текущему коду `cabinet-nuxt3`, правилам `.cursor/rules/*.mdc`, целевому README L7, предоставленному пользователем, и текущему коду SpeedDial X.

Цель — перенять архитектурные решения cabinet: функциональные модули, явные зависимости, фабрики сборки, разделение entities / services / adapters / components / composables, локальное владение кодом и загрузку необязательных функций по требованию. Сохранить WXT, Vue 3, TypeScript, Dexie, Tailwind CSS и существующее поведение расширения.

Это постепенный рефакторинг без переписывания приложения целиком. На каждом этапе расширение должно собираться для Chrome и Firefox. Изменение форматов данных, разрешений и пользовательских сценариев не входит в задачу.

### Что изучено в cabinet

| Источник                                                                                        | Наблюдение                                                                                                               | Применение в SpeedDial                                                                 |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Целевой README L7 из сообщения пользователя                                                     | Верхний модуль владеет услугой, вложенные — её функциями; `common` содержит переиспользуемое; `index.ts` собирает сервис | Верхний `dial` и его функциональные подмодули; общие зависимости передаются при сборке |
| `modules/l7/ddos-protection/{index.ts,services,adapters/api,entities}`                          | Фабрика `New()` создаёт адаптеры и передаёт их сервису через интерфейсы                                                  | Фабрики модулей и порты для browser API, storage, сети                                 |
| `modules/cloud/hosting/index.ts`, `services/{instance,service}.ts`, `adapters/storage/index.ts` | Разделение API, состояния и операций; вложенные модули получают зависимости; есть lazy loaders                           | Отделить хранилища от сценариев; загружать тяжёлые функции по требованию               |
| `modules/cloud/hosting/modules/setup/adapters/mappers/index.ts`                                 | Преобразования вынесены из компонентов                                                                                   | DTO и форматы внешних провайдеров преобразуются на границе адаптера                    |
| `modules/cabinet/user-service/{index.ts,services,adapters}`                                     | Сервис координирует API и storage, сборка находится снаружи                                                              | UI вызывает сценарий, не собирает инфраструктурные зависимости                         |
| `modules/cabinet/auth/index.ts`                                                                 | Уже используется понятное имя `createAuthService`                                                                        | Принять `create…Module` / `create…Service` вместо неоднозначного `New`                 |
| `shared/helpers/loadLazy.ts`                                                                    | Кеширование промиса загрузки, сброс кеша при ошибке                                                                      | Lazy loader с повторной попыткой после неудачи, без общего глобального контейнера      |
| `shared/plugins/entry.ts`                                                                       | Регистрация сервисов в точке входа; одновременно встречаются разные способы регистрации и lazy API                       | Перенять точку сборки, выбрать один явный способ предоставления зависимостей           |
| `shared/services/README.md`                                                                     | Общие сервисы без модуля — крайний случай                                                                                | Не заменять нынешнюю общую папку `services` такой же свалкой в `shared`                |
| `.cursor/rules/{main,vue,composable,utils,style}.mdc`                                           | Небольшие компоненты, чистые helpers, явная логика, минимум логики в шаблонах, отсутствие HTTP в UI, композиция          | Адаптированные правила для WXT/Vue, описанные ниже                                     |

В локальном `modules/l7` архитектурного README нет. Предоставленный текст описывает целевое состояние; текущие `proxy-service`, отдельные `ddos-protection`, `tabs.ts`, `types.ts` показывают незавершённую миграцию. Не следует копировать промежуточную структуру или считать весь cabinet строгой реализацией целевой архитектуры. Например, некоторые сервисы импортируют request-типы из адаптеров, а API иногда превращает ошибку в пустой список — эти зависимости и семантику ошибок переносить не нужно.

## 2. Текущее состояние SpeedDial

### Что уже хорошо и должно сохраниться

- `Repository` принимает `BookmarksPort`, `SettingsPort`, `RootPort` и БД через конструктор; это основа для дальнейшего разделения, а не повод переписать всё.
- `SettingsSync` уже отделён от конкретных browser API через порты; `syncBackground.ts` собирает реальные зависимости.
- Есть `MockBookmarks`, `fake-indexeddb`, unit-тесты, сценарии для Chrome и Firefox, отдельные UI-проверки.
- Реализованы защиты от устаревших асинхронных результатов, гонок при сохранении, изменения закладок в другом окне и утечек object URL.
- `BookmarkAssetStore`, `BackgroundResource`, `BookmarkImages` уже выделяют отдельные ответственности.
- Источник истины для закладок — браузер; изображения остаются локальными; settings sync имеет отдельного координатора в background.

### Основные проблемы

| Область                                                                    | Фактическое состояние                                                                                                                                             | Следствие                                                                       |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `App.vue`                                                                  | 434 строки, многие сильно уплотнены; диалоги, CRUD, capture, импорт/экспорт, настройки, клавиатура, контекстные меню, фон, сеть/инфраструктура                    | Изменения разных функций затрагивают один оркестратор                           |
| `composables/useDial.ts`                                                   | Создаёт и экспортирует singleton `repository`; знает WXT storage, browser events, Dexie, sync, favicon, BroadcastChannel; optimistic settings смешаны со snapshot | Тесты требуют многочисленных глобальных mock; сложно управлять жизненным циклом |
| `services/repository.ts`                                                   | 342 строки; закладки, папки, настройки, фон, импорт/экспорт, auto-name, assets, блокировка                                                                        | Слишком много сценариев и причин для изменения                                  |
| `types/models.ts`                                                          | Закладки, Settings, backup, capture, search и defaults в одном файле; зависимости от i18n и weather utils                                                         | Типы не принадлежат своим функциям; риск циклов                                 |
| `services/searchProviders.ts`                                              | URL, HTTP, парсеры нескольких форматов, локализация и retry                                                                                                       | Добавление провайдера затрагивает общий файл                                    |
| `services/network.ts`                                                      | Это фактически почтовая интеграция с transport и парсерами                                                                                                        | Название скрывает ответственность                                               |
| `components/MailIndicator.vue`                                             | Сам вызывает `unreadProvider` и управляет запросом                                                                                                                | UI связан с сетевой реализацией                                                 |
| `utils/backgroundPreview.ts`, `backgroundResource.ts`, `bookmarkImages.ts` | Browser/DOM API, local resources, side effects                                                                                                                    | Папка utils обещает чистые функции, но содержит инфраструктуру                  |
| Структура корня                                                            | Общие `services`, `components`, `composables`, `types`, `utils`                                                                                                   | Одна функция размазана по всему проекту                                         |

Число строк — сигнал для анализа, не самостоятельная причина дробления. Короткие строки текущего кода часто содержат несколько операций; сначала важны ответственность и читаемость.

## 3. Целевая структура

Один продуктовый модуль `dial` соответствует верхнему модулю услуги в L7. Подмодули выделяются по функциям. Не создавать пустые директории ради схемы.

```text
entrypoints/
  newtab/main.ts                  # запуск UI, создание зависимостей и provide
  background.ts                   # запуск фоновой сборки
App.vue                           # тонкая оболочка NewtabView
app/
  createNewtabApplication.ts       # composition root контекста вкладки
  createBackgroundApplication.ts  # отдельный composition root background
  serviceContext.ts               # типизированные provide/inject и useServices
modules/
  dial/
    index.ts                      # фабрика, публичные типы; без экспорта всей инфраструктуры
    entities/                     # snapshot/view model приложения
    services/                     # координация запуска и согласованного refresh
    composables/                  # useDial: реактивная модель экрана
    components/                    # NewtabView, Toolbar, DialogHost
    common/                       # только переиспользуемое внутри dial
    modules/
      bookmarks/                  # источник, папки, CRUD, reorder, поиск по закладкам
      settings/                   # settings schema, defaults, optimistic saves
      appearance/                 # тема, фон, grid presentation
      search/                     # провайдеры внешнего поиска и подсказок
      capture/                    # запросы захвата, очередь, auto-name workflow
      backup/                     # parse/serialize, export/import/reset workflows
      sync/                       # settings sync coordinator, messaging, status
      mail/                       # почтовые провайдеры и счётчики
      weather/                    # конфигурация городов и ссылки на прогноз
shared/
  components/                     # ModalDialog, SwitchControl, InfoTooltip и т. п.
  helpers/                        # только чистые общие функции
  infrastructure/
    browser/                      # низкоуровневые capabilities, events, data lock
    database/                     # Dexie schema и создание соединения
  i18n/                           # vue-i18n, публичные helpers и контракты сообщений
  styles/                         # tokens, base, themes
locales/                          # ru/en/es, сохраняются текущие ключи
public/                           # в т. ч. ранний wallpaper bootstrap
```

Стандартная структура сложного подмодуля: `entities/`, `services/`, `services/interfaces.ts`, `adapters/`, `composables/`, `components/`, `helpers/`, `index.ts`. Для небольшого weather достаточно нескольких файлов; отдельный класс на каждый helper не нужен.

### Границы и направление зависимостей

1. `entities` и чистые helpers не импортируют Vue, WXT, Dexie, компоненты или конкретные адаптеры. Порты описывают потребность сервиса, а не весь browser API.
2. `services` реализуют сценарии через порты. В них нет DOM, Vue lifecycle и создания конкретной БД. Нативные `Blob`, `AbortSignal` допустимы — это расширение для браузера, дополнительная абстракция каждого Web API не нужна.
3. `adapters` реализуют storage / bookmarks / runtime messaging / HTTP / image decoding. Внешние DTO и парсеры находятся здесь; service-facing типы принадлежат entities или контрактам сервисов.
4. `composables` управляют реактивным состоянием, вызовом сервисов, loading/error и lifecycle. Не импортируют компоненты и не создают реальные адаптеры.
5. Компоненты отображают данные и вызывают действия через composables/сервисы. DOM-геометрия, focus, refs, accessibility и обработчики событий допустимы в UI-слое.
6. Межмодульные зависимости идут через публичные контракты; конкретные зависимости связываются фабрикой. Внутри модуля использовать прямые относительные импорты, не собственный barrel `index.ts`.
7. `shared` не зависит от `modules`. Общая Dexie-схема хранится в инфраструктуре; feature-адаптеры инкапсулируют доступ к своим таблицам. Не делить одну БД на несколько при этом рефакторинге.
8. Составной snapshot принадлежит `dial`; сборка использует bookmarks/settings/appearance, а сами подмодули не импортируют родительский snapshot. Это исключает цикл.

### Владение состоянием и runtime

| Состояние                                                         | Владелец                                                   |
| ----------------------------------------------------------------- | ---------------------------------------------------------- |
| Закладки и папки                                                  | Browser bookmarks API                                      |
| Persisted settings, выбранный root                                | Локальное storage; изменения через соответствующие сервисы |
| Синхронизация настроек, retry/rate limit, account epochs          | Background sync coordinator                                |
| Выбранная вкладка папки, диалоги, pending/error, optimistic patch | Экземпляр приложения новой вкладки                         |
| Изображения и auto-name metadata                                  | Существующая Dexie БД; feature storage adapters            |
| Object URLs, decode, DOM listeners                                | UI-контекст, с явным dispose                               |

Не создавать единый singleton между background и newtab: это разные JS-контексты. Каждый собирает свои зависимости; взаимодействие идёт через существующие сообщения и storage events. Все владельцы подписок имеют `dispose()`/cleanup; повторная сборка в тестах не оставляет глобального состояния.

## 4. Сборка сервисов и lazy loading

- `createNewtabApplication()` создаёт БД/адаптеры и собирает модули; `main.ts` передаёт результат через типизированный Vue `InjectionKey`.
- `useServices()` получает только готовые зависимости. `$dial`, `$backup` допустимы как локальные имена сервисов по предложению README; префикс не требует Nuxt globals или изменения всех имён.
- Для сервисов предпочтительны фабрики с явными аргументами. Классы сохранять там, где есть собственное состояние или удобный lifecycle; обёртки без ответственности не создавать.
- Bookmarks, settings и минимальный запуск appearance доступны сразу. Background sync запускается сразу в background.
- Backup UI и его тяжёлая обработка загружаются при открытии управления данными. Capture — при запросе захвата. Почтовые реализации — при включении счётчиков. Провайдеры поиска можно загружать по выбору, если анализ бандла показывает пользу.
- Для одновременно нужных модулей использовать `Promise.all`, аналогично `useLoadLazyModule`. Отдельный helper имеет смысл лишь при повторении.
- Кешировать loader внутри экземпляра приложения. Одновременные вызовы получают один промис; при ошибке кеш сбрасывается; UI показывает ошибку и позволяет повторить. Завершение после dispose не публикует состояние.
- Ранний фон из `public/wallpaper-bootstrap.js` и установка языка до mount сохраняются. Не ставить их за загрузкой дерева закладок или всех модулей.
- Проверять бандлы обоих браузеров: eager barrel exports не должны подтягивать lazy-модули. Background не должен импортировать Vue UI/DOM-зависимые модули; XML parsing почты остаётся в поддерживающем DOM контексте.

## 5. Карта переноса

| Сейчас                                                             | Целевой владелец / изменение                                                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `App.vue`                                                          | `dial/components/NewtabView.vue` и сценарные composables; App — оболочка                                       |
| `useDial.ts`                                                       | dial snapshot/lifecycle; сохранение настроек — settings; events — adapter; убрать экспорт singleton repository |
| `Repository` CRUD/folders/reorder/search                           | bookmarks services; общий read/context для root и active folder                                                |
| `Repository` settings/background                                   | settings и appearance services                                                                                 |
| `Repository` import/export/reset                                   | backup orchestration, использующая публичные bookmarks/settings/appearance/assets API                          |
| `Repository` auto-name / cache                                     | bookmarks metadata/assets services; capture получает их через порты                                            |
| `withDataLock`                                                     | `shared/infrastructure/browser/dataLock.ts`, имя блокировки и fallback сохраняются                             |
| `bookmarks.ts`, `folderLocator.ts`                                 | bookmarks contracts/entities/helpers + browser adapter; locator contract доступен sync                         |
| `database.ts`                                                      | shared database schema/factory; `db` создаётся в composition root                                              |
| `settings.ts`, `settingsSchema.ts`, `validation.ts`                | settings storage adapter/schema; URL validation — bookmarks helper; общие primitives — shared helpers          |
| `settingsSync.ts`, `syncBackground.ts`, `syncClient.ts`, `sync.ts` | sync service, background wiring и runtime client adapter; без изменения протокола                              |
| `searchProviders.ts`, `kinopoiskQuery.ts`, `kinopoiskNetwork.ts`   | search service + provider adapters/parsers + network preparation                                               |
| `network.ts`, `mail.ts`, `MailIndicator(s)`                        | mail adapters/services/composable/components                                                                   |
| `capture.ts`, `thumbnails.ts`, `autoNames.ts`                      | capture queue/background handler/client; metadata storage остаётся у bookmarks                                 |
| `bookmarkAssets.ts`, `favicons.ts`, `faviconColor.ts`              | bookmarks assets storage/network adapters; чистое вычисление цвета — helper                                    |
| `importExport.ts`, `DataManagementDialog.vue`                      | backup service/format adapters/UI; download через DOM adapter                                                  |
| `useTheme.ts`, background resource/preview                         | appearance composables + UI resource adapters                                                                  |
| `BookmarkImages`, grid/tile helpers                                | bookmarks UI resource adapter + presentation helpers                                                           |
| `useBookmarkEdges.ts`                                              | bookmarks UI helper рядом с компонентом: DOM-зависимость должна быть явной                                     |
| `types/models.ts`                                                  | Типы распределить по модулям; временный compatibility barrel, затем удалить                                    |
| Общие dialog/control компоненты                                    | shared/components; feature-компоненты остаются в своих модулях                                                 |
| `assets/style.css`, `assets/themes.css`                            | Постепенно выделить tokens/base/themes и стили функций, сохранив каскад                                        |

Backup зависит от API функций, а не наоборот. Sync зависит от settings и контракта bookmark locator. Search зависит от bookmark search port, но bookmarks не зависит от search UI. Capture использует публичный порт записи assets/auto-name; bookmarks не импортирует capture. Родительский dial связывает эти зависимости.

## 6. Порядок выполнения

### Этап 0. Зафиксировать исходное поведение

- Зафиксировать команды, версии Node/npm из package.json, ключевые сценарии и исходные результаты проверок.
- Выполнить `npm ci`, `npm test`, обе сборки; браузерные/UI проверки запускать с установленными Playwright-браузерами. Для live-проверок нужна сеть.
- Снять исходные размеры newtab/background chunks и проверить ранний фон/язык на холодном старте.
- Записать существующие ошибки отдельно; не выдавать их за регрессии миграции.

Готово, когда есть воспроизводимая исходная точка. Этот документ не утверждает, что проверки уже выполнены.

### Этап 0.1. Линтеры, форматирование и автоматические проверки

В текущем дереве не обнаружены конфигурации ESLint, Prettier, Stylelint и EditorConfig. Настроить инструменты до массового переноса файлов; не копировать конфиг Nuxt из cabinet.

- **ESLint**: flat config `eslint.config.mjs`, проверка TypeScript, Vue SFC и JavaScript/MJS в scripts, entrypoints и public. Использовать `eslint-plugin-vue`, `vue-eslint-parser` и `typescript-eslint`; точные версии и совместимость с Node, Vue и WXT проверить при реализации. Сначала базовые recommended-правила, затем осознанно включить проверки Promise/async с информацией о типах для TS-файлов, покрытых tsconfig. Для Vue сохранить корректную связку SFC parser → TypeScript parser.
- Не считать type-aware lint заменой `vue-tsc`. Проверить, какие scripts/configs входят в WXT tsconfig; файлы вне TypeScript-проекта проверять без type-aware правил либо включить в отдельную конфигурацию. Не добавлять их в production bundle ради линтера.
- Включить проверки неиспользуемого кода, некорректных Promise, мутаций props и ошибок Vue templates. Ограничение размера компонентов сначала использовать как ориентир/предупреждение; существующие нарушения устранять по этапам, без общего отключения правил.
- **Prettier**: отдельный `.prettierrc.json`, единый стиль для Vue/TS/JS/MJS/CSS/JSON/Markdown. Базовое предложение: 2 пробела, semicolons, single quotes в JS/TS, trailing commas и printWidth 100. Окончательно зафиксировать настройку до первого форматирования.
- Использовать `eslint-config-prettier`, чтобы отключить конфликтующие stylistic rules. Запускать Prettier отдельно; `eslint-plugin-prettier` не нужен. Автосортировку Tailwind-классов и импортов не включать в первый проход: она создаёт дополнительные изменения, а перестановка side-effect imports требует проверки.
- **EditorConfig**: UTF-8, LF, финальная новая строка, 2 пробела; учесть значимые завершающие пробелы Markdown. Добавить `.prettierignore` и ESLint ignores для `node_modules`, `.wxt`, `.output`, coverage, browser profiles, reports и других generated artifacts. Сгенерированные файлы не форматировать. `package-lock.json` обновлять через npm, без ручного редактирования.
- **Stylelint**: отдельный шаг для CSS после базовой настройки. Использовать конфигурацию, совместимую с Tailwind CSS 4 и его директивами; при проверке style-блоков Vue — соответствующий custom syntax. Сохранить проверки реальных ошибок, избегать глобального отключения unknown at-rules. Разрешить только используемые Tailwind-директивы. Не дублировать форматирование Prettier и не вводить SCSS ради линтера.
- **Границы импортов**: после появления целевых модулей добавить ограничения средствами ESLint (`no-restricted-imports` и overrides), а при необходимости специализированный plugin. Проверять зависимости entities/services/shared/background и запрет импорта внутренних файлов соседних модулей. Сначала убедиться, что проверки работают с фактическими путями и разрешёнными type-only контрактами.
- **Pre-commit**: добавить Husky + lint-staged, проверяющие только staged files: ESLint fix для поддерживаемых JS/TS/Vue, Prettier write для поддерживаемых текстовых файлов. Stylelint подключить для CSS после настройки. Не запускать полные browser suites в hook; hook должен работать быстро, а CI выполнять проверки независимо от локальных hooks.
- **CI**: установить зависимости через `npm ci`, подготовить WXT/types, выполнить format check, lint, typecheck/unit и сборки Chrome/Firefox. Browser/UI suites вынести в отдельные jobs с установленными браузерами. Live search не делать обязательной проверкой каждого PR из-за зависимости от внешних сервисов. Конкретную CI-платформу выбрать по инфраструктуре репозитория.

Предлагаемые команды package.json (добавить при реализации):

```text
lint             eslint .
lint:fix         eslint . --fix
format           prettier . --write
format:check     prettier . --check
lint:styles      stylelint <согласованные CSS/Vue globs>
lint:styles:fix  stylelint <согласованные CSS/Vue globs> --fix
check            format:check + lint + lint:styles + существующий npm test
```

`check` должен последовательно вызывать npm scripts и завершаться при первой ошибке; `npm test` уже включает typecheck. Stylelint включать в `check` после завершения его настройки, без временных пустых команд.

Порядок внедрения: отдельное изменение с конфигурациями и scripts → отдельное механическое форматирование существующего кода → устранение диагностик небольшими изменениями → обязательные проверки CI. Форматирование завершить до функциональных переносов, чтобы дальнейшие diff оставались читаемыми. Не использовать автоматический fix как основание менять поведение; проверять diff, особенно templates, CSS и side-effect imports.

Готово: вся база проходит format check и согласованный lint без массовых suppressions; обе сборки и unit-тесты подтверждают отсутствие регрессий после форматирования; Editor/CI используют одну конфигурацию. Структурные правила усиливаются по мере миграции, а не блокируют ещё не перенесённые участки.

### Этап 1. Правила и модульные контракты

- Добавить краткий архитектурный README и адаптированные правила Cursor для SpeedDial.
- Разнести domain-типы/defaults по владельцам, убрать зависимости типов от feature utils и реактивной локализации.
- Сначала сохранить совместимые реэкспорты из `types/models.ts`; менять импорты по мере миграции.
- Описать минимальные порты Bookmarks, Settings, Assets, DataLock, SyncClient, Updates; переиспользовать существующие интерфейсы.

Готово: compile и unit проходят; форматы данных и runtime-поведение не изменились.

### Этап 2. Composition roots и инфраструктура

- Вынести создание `db`, root/settings storage, Repository и событий из `useDial` в `createNewtabApplication`.
- Ввести типизированный provide/inject; передавать зависимости в composables явно или через один `useServices` на UI-границе.
- Собрать background отдельно; сохранить проверки sender, URL новой вкладки и runtime id.
- Вынести data lock и BroadcastChannel adapter, сохранив имена, события и семантику invalidation.
- Пока оставить Repository совместимым фасадом.

Готово: useDial не создаёт реальные зависимости; тесты могут передавать fake-порты; подписки корректно снимаются. Холодный запуск, смена root и несколько вкладок работают как прежде.

### Этап 3. Извлечь bookmarks из Repository

- Перенести чтение дерева/выбор root/CRUD/папки/reorder/local search в bookmarks.
- Выделить assets и auto-name metadata adapters, оставить прежнюю Dexie-схему.
- Сохранить один источник root/active selection, read generation и проверку ожидаемых значений перед записью.
- Repository временно делегирует новым сервисам; переносить его тесты вместе со сценариями.

Готово: проходят repository/bookmarks/reorder/search/assets/names тесты и браузерные сценарии папок/drag/dialogs для поддерживаемых платформ.

### Этап 4. Settings, appearance и sync

- Извлечь optimistic field patches, confirmed/pending state, версии сохранений и flush в settings composable/service.
- Перенести сохранение и отображение фона в appearance; выделить theme и object URL lifecycle.
- Перенести SettingsSync почти без изменения алгоритма; инфраструктуру оставить в адаптерах.
- Зафиксировать типизированный union сообщений; runtime validation сохраняется независимо от TypeScript.
- Разделить UI-статус и persistent settings; не дублировать ответственность sync в newtab.

Готово: settingsSync/useDial/theme/backgroundResource тесты, settings-autosave/settings-sync/wallpaper-startup/theme-startup сценарии подтверждают сохранение поведения. Не теряются несвязанные поля при записи из нескольких вкладок.

### Этап 5. Backup и capture

- Перенести backup parse/serialize/limits и import/export/reset orchestration; download отделить от данных.
- Импорт выполняется через публичные операции функций с прежними expected-state проверками, lock и частичным отчётом.
- Вынести capture client/handler/queue; сохранить отмену при disconnect и защиту от устаревшего результата.
- Включить lazy loading управления данными и capture там, где он не задерживает критический старт.

Готово: backup/capture/images/names тесты и data-management/bookmark-dialogs сценарии проходят; нет изменения backup JSON и потери данных при частичном сбое.

### Этап 6. Search, mail, weather

- Выделить адаптеры провайдеров поиска, DTO/parsers и service-facing результаты; UI получает готовые подсказки.
- Сохранить abort, debounce, ограничения размера/времени, retry Кинопоиска и отсечение устаревших ответов.
- MailIndicator использует useMailCounter, тот вызывает mail service; HTTP и особенности провайдеров остаются в адаптерах.
- Weather оставить небольшим модулем конфигурации/ссылок; не добавлять сетевой сервис, которого сейчас нет.

Готово: fixtures и unit-тесты парсеров проходят; поиск, почта, погода проверены браузерными сценариями. Live search запускать отдельно при наличии сети, не заменять им детерминированные тесты.

### Этап 7. Разделить экран и стили

- Выделить useBookmarkActions, useFolderActions, useBackupFlow, useSettingsPanel и useConfirmation по реальной ответственности.
- Собрать NewtabView из toolbar, bookmarks area и dialog host; не создавать второй монолит composable со всем содержимым App.
- Сохранить props/emits, фокус после диалогов, клавиатуру, контекстные меню, scroll, reduced motion и порядок появления плиток.
- Разбирать уплотнённый код при переносе; форматирование выполнять отдельными небольшими изменениями.
- Стили переносить отдельно от бизнес-логики; сохранять tokens, темы и порядок каскада.

Готово: App/NewtabView читаемы и содержат преимущественно композицию; компоненты ориентировочно до 300 строк без искусственного сжатия; UI suite подтверждает внешний вид и доступность.

### Этап 8. Удалить переходный слой

- Удалить Repository-фасад, старые пути, общий models barrel и неиспользуемые реэкспорты.
- Добавить проверку импортов: нет infrastructure в entities/services, feature internals в соседних модулях, modules в shared, UI в background.
- Обновить README, карту модулей и правила добавления новой функции.
- Выполнить финальные unit, compile, обе сборки, browser/UI suites. Сравнить chunks и холодный старт с этапом 0.

Готово: нет совместимых обёрток без пользователей, циклических зависимостей и нарушений границ; сохранены данные, UI и работа обоих браузеров.

## 7. Инварианты, которые нельзя потерять

- Настоящие browser bookmark IDs и protected/standard folders, separators Firefox, порядок смешанных детей, разница индексов перемещения Chrome/Firefox.
- Root folder fallback и portable locator: одноимённая локальная папка другого устройства не выбирается по случайному совпадению.
- Lock `speed-dial-data`, очереди, expected-state проверки и защита от ответов старого поколения. Не добавлять повторное захватывание того же lock внутри уже заблокированного сценария.
- `busy`, optimistic pending fields, flush, отмена и latest-write semantics остаются согласованными после разделения сервисов.
- Asset key `[bookmarkId+url]`, схема `SpeedDialX` версии 3, storage keys, sync keys и backup format сохраняются. Любая будущая смена требует отдельной миграции.
- Частичный импорт не объявляется атомарным: browser bookmarks и Dexie/storage не имеют общей транзакции. Сохранять отчёт, warnings и существующий rollback там, где он есть.
- Auto-name ticket не перезаписывает вручную изменённые название/URL.
- Asset-only refresh не инвалидирует drag; structural update инвалидирует. Snapshot публикуется согласованно.
- Создание/revoke object URL, decode и освобождение ресурсов не вызывают мерцание фона или повторный decode неизменённых плиток.
- Cold MV3 worker корректно восстанавливает sync; background не рассчитывает на долгоживущую память или DOM.
- Все три локали сохраняют одинаковый набор ключей; язык устанавливается до mount. Миграция plural-ключей выполняется согласованно по разделу 7.2.
- Permissions, credentials, ограничения входящих сообщений, лимиты backup/изображений/ответов и отмена запросов сохраняются.

## 7.1. Уточнения после повторной сверки кода

### Настройки и sync: направление зависимостей без цикла

Сейчас `services/settings.ts` не просто пишет `local:settings`: после записи вычисляет patch и вызывает `syncRequest('patch')`. Вызов намеренно не ожидается под `speed-dial-data`, потому что обработка sync использует тот же lock. При извлечении модулей легко получить цикл settings → sync → settings или deadlock.

Целевая схема: settings service сохраняет локальный envelope и сообщает об успешном пользовательском изменении через переданный порт `SettingsChangeSink`; реализация порта в composition root вызывает sync client. Settings не импортирует sync module. Background coordinator применяет remote patch через низкоуровневый local storage adapter, без повторного уведомления о пользовательском изменении. Сохранить семантику `replace`, patch только изменённых полей и отсутствие echo remote-изменений.

Ожидать отправки runtime message можно только после выхода из data lock. `flushSettings()` сохраняет текущую семантику: ожидает локальные сохранения/отправку запросов, но не гарантирует завершения browser cloud sync. Текущий background handler для `flush` запускает flush координатора без ожидания фактической облачной записи. Не менять эту гарантию молча и не показывать пользователю ложное подтверждение облачного сохранения.

Проверка: локальный save и одновременное remote apply завершаются без deadlock; remote apply не создаёт новый outgoing patch; закрытие settings не теряет локальные изменения и не ждёт rate limit облачного storage.

### Локализация и сериализуемые сообщения

`services/i18n.ts` сейчас объединяет типы языка, словари, `message/joinMessages`, ошибки, реактивный `language`, DOM и localStorage. Простого перемещения файла в shared недостаточно: services, импортирующие `message`, продолжат транзитивно импортировать Vue.

Разделить чистые contracts/message builders и UI runtime перевода. `MessageText`/message DTO должны оставаться plain serializable objects без ref, getter и экземпляра Error на границе runtime/storage. Текущие getters в sync state и настройках формируют сообщения динамически; при передаче через browser messaging/storage создавать явный plain snapshot, сохраняя обновление перевода при смене языка. Чистый error contract не должен обращаться к DOM или реактивному глобальному состоянию; форматирование для показа выполняется на UI-границе. Не терять существующие ключи и параметры сообщений.

`Language`, `WeatherCityId`, `WeatherProvider` и настройки провайдеров — контракты/конфигурация соответствующих модулей, а не типы из UI helpers. Defaults настроек могут ссылаться на эти чистые контракты без импорта компонентов, Vue runtime и browser adapters.

### Shared БД и принадлежность типов

При переносе `DialDatabase` в shared нельзя оставить импорт `BookmarkAssets` из feature entities: это нарушит правило shared → modules. Описать persistence record таблицы в shared database schema; bookmarks adapter преобразует его в feature-facing данные. Для Blob-полей преобразование может быть структурным, без лишнего копирования. Альтернатива — внедрение таблиц через порт при feature-owned schema, но для текущего небольшого проекта достаточно общей схемы с инфраструктурными record-типами.

Не создавать вторую копию БД ради изоляции модулей и не менять версию 3 без реальной миграции. Backup version 3 — отдельный контракт, совпадение номера с Dexie version не связывает их жизненные циклы.

### Background lifecycle и lazy loading

Сохранять регистрацию `runtime.onConnect`, `runtime.onMessage`, bookmark/storage listeners при выполнении background entrypoint; не откладывать её до первого открытия UI или завершения асинхронной фабрики. Lazy loading допустим внутри уже зарегистрированного handler: он принимает сообщение, удерживает необходимый ответ/port и загружает обработчик. Очередь capture едина для background-контекста, а не создаётся на каждый port.

Для захвата сохраняются порядок запросов, sender/URL checks, requestId, таймаут клиента 45 секунд с учётом времени в очереди и отмена при disconnect. Если порт закрыт во время dynamic import, запрос не должен впоследствии начать capture. После перезапуска background состояние восстанавливается из persistent storage там, где это уже предусмотрено; кеш lazy loader не считается persistent state.

Не переносить Proxy-механику `shared/helpers/createLazy.ts` из cabinet: она совмещает вызов функции и доступ к объекту, до загрузки возвращает undefined, а ошибочный promise не сбрасывается так же явно, как в `loadLazyService`. Для SpeedDial принять один контракт `() => Promise<Service>` и явный await. Типы и InjectionKey держать отдельно от runtime barrels, чтобы type-only использование не загружало UI.

### UI-тесты, стили и миграционные изменения

Браузерные scripts активно используют CSS-классы, структуру DOM, storage keys и даже прямое чтение IndexedDB. Сохранить существующие selectors при извлечении компонентов. Если структура действительно меняется, обновлять сценарий вместе с изменением, сохраняя исходную пользовательскую проверку; не ослаблять assertions ради прохождения suite. Переход на role/label selectors проводить отдельно там, где это улучшает устойчивость.

Prettier может изменить пробелы в Vue templates и видимый inline-текст. После массового форматирования проверить отображение и browser/UI suites, а не только compile. При переносе CSS проверить файлы с Tailwind-директивами и обнаружение классов в новых путях модулей по фактическому CSS production-сборок обоих браузеров. Ранний `wallpaper-bootstrap.js` остаётся classic render-blocking script по стабильному public URL; localStorage mirrors темы/языка/preview не заменяют авторитетное extension storage/IndexedDB.

При включении `no-floating-promises` и подобных правил учесть осознанные best-effort операции. `void` обозначает отсутствие ожидания, но само по себе не обрабатывает rejection: сохранить/добавить осмысленный catch или контракт, гарантированно преобразующий сбой в статус. Не превращать все фоновые задачи в awaited-вызовы: это может вернуть deadlock, задержать старт или закрытие панели.

### Конкретная очередность первых изменений

1. Исходные проверки и фиксация текущих форматов/ключей.
2. Конфиги инструментов и отдельное форматирование с проверкой поведения.
3. Чистые контракты сообщений/типов и минимальные порты.
4. Composition roots при сохранении Repository как фасада.
5. Извлечение одного вертикального сценария bookmarks: UI → composable → service → adapter → mock-тест. По нему зафиксировать короткий пример структуры модуля в архитектурном README.
6. Миграция Vue I18n по разделу 7.2 отдельным изменением до массового извлечения feature-компонентов.
7. Остальные функции по этапам плана, без обязательного выделения folders в соседний модуль.

Пример модуля и таблица публичных зависимостей должны находиться в speed-dial; для дальнейшей реализации обращаться к коду cabinet не требуется. Главный критерий структуры — понятный владелец поведения и отсутствие циклов, а не одинаковое количество папок или классов в каждом модуле.

## 7.2. Переводы как в ЛК, словари в locales

Требование пользователя: перенять подход к переводам из ЛК, сохранив словари SpeedDial в корневой папке `locales`. Это заменяет идею сохранения собственного движка перевода `services/i18n.ts`: целевой runtime — **vue-i18n**.

Основание: `cabinet/shared/i18n.ts` создаёт `createI18n` с `legacy: false`, `globalInjection: true` и экспортирует `$t`, `$d`; `shared/plugins/i18n.ts` устанавливает его в Vue; компоненты используют `$t` в template и `useI18n()` в script; module-local `translates` возвращают переведённые подписи enum/справочников. В ЛК словари загружаются через store/HTTP; в расширении они поставляются локально, без backend и Pinia.

Целевая организация:

```text
locales/
  ru.json
  en.json
  es.json
shared/i18n/
  index.ts           # публичные UI helpers, $t/$d при необходимости
  createI18n.ts      # фабрика экземпляра vue-i18n
  contracts.ts       # Language, MessageKey, сериализуемый MessageText
  messages.ts        # чистые message/joinMessages, без Vue/DOM
  formatMessage.ts  # преобразование DTO сообщения через translator
modules/dial/modules/<feature>/
  translates/        # только если нужны get…Translates для enum/справочников
```

- Добавить `vue-i18n`; совместимую версию выбрать при реализации. Установить экземпляр через `app.use(i18n)` в newtab entrypoint до mount. Использовать Composition API (`legacy: false`); настройку глобальных template helpers сделать как в ЛК.
- Источник словарей — только `locales/ru.json`, `en.json`, `es.json`. Их ключи отражают функции (`bookmarks.*`, `settings.*`, `search.*`, `common.*`), не пути компонентов. Не раскладывать копии JSON в modules и не делать отдельный i18n instance на функцию.
- Сохранить persisted language IDs `ru/en/es` и текущий default `ru`. Не копировать `en-US/ru-RU` и английский fallback ЛК: это изменит поведение существующих настроек. Fallback выбрать явно с сохранением нынешнего поведения (русский), учесть испанские plurals и форматирование дат.
- В template использовать `$t(...)`; в script setup — `const { t: $t, d: $d } = useI18n()`. В обычных UI TS helpers допустим экспорт `$t/$d`, как в ЛК, но он привязан к экземпляру UI-контекста; domain contracts и background не импортируют этот entrypoint.
- В production UI один экземпляр на приложение newtab. Фабрика позволяет создавать независимые экземпляры в тестах, не загрязняя глобальный locale. Не копировать singleton из ЛК в качестве общей зависимости между background и вкладками.
- Справочники переводов реализовать как `get…Translates()` и вычислять внутри computed/при обращении; не переводить labels один раз при import. Открытые диалоги, списки, ошибки и подсказки обновляются при смене языка без перезагрузки.
- Persisted Settings.language остаётся источником истины. Сохранение/remote update меняет locale Vue I18n, `document.documentElement.lang` и существующий startup mirror. До mount дождаться установки языка и доступности его словаря; первые три небольших словаря можно импортировать сразу, не вводить lazy locale loading без измеримой необходимости.
- Сохранить чистые сериализуемые message DTO для фоновых сообщений, ошибок и sync status. Background формирует ключ/параметры, UI переводит их через vue-i18n. Это транспортный контракт, а не второй движок переводов. Фоновым сценариям не нужны Vue plugin, DOM или готовые локализованные строки в storage.
- Заменить собственные `t`, plural selection и interpolation на Vue I18n. При миграции проверить текущие `.one/.few/.many/.other` и отдельные zero-формы: они не становятся plurals Vue I18n автоматически. Явно преобразовать plural-записи в выбранный формат Vue I18n и обновить вызовы, сохраняя видимые тексты для 0/1/2/5/11/21/22/25 и испанского/английского. Для plural-ключей допускается согласованная смена внутренних ключей с одновременным обновлением всех ссылок/локалей; persisted keys настроек не меняются.
- Проверить интерполяцию и специальные символы `@`, `{}`, `|`, literal email/URL по синтаксису выбранной версии Vue I18n. Не копировать из store ЛК замену только первого `@` или отключение warnings как способ скрыть ошибки словарей. Сначала проверка/исправление формата, затем запуск runtime.
- Сохранить TypeScript/CI-проверку равенства ключей всех трёх локалей и типизацию ключей/параметров там, где возможно. При сохранении плоских dotted keys явно настроить или преобразовать их для Vue I18n; проверить реальные lookup, а не только compile. Не менять структуру всех JSON одновременно с переносом feature-кода.
- `wxt.config.ts` по-прежнему генерирует browser `_locales/*/messages.json` из корневых словарей для manifest description. Это отдельный механизм WebExtension i18n: сохранить сборку Chrome/Firefox и `extension.description`; не подменять его Vue runtime.

Выделить миграцию i18n в отдельное изменение после чистых contracts/composition root и до массового извлечения feature-компонентов. Временный compatibility adapter прежних `t/formatMessage` допустим, если делегирует Vue I18n; удалить его после обновления вызовов. Итог: один механизм UI-перевода, подход использования как в ЛК, словари только в `locales`.

Критерии готовности: i18n unit/browser tests, равенство ключей, plurals/параметры/literals, смена языка в открытом UI и remote settings, холодный старт без мигания другого языка, перевод background DTO, обе production-сборки и manifest messages. Проверить CSP production-расширения и способ компиляции сообщений выбранной сборки Vue I18n: не добавлять unsafe-eval или ослаблять manifest ради переводов.

## 7.3. Дополнительные правила реализации

### Объём изменений и контроль поведения

Рефакторинг сохраняет пользовательские сценарии и внешний вид. Единственные заранее согласованные технологические изменения — инструменты качества кода и переход на vue-i18n по разделу 7.2. Новые функции, редизайн, смена browser permissions, форматов хранения и алгоритмов синхронизации требуют отдельного обоснования и задачи.

Найденный баг записывать с воспроизведением и исходным результатом. Исправление отделять от механического переноса; если без исправления извлечение невозможно, явно описать изменение поведения и проверить его отдельным сценарием. Не считать автоматическое исправление линтера доказательством безопасности изменения.

### Единый контракт ошибок и уведомлений

- На границе адаптера проверять внешние данные и преобразовывать инфраструктурные ошибки в понятные категории: validation, conflict, unavailable, timeout, storage/network failure. Сохранять диагностическую причину локально там, где это полезно; не включать сырые внешние ответы и личные данные в пользовательские сообщения.
- Для обычных операций использовать один подход: успешный типизированный результат или исключение с кодом и сериализуемым message DTO. Не смешивать в аналогичных методах `false`, `null`, строку ошибки и rejected promise. Существующий частичный ImportReport остаётся явным специальным контрактом, а не исключением, которое скрывает уже записанные данные.
- Отмена и устаревший результат — отдельные исходы, не пользовательская ошибка сети. Пустой результат поиска — успешный пустой список; сбой поиска — error state. Ошибка favicon/cache не должна делать успешно сохранённую закладку неуспешной.
- Сервис не показывает toast и не управляет диалогом. Composable переводит результат в pending/error/success; компонент показывает его в согласованном месте: поле, диалог, статус функции или общий notice.
- Ошибка отображается один раз: нижний слой не показывает уведомление, если её уже обрабатывает вызывающий сценарий. Предсказуемые ошибки не должны одновременно попадать в несколько UI-каналов.
- При повторной попытке очищать ошибку соответствующей операции, не ошибки других полей. При смене контекста не показывать старую ошибку у новой папки/закладки.
- Повторять автоматически только безопасные чтения и уже предусмотренные retry. CRUD, импорт и перемещение не повторять вслепую: после сбоя операция могла частично завершиться; сначала перечитать состояние.

Контракт ошибки не должен зависеть от Vue I18n runtime. Проверки: конфликт из другой вкладки, offline/timeout, отказ storage, отмена, partial import и best-effort assets дают различимые состояния без дублирующих уведомлений.

### Отмена и завершение операций

| Сценарий                                | Требуемое поведение                                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Изменение поискового запроса/провайдера | Abort предыдущего запроса и generation check перед публикацией ответа                                           |
| Смена папки/root                        | Устаревший read не заменяет новую selection; drag/dialog state обрабатывается как в текущем UI                  |
| Закрытие диалога с чтением/preview      | Освободить временные ресурсы, запретить позднюю публикацию в закрытый или повторно открытый диалог              |
| Закрытие диалога во время записи        | Сохранить существующие busy/close guards; не обещать отмену уже выполненной browser/storage записи              |
| Закрытие новой вкладки                  | Удалить subscriptions, timers, object URLs; capture port disconnect отменяет queued/active capture              |
| Закрытие settings                       | Дождаться предусмотренных локальных сохранений и flush; облачная синхронизация остаётся обязанностью background |
| Dispose во время lazy import            | После завершения import не подключать новые listeners и не публиковать UI state                                 |

AbortSignal останавливает только поддерживающие его операции. Для browser bookmarks/storage без физической отмены нужны generation checks и повторное чтение; игнорирование устаревшего ответа не означает откат уже совершённой записи. Не добавлять мнимую атомарность или универсальный rollback для всех операций.

### Общие UI-компоненты и доступность

Начать с существующих ModalDialog, ConfirmDialog, SwitchControl, PanelHeader, InfoTooltip и других действительно общих primitives. Общая кнопка/поле вводятся при повторяющемся поведении или оформлении, а не для обёртки каждого HTML-тега. Feature-specific контент, settings autosave, bookmark validation и обращения к сервисам остаются в соответствующих модулях.

Для каждого общего control определить props/emits, disabled/pending/error, keyboard behavior и необходимые slots. Сохранять native semantics, labels, aria associations, focus trap/return focus, Escape и запрет случайного повторного submit. Перевод текста обычно передаётся снаружи; общий компонент не знает ключи конкретной функции. Не вводить event bus для связи диалогов и сервисов.

Токены цветов, spacing, typography и motion остаются единым источником оформления. Обязательны текущие темы, узкий экран, forced colors, reduced motion и reduced transparency. Общий компонент не должен менять дизайн существующих элементов только ради унификации реализации.

### Проверка обновления поверх существующей установки

Чистая установка не покрывает обновление. Подготовить воспроизводимый профиль/набор данных исходной версии отдельно от реального пользовательского профиля: закладки и вложенные папки, выбранный root, все настройки, изображения, auto-name metadata и фон. Проверить в Chrome и Firefox обновление той же установленной копии расширения на сборку после рефакторинга.

- Сохранить extension identity: manifest key Chrome и gecko id Firefox. Переустановка с новым ID создаёт другой storage и не считается проверкой обновления.
- Не сбрасывать local/sync storage, IndexedDB или startup mirrors для прохождения теста. Сверить browser IDs, порядок и количество закладок, root, settings, assets и отображение после обновления.
- Проверить settings sync при первом запуске новой сборки, повторном открытии newtab и перезапуске background; не допустить загрузки defaults поверх существующих значений или повторной отправки remote patch.
- Открыть backup версии 3, созданный исходной сборкой, в новой; backup новой сборки должен сохранять прежний формат и правила выборочного экспорта.
- Проверить корректную обработку уже поддерживаемых неполных/устаревших settings и недоступных assets. Не расширять молча принятие повреждённых import-файлов ради совместимости.
- Для воспроизведения не хранить в репозитории реальные cookies, профили, персональные закладки и бинарные дампы пользователя; использовать синтетические fixtures.

Готово: обновление сохраняет данные без ручного сброса и повторного выбора папки. Если в реализации всё-таки потребуется schema migration, вынести её отдельно, описать old/new версии и проверить её до продолжения остальных этапов. Плановый рефакторинг такой миграции не требует.

### Архитектурная документация в самом SpeedDial

Добавить `ARCHITECTURE.md` в корень и короткие README сложных модулей только там, где они добавляют полезные сведения. Документировать целевую и фактически реализованную структуру раздельно на время миграции.

Минимальное содержимое:

- дерево модулей и таблица владельцев состояния;
- разрешённые направления импортов, runtime-граница newtab/background;
- короткий пример реального извлечённого модуля с factory, service port, adapter, composable и тестом;
- порядок добавления новой функции, настройки, search/mail провайдера и перевода;
- жизненный цикл подписок, правила ошибок/отмены и lazy loading;
- стабильные storage/database/message/backup contracts и команды проверок;
- назначение временных compatibility exports и критерии их удаления.

Фиксировать короткими decision notes только неочевидные решения: почему settings не ждёт sync под lock, почему сообщения сериализуемы, почему background handlers регистрируются сразу. Не создавать обязательный ADR на каждую папку. После завершения миграции удалить устаревшие схемы и переходные инструкции. Для повседневной разработки документации SpeedDial должно быть достаточно без доступа к ЛК.

## 7.4. Организация тестов по модулям

Тестовую архитектуру определяем для SpeedDial самостоятельно: наличие тестов в ЛК не является условием переноса его модульного подхода. Основное правило — тест принадлежит владельцу проверяемого поведения и находится рядом с ним.

### Структура

```text
modules/dial/
  tests/                          # координация приложения, snapshot, lifecycle
  modules/
    bookmarks/
      services/
      adapters/
      components/
      tests/
        services/                 # CRUD, folders, reorder, local search
        adapters/                 # assets/metadata persistence contracts
        fixtures/                 # только данные тестов bookmarks
        helpers/                  # MockBookmarks и локальные builders
    settings/
      tests/                      # schema, defaults, optimistic save/flush
    sync/
      tests/                      # coordinator, remote/local, epochs, rate limit
    search/
      tests/
        fixtures/                 # ответы конкретных search providers
    backup/
      tests/                      # format, partial import/export, selection
    capture/
      tests/                      # queue, disconnect, stale result
shared/
  i18n/tests/                     # ключи, plurals, formatMessage
  infrastructure/database/tests/ # только общие свойства БД, если нужны
  helpers/tests/                  # тесты чистых общих функций
  components/tests/              # общие controls, когда есть поведение
app/tests/                        # composition roots, runtime wiring
tests/                            # корневая тестовая инфраструктура
  setup.ts                        # общий минимальный setup Vitest
  helpers/                        # только используемое несколькими модулями
  fixtures/                       # общие синтетические данные установки/обновления
  integration/                    # взаимодействие нескольких модулей
  browser/
    bookmarks/                    # browser-сценарии по функции
    settings/
    search/
    backup/
    appearance/
    extension/                    # startup, background restart, update/parity
    helpers/                      # запуск Chrome/Firefox и управление профилями
  ui/                             # визуальные/доступностные сценарии
scripts/
  test.mjs                        # запуск suites, без хранения всей тестовой логики
```

Подпапки `services/adapters/components` внутри feature tests нужны только при достаточном количестве файлов. Для небольшого weather достаточно `weather/tests/weather.test.ts`. Не создавать пустые тестовые каталоги и не делать отдельный модуль folders ради тестов.

### Выбор места и уровня проверки

- Unit и интеграционные проверки адаптеров одного модуля лежат в его `tests/`. Использование fake-indexeddb само по себе не делает тест межмодульным.
- Composable-тесты принадлежат модулю состояния/поведения; root composition tests проверяют сборку, а не повторяют все сценарии сервисов.
- Корневые integration tests нужны для настоящих границ: settings → sync change sink, backup → bookmarks/settings/assets, capture → assets/auto-name. Через публичные контракты проверять согласованное поведение без знания всех приватных методов.
- Browser/UI сценарии, даже названные по функции, остаются в корневой тестовой инфраструктуре: они проверяют собранное расширение, browser APIs, DOM, permissions и взаимодействие контекстов. Группировка по feature делает владельца понятным. Пример: CRUD unit — `bookmarks/tests`, сценарий добавления закладки в реальном Chrome/Firefox — `tests/browser/bookmarks`.
- Общие UI-компоненты получают собственные тесты, если есть значимая клавиатурная логика, focus, события или guards. Не писать тесты на статичный wrapper только ради покрытия.
- MockBookmarks первоначально принадлежит bookmarks. Если нужен другим модулям, выделить минимальный переиспользуемый fake в `tests/helpers` с type-only зависимостями от публичного контракта. Production-код никогда не импортирует tests, fixtures или mocks. Не экспортировать их через production index.ts.
- Provider fixtures живут у search/mail; backup fixtures — у backup; универсальные fixtures и helpers не должны превращаться в ещё одну общую свалку.

### Перенос текущих тестов и настройка runner

1. Сохранить текущие tests/scripts как исходную базу. При извлечении функции переносить её существующие тесты и fixtures вместе с кодом, обновляя imports, mocks и fixture paths. Не переписывать сразу рабочие тесты под другой runner.
2. Обновить `vitest.config.ts`: текущий include `tests/**/*.test.ts` не обнаружит модульные тесты. Добавить явные patterns для `modules/**/*.test.ts`, `shared/**/*.test.ts`, `app/**/*.test.ts` и корневых unit/integration tests. Исключить browser/UI scripts и generated artifacts. Проверить список реально обнаруженных тестов до и после переноса, чтобы suite не стал случайно пустым.
3. Оставить Node environment основным для сервисов/парсеров/fake-indexeddb. DOM environment или component test dependencies добавлять адресно при необходимости; не переводить весь suite в browser-like environment. Сложные реальные DOM/browser API уже проверяются extension-сценариями.
4. `tests/setup.ts` сделать минимальным: сейчас он глобально задаёт navigator и русский язык. После миграции i18n создавать изолированные экземпляры и явно задавать язык в нужных тестах. Убирать subscriptions, timers, DB connections, globals и spies после каждого теста. Не допускать зависимости от порядка запуска.
5. `.mjs` browser-сценарии переносить из scripts в tests/browser или tests/ui отдельным механическим изменением. Одновременно обновить пути в scripts/test.mjs, imports helpers, package.json и README. Команды `npm test`, `test:browser`, `test:ui`, `test:live` сохраняют назначение. Это организационный перенос, не обязательная перепись на Playwright Test runner.
6. Общие сценарии, запускаемые и browser, и UI suites, хранить в одном месте и включать в обе группы по явному списку; не копировать файлы. Live-проверки внешних провайдеров отделить от детерминированных fixtures.
7. ESLint/Prettier и TypeScript-конфигурация должны учитывать новые test paths. Настроить test-specific globals/overrides, не отключая проверки production-кода. Проверить, что fixtures и test-only зависимости не попали в production chunks.

### Обязательный паритет Chrome и Firefox

Требование пользователя: при рефакторинге тестов устранить все пробелы между
Chrome и Firefox. Итоговые browser/UI suites проверяют один и тот же набор
пользовательских сценариев и существенных утверждений в обоих браузерах.
Совпадение количества файлов или названий сценариев само по себе не доказывает паритет.

1. До переноса browser/UI scripts составить матрицу «сценарий / проверяемое
   поведение / Chrome / Firefox» по фактическому коду тестов. Проверить не только
   списки runner, но и ветки по браузеру, ранние return, skip, пустые реализации,
   fixtures и различия в assertions. Отдельно учитывать browser, UI и live suites.
2. Закрыть уже известные пробелы: реализовать для Firefox `theme-startup`
   (тема до mount, отсутствие вспышки неверной темы) и `bookmark-drag`
   (полный набор проверок перетаскивания, включая отмену и внешние изменения).
   Частичные проверки сортировки в других сценариях не заменяют этот набор.
   Проверить все остальные UI-сценарии: текущий Firefox allowlist пропускает
   значительно больше UI-проверок, чем эти два browser-сценария.
3. Общие сценарии и assertions хранить в одном месте. Отличия запуска, управления
   браузером и доступа к extension API скрыть в тестовых adapters/helpers.
   Не копировать две независимо развивающиеся версии одного сценария и не
   ослаблять Chrome-проверки ради совпадения с текущим покрытием Firefox.
4. Где browser API различаются, проверить соответствующее поведение каждой
   платформы с одинаковой полнотой: native IDs, protected folders, separators,
   индексы перемещения, capture, sync, ошибки, отмена, focus и cleanup.
   Зафиксировать ожидаемое различие в матрице; оно требует отдельной проверки,
   а не молчаливого исключения сценария или успешного no-op.
5. Удалить выборочное исключение Firefox-сценариев через `firefoxScenarios`.
   Runner должен получать общий реестр сценариев для каждой suite; browser flag
   выбирает реализацию драйвера. `--list` показывает одинаковые scenario IDs для
   обеих платформ. Отсутствующая реализация, неполный запуск и необоснованный
   skip завершают обязательную проверку ошибкой. Добавить проверку реестра и
   отчётов выполнения в CI, чтобы новые сценарии не создавали разрыв снова.
6. Выполнять полные детерминированные browser/UI suites в CI для Chrome и Firefox
   и сохранять результаты по scenario ID и платформе. Сверять фактическое
   выполнение и assertions с матрицей, а не только успешные exit codes.
   Локальная блокировка браузера окружением означает непроверенный результат;
   повторять прогон в подходящем окружении, сохраняя браузерную защиту.
7. Для live-проверок также обеспечить одинаковый набор сценариев и критериев
   для обоих браузеров. Сеть и авторизованные аккаунты остаются отдельными
   условиями запуска; их отсутствие явно отмечается как непроверенное и не
   засчитывается как успешная проверка или достигнутый паритет.

Планировать эту работу вместе с переносом тестовой инфраструктуры, до признания
рефакторинга тестов завершённым. Готово: матрица не содержит незакрытых пробелов,
Chrome и Firefox исполняют одинаковый полный набор browser/UI сценариев,
существенные assertions равнозначны, все проверки проходят, а CI предотвращает
повторное появление одностороннего покрытия. Для live suites подготовлен и
проверен одинаковый набор; фактически не выполненные внешние проверки перечислены явно.

### Приоритеты и критерий готовности

Сохранять существующие содержательные проверки, дополняя их только для новых границ и найденных рисков. Приоритет: целостность данных, гонки, stale results, локальное сохранение/sync, partial import, отмена capture, cleanup и обновление установки. Избегать тестов приватной структуры и тривиального делегирования; не назначать произвольные 100% coverage как цель.

При необходимости включить coverage как средство поиска пропусков и отслеживать критические сценарии; отчёт не заменяет проверку браузеров. Таймеры/сеть/время делать детерминированными через существующие порты, fake timers и fixtures; не стабилизировать тесты произвольными sleeps.

Готово: из дерева понятно, какому модулю принадлежит тест; runner обнаруживает все перенесённые проверки; нет дублирования suites и test imports в production; выполнен обязательный паритет Chrome и Firefox по матрице сценариев и assertions выше. В ARCHITECTURE.md показать команду запуска тестов одного модуля через Vitest path filter и отдельный способ запуска выбранного browser-сценария.

## 8. Адаптация рекомендаций Cursor

**Перенять:** Composition API и TypeScript, небольшие компоненты, минимум логики в template, named exports, PascalCase компонентов, `use…` composables, чистые helpers, props вниз/emits вверх, явные loading/error, computed для производных значений, watch для side effects. Предпочитать композицию, early returns и простые функции.

**Адаптировать:**

- Не использовать Nuxt auto-imports: в `wxt.config.ts` стоит `imports: false`; сохранять явные импорты Vue/WXT.
- `useNuxtApp().$service` заменить на типизированный Vue provide/inject; runtime config Nuxt не переносить.
- Pinia не добавлять автоматически: текущих ref/shallowRef и экземпляра приложения достаточно, пока не доказана отдельная потребность.
- Сохранить Tailwind/CSS и существующие tokens вместо переноса SCSS, DDG UIKit и правил, завязанных на него. BEM полезен для собственных блоков; запрет scoped не является архитектурным требованием для расширения.
- Порядок секций SFC выбрать единообразно для новых/переносимых файлов; массовую перестановку всего проекта не совмещать с извлечением функций.
- Запрет DOM в composables применять к сервисным composables. DOM-зависимые focus/layout/resource helpers держать явно в UI-слое и проверять cleanup.
- Не переносить blanket `try/catch` с подавлением ошибок. Ошибка сети не должна выглядеть как успешный пустой результат; best-effort cache допускает подавление с понятной причиной.
- Имена булевых значений `is/has`, выбранных значений `selected/active`, операций `get/init/set/change` применять в новом коде без переименования стабильных persisted keys.
- Правило cabinet «не менять код без одобрения» учитывать как процесс исходного проекта. Этот запрос авторизует создание плана; реализация рефакторинга — отдельная задача.

Новые функции сразу размещать у целевого владельца. Временные compatibility exports помечать назначением и этапом удаления; не развивать старые общие каталоги.

## 9. Проверка и критерии завершения

Команды существуют в текущем package.json:

```sh
npm ci
npm run compile
npm test
npm run build
npm run build:firefox
npm run test:browser
npm run test:ui
# Отдельно, при доступной сети и готовых сборках:
npm run test:live -- --headed
```

`npm test` уже запускает vue-tsc и Vitest; отдельно повторять compile после полного успешного прогона без изменений не требуется. Browser/UI runners сами собирают расширения; учитывать это при выборе проверок и времени прогона. Они частично пересекаются по сценариям. Firefox-фильтр исполняет только поддерживаемое подмножество; наличие флага не доказывает покрытие всех Chrome-сценариев Firefox.

Для каждого небольшого изменения запускать затронутые unit-тесты и compile; при изменении runtime/import graph — обе сборки; при изменении поведения — соответствующие browser-сценарии; при изменении CSS/DOM — UI-проверки. Полные suites — на контрольных этапах и перед завершением. Добавлять тесты на значимые новые границы, гонки и cleanup, не на факт существования папок или тривиальное делегирование.

Финальный результат:

- UI не создаёт инфраструктуру и не выполняет HTTP напрямую.
- Подмодули владеют своими типами, сценариями и адаптерами; верхний dial координирует приложение.
- Background и newtab имеют отдельные точки сборки и контролируемый lifecycle.
- Нет центрального Repository на все функции, глобального repository из composable и универсального models.ts.
- Необязательные функции загружаются по требованию, что подтверждено сборкой; критический старт не замедлен без объяснённой причины.
- ESLint, Prettier и настроенный Stylelint проходят локально и в CI; правила импортов контролируют архитектурные границы.
- Тесты функций находятся в модулях; корневые tests содержат общую инфраструктуру и межмодульные/browser/UI сценарии; runner обнаруживает все проверки. Chrome и Firefox имеют одинаковое полное покрытие browser/UI сценариев и равнозначные assertions; незакрытых пробелов в матрице нет, CI контролирует паритет.
- Проверены чистая установка и обновление существующей установки в обоих браузерах; сохранены identity, storage и backup contracts.
- Единые правила ошибок/отмены и общий UI сохраняют доступность; ARCHITECTURE.md описывает реализованные модули и пример расширения.
- Проверки проходят, существующие данные читаются без сброса, внешний вид и поведение сохраняются.

Начинать с этапов 0–2: они создают проверяемые границы и возможность извлекать функции независимо. Каждый следующий этап оформлять отдельными небольшими изменениями с собственным критерием готовности; не объединять перенос файлов, смену форматов данных и изменение пользовательского поведения.
