# Покрытие Chrome и Firefox

Актуализировано 1 ноября 2026 года, этап 8.11. Оба браузера выбирают один
полный реестр: 34 уникальных сценария, browser 23/23, UI 25/25.
Отдельного списка поддерживаемых Firefox-сценариев и сокращённого smoke больше нет.
У каждого сценария обязателен одинаковый ordered case contract; runner проверяет
UUID текущего запуска, итоговый статус, полный список cases и число свежих PNG.
CI загружает все 34 отчёта по явным путям; архитектурные проверки запрещают
пропуски сценариев, contracts и путей загрузки.

## Детерминированные сценарии

Общий check выполняет одинаковые проверки в реальных страницах расширения.
Число cases обозначает контрольные точки, а не число отдельных assertions.

| Сценарий                                                                          | Suites | Проверяемое поведение                                                                                                                                                                        | Cases на браузер | PNG на браузер |
| --------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------: | -------------: |
| [i18n](../tests/browser/settings/i18n.mjs)                                        | B,U    | Browser default/fallback, RU/EN/ES, errors/dialog/export, user content, persistence, second tab, layout, manifest locales, язык после reload                                                 |                5 |              0 |
| [settings-sync](../tests/browser/settings/settings-sync.mjs)                      | B      | Два профиля/stable runtime ID, no default upload, sparse writes, controlled delivery, focused input, failure/retry, portable folder rename/delete/fallback, identity privacy, tooltip/layout |               10 |              4 |
| [settings-autosave](../tests/browser/settings/settings-autosave.mjs)              | B      | Autosave/invalid/close flush/two tabs/provider patch, failures/rollback, background stability, zero mutations, Sync/layout/reload, pending edits vs import/reset                             |               15 |              4 |
| [mail-indicators](../tests/browser/mail/mail-indicators.mjs)                      | B,U    | Три провайдера, count/status, noauth/offline/timeout/server/malformed XML, stale responses, no polling, настройки/backup, reload, темы/ширины                                                |                2 |              5 |
| [weather-widget](../tests/browser/weather/weather-widget.mjs)                     | B,U    | Off/defaults, 16 городов, два forecast URL/native Enter, second tab, reload, backup, no network/bookmark mutations, темы/семь ширин                                                          |                3 |             15 |
| [data-management](../tests/browser/backup/data-management.mjs)                    | B,U    | Все/выбранные sections, transfer, image restore/dedup, invalid version/decode, cancel/busy/Escape, partial import, destination, reset/focus, themes/widths                                   |                3 |             26 |
| [themes](../tests/browser/appearance/themes.mjs)                                  | B,U    | Persistence, OS light/dark changes и explicit overrides, JSON v3, прежние tile/wallpaper bytes, backgrounds, modal/menu/empty, три ширины                                                    |                1 |             42 |
| [theme-startup](../tests/browser/appearance/theme-startup.mjs)                    | B,U    | Задержка app chunk, CSS/color-scheme до mount во всех modes/OS, native storage во второй вкладке, contrast/transparency/forced colors/focus                                                  |               10 |              0 |
| [wallpaper-startup](../tests/browser/appearance/wallpaper-startup.mjs)            | B      | Preview до app startup, original replacement, removal/replacement, stale cache cleanup                                                                                                       |                4 |              3 |
| [movie-search](../tests/browser/search/movie-search.mjs)                          | B,U    | Включение/выключение movie providers, fallback и persistence выбранного провайдера                                                                                                           |                1 |              0 |
| [unified-search](../tests/browser/search/unified-search.mjs)                      | B,U    | Единый input/providers/local search, keyboard/raw query, clear/Escape, настройки и layout                                                                                                    |                1 |              0 |
| [search-providers](../tests/browser/search/search-providers.mjs)                  | B      | Flat select, persistence, пять fixtures, own requests, raw submit и selected Enter/direct links, stale cancellation, failures/fallback, 15 responsive screenshots                            |               11 |             15 |
| [browser-parity](../tests/browser/extension/browser-parity.mjs)                   | B,U    | Native source, modal isolation, export/import guards, mixed-slot sort, search, credentialed mail count/noauth, pointer/keyboard focus, menu bounds                                           |                1 |              0 |
| [smoke](../tests/browser/extension/smoke.mjs)                                     | B      | Чистая установка без mutations, CRUD/capture/title, autosave/failure/two tabs, sources/cache, native events, DnD, folder CRUD/confirm, backup, local search/fallback                         |               11 |              2 |
| [bookmark-dialogs](../tests/browser/bookmarks/bookmark-dialogs.mjs)               | B      | Responsive validation/defaults/parent, capture/title/URL/manual name, external same-name invalidation, cancellation/failures, stale folder, move                                             |                7 |              7 |
| [folder-interaction](../tests/browser/bookmarks/folder-interaction.mjs)           | B      | Root/name/icon persistence, folder CRUD/protection, native tile/folder DnD, mixed slots, self/cross-folder guards, events, responsive scroll/search                                          |               11 |              5 |
| [bookmark-drag](../tests/browser/bookmarks/bookmark-drag.mjs)                     | B      | Asset-only refresh сохраняет drag/geometry, gap drop, native favicon/caption initiation, external structural edit отменяет stale drop, trailing slot append                                  |                6 |              0 |
| [text-tiles](../tests/browser/bookmarks/text-tiles.mjs)                           | B      | Favicon-only, valid/corrupt thumbnail, safe labels, stable colors, реальные ICO fixtures, color resolution/reload, девять layouts                                                            |                4 |             10 |
| [confirmation-dialogs](../tests/ui/accessibility/confirmation-dialogs.mjs)        | B,U    | Modal/isolation, destructive cancel/confirm, keyboard/focus, hover contrast, ошибки и responsive layout                                                                                      |                1 |              6 |
| [keyboard-navigation](../tests/ui/accessibility/keyboard-navigation.mjs)          | B,U    | Keyboard CRUD, responsive grid, native Enter, IME/shortcuts, menus/sorting, modal Tab cycle, external delete/search                                                                          |                1 |              0 |
| [focus-styles](../tests/ui/accessibility/focus-styles.mjs)                        | U      | Pointer/keyboard focus, individual outlines, local search/switches и forced colors                                                                                                           |                4 |              0 |
| [apple-guidelines-audit](../tests/ui/accessibility/apple-guidelines-audit.mjs)    | U      | Modal focus/return/Escape/isolation, associated errors, hover/scroll tooltips, contrast, transparency/forced colors/reduced motion                                                           |                6 |              8 |
| [scroll-stability](../tests/ui/appearance/scroll-stability.mjs)                   | B,U    | 320/360/1280/1920, scrollbar gutters, settings/modal/menu/tooltip/suggestions overflow, wheel                                                                                                |                2 |              2 |
| [vertical-center](../tests/ui/appearance/vertical-center.mjs)                     | B,U    | Центрирование при разном содержимом/размерах, settings/backup, overflow и устойчивость геометрии                                                                                             |                1 |              0 |
| [appearance](../tests/ui/appearance/appearance.mjs)                               | U      | 30 folders, четыре ширины/фона, surfaces/layers/menu/dialog, 200% zoom, forced colors/reduced motion                                                                                         |               18 |             49 |
| [design-system-states](../tests/ui/appearance/design-system-states.mjs)           | U      | State/style audit controls, settings/dialogs/menu, реальные asset fixtures, responsive размеры                                                                                               |                7 |             61 |
| [design-system-consistency](../tests/ui/appearance/design-system-consistency.mjs) | U      | Select chevrons/focus/disabled, общий glass у settings/dialog/menu/tooltip/suggestions, 320/1280 и accessibility modes                                                                       |                4 |              4 |
| [startup-motion](../tests/ui/appearance/startup-motion.mjs)                       | U      | Instant startup, 150 ms folder reveal, grid/bitmap stability на трёх ширинах, decode readiness, no replay metadata/same folder, reduced motion                                               |                7 |              7 |
| [glass-motion](../tests/ui/appearance/glass-motion.mjs)                           | U      | Blur/opaque ancestors во время enter/leave settings/modal и reduced motion                                                                                                                   |                5 |              0 |
| [folder-scroll-layout](../tests/ui/appearance/folder-scroll-layout.mjs)           | U      | Появление/исчезновение scrollbar не сдвигает row/folder/search/grid на 320/1280/1920                                                                                                         |                3 |              0 |
| [empty-states](../tests/ui/states/empty-states.mjs)                               | B,U    | Loading/empty/search-empty/error/retry, доступные actions, responsive layout                                                                                                                 |                2 |             11 |
| [search-styles](../tests/ui/search/search-styles.mjs)                             | U      | Geometry/surfaces/radii, disabled/hover/press/Tab, suggestions/feedback, scrolling/single highlight, 180px viewport, backgrounds/accessibility                                               |               15 |             14 |
| [toolbar-styles](../tests/ui/toolbar/toolbar-styles.mjs)                          | U      | Шесть ширин/три фона, geometry/borders, hover/press/scroll, search/folders/focus, mail count/error, forced colors/reduced motion                                                             |               10 |             19 |
| [bookmark-styles](../tests/ui/bookmarks/bookmark-styles.mjs)                      | U      | Четыре ширины/три фона, hover/press/16:9/captions, valid/missing/broken favicon, add/dialog/focus/accessibility                                                                              |               13 |             12 |

## Нативные различия и границы проверки

- Chrome использует Playwright/CDP, Firefox — Marionette и WebDriver BiDi.
  Клики, клавиши, wheel, файлы, download, вкладки и screenshots проходят через
  нативный драйвер. Firefox проверяет точные innerWidth/innerHeight, включая 320 px.
- Native drag начинается настоящим pointer input. Firefox завершает текущую
  браузерную drag session через движок ввода; проверяются trusted start/drop/end,
  порядок browser bookmarks, Escape и сохранение порядка после reload.
  Синтетические HTML5 regression fixtures сохранены отдельно в общих checks.
- Firefox не предоставляет API аккаунта браузера: ожидается нейтральный статус,
  профильный API не вызывается. Chrome проверяет signed-in/out/error fixtures.
  Оба браузера проверяют отсутствие identity в local/sync storage.
- Синхронизация использует настоящие storage.sync и независимые профили,
  детерминированную доставку значений, restart и явное подтверждение локальных
  настроек. Firefox дополнительно проверяет Places GUID и задержку доставки
  native bookmarks; локальная папка Chrome без аккаунта не выбирается на другом
  устройстве автоматически. Реальная облачная доставка между аккаунтами не проверяется.
- Backup проверяет native download/filename и импорт настоящего файла в чистом
  профиле в обоих браузерах. Capture использует локальный HTTP-сайт и настоящий
  background. Скриншоты проверяются как PNG; попиксельное равенство разных
  браузерных движков не заявляется.
- Media проверяется через matchMedia и computed styles после нативных настроек.
  У Firefox доступность reduced-transparency включается в изолированном профиле.
  Startup проверяет реальные screenshot clips, в том числе при DPR 1.25.

## Live-провайдеры

Отдельная команда test:live выполняет по шесть одинаковых реальных запросов,
включая русскоязычный MyShows. Последняя проверка: Firefox 6/6 PASS; Chrome
4/6 PASS и два MyShows BLOCKED — HTTP 502 с HTML вместо JSON. Это внешний
ответ сервера, не пропуск сценария и не успешный fixture-результат. Полный
детерминированный provider check с настоящими HTTP interception/navigation
проходит в обоих браузерах. Live не входит в обязательный CI.
