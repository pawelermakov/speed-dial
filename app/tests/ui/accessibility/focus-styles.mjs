import { runSharedScenario } from '../../browser/helpers/extension-driver.mjs';
import { uiAssertions } from '../../browser/helpers/ui-assertions.mjs';

await runSharedScenario('focus-styles', async (browser, driver) => {
  const { evaluate, ready, click, clickAt, fill, key, media, caseDone } = driver;
  const ui = uiAssertions(driver);
  const gear = 'button[aria-label="Настройки"]',
    search = '.search',
    input = '.search input',
    clear = '.search-clear',
    submit = '.search-submit';
  await ready();
  await evaluate(() => {
    const fetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = (input, options) =>
      new URL(typeof input === 'string' ? input : input.url).hostname === 'suggest.yandex.ru'
        ? Promise.resolve(
            new Response('["test",[]]', { headers: { 'content-type': 'application/json' } }),
          )
        : fetch(input, options);
  });
  await click(input);
  await fill(input, 'test');
  await ui.css(input, 'outline-style', 'none');
  await ui.css(search, 'outline-style', 'none');
  await key('Tab');
  await ui.focused(clear);
  await ui.css(search, 'outline-style', 'none');
  await ui.css(clear, 'outline-width', '2px');
  await ui.css(clear, 'box-shadow', 'none');
  await key('Tab');
  await ui.focused(submit);
  await ui.css(submit, 'outline-width', '2px');
  await key('Shift+Tab');
  await ui.focused(clear);
  await key('Shift+Tab');
  await ui.focused(input);
  await ui.css(search, 'outline-style', 'none');
  await ui.css(input, 'outline-width', '2px');
  await key('Shift+Tab');
  await ui.focused('.search select');
  await ui.css(search, 'outline-style', 'none');
  await ui.css('.search select', 'outline-width', '2px');
  await ui.focus(gear);
  await ui.css(gear, 'outline-width', '2px');
  await ui.css(gear, 'outline-color', 'rgb(82, 100, 122)');
  await ui.css(search, 'outline-style', 'none');
  await clickAt(4, 4);
  await ui.css(gear, 'outline-style', 'none');
  caseDone('pointer-keyboard-focus');
  await key('Tab');
  await ui.attribute('.page', 'data-keyboard-focus', 'true');
  await ui.select('.search select', 'bookmarks');
  await click(input);
  await ui.attribute(input, 'role', 'searchbox');
  await ui.css(input, 'outline-style', 'none');
  await key('Tab');
  await ui.attribute(clear, 'aria-label', 'Очистить поисковый запрос');
  await ui.focused(clear);
  await ui.css(clear, 'outline-width', '2px');
  await click(clear);
  await ui.focused(input);
  await ui.value(input, '');
  await key('Tab');
  await ui.focus('.folder-root');
  await ui.css('.folder-root', 'outline-offset', '-3px');
  await ui.css('.folder-root', 'box-shadow', 'none');
  caseDone('local-search-focus');
  await click(gear);
  await ui.visible('.settings');
  await key('Tab');
  await evaluate(() => document.querySelector('[role="switch"]').focus());
  await driver
    .poll(() =>
      evaluate(
        () =>
          getComputedStyle(document.querySelector('[role="switch"]').nextElementSibling)
            .outlineWidth,
      ),
    )
    .toBe('2px');
  caseDone('switch-focus');
  await media({ forcedColors: 'active' });
  const close = 'button[aria-label="Закрыть настройки"]';
  await ui.focus(close);
  await ui.css(close, 'outline-width', '2px');
  caseDone('forced-colors-focus');
  console.log(
    'PASS ' +
      browser +
      ' pointer/keyboard focus, thin individual focus outlines, local search, switches and forced colors',
  );
});
