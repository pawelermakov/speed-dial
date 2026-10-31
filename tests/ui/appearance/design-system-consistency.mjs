import assert from 'node:assert/strict';
import { runSharedScenario } from '../../browser/helpers/extension-driver.mjs';
import { uiAssertions } from '../../browser/helpers/ui-assertions.mjs';

await runSharedScenario('design-system-consistency', async (browser, driver) => {
  const {
    evaluate,
    ready,
    resize,
    click,
    clickAt,
    movePointer,
    key,
    fill,
    media,
    errors,
    shot,
    caseDone,
  } = driver;
  const ui = uiAssertions(driver),
    selectSignatures = [],
    glassSignatures = [];
  await ready();
  await evaluate(() => {
    const fetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = (input, options) =>
      new URL(typeof input === 'string' ? input : input.url).hostname === 'suggest.yandex.ru'
        ? Promise.resolve(
            new Response('["test",["Example suggestion"]]', {
              headers: { 'content-type': 'application/json' },
            }),
          )
        : fetch(input, options);
  });
  const glass = async (selector) => {
    await ui.css(selector, 'opacity', '1');
    glassSignatures.push(
      await ui.node(selector, (e) => {
        const s = getComputedStyle(e);
        return [s.backgroundColor, s.backgroundImage, s.backdropFilter, s.borderTopColor];
      }),
    );
  };
  const checkSelect = async (selector) => {
    const embedded = await ui.node(selector, (e) =>
      e.parentElement.classList.contains('ui-select--embedded'),
    );
    const resting = embedded ? 'rgba(0, 0, 0, 0)' : 'rgba(255, 255, 255, 0.46)';
    await ui.node(selector, (e) => e.blur());
    await movePointer(1, 1);
    await ui.css(selector, 'background-color', resting);
    await ui.hover(selector);
    await ui.css(selector, 'background-color', resting);
    if (embedded) {
      assert.equal(
        await ui.node(selector, (e) => e.parentElement.querySelectorAll('.select-chevron').length),
        0,
      );
      await ui.css(selector, 'padding-right', '12px');
      await ui.css(selector, 'height', '40px');
      await ui.css(selector, 'border-radius', '20px');
    } else {
      await ui.css(selector, 'border-top-color', 'rgba(0, 0, 0, 0)');
      assert.equal(
        await ui.node(
          selector,
          (e) => getComputedStyle(e.parentElement.querySelector('.select-chevron')).width,
        ),
        '16px',
      );
      assert.equal(
        await ui.node(
          selector,
          (e) => getComputedStyle(e.parentElement.querySelector('.select-chevron')).pointerEvents,
        ),
        'none',
      );
      selectSignatures.push(
        await ui.node(selector, (e) => {
          const s = getComputedStyle(e),
            a = getComputedStyle(e.nextElementSibling);
          return [
            s.height,
            s.borderRadius,
            s.borderTopWidth,
            s.paddingLeft,
            s.paddingRight,
            s.color,
            s.appearance,
            a.width,
            a.height,
            a.right,
            a.color,
            e.nextElementSibling.getAttribute('stroke-width'),
            e.nextElementSibling.querySelector('path').getAttribute('d'),
          ];
        }),
      );
    }
    await ui.focus(selector);
    await ui.css(selector, 'background-color', 'rgba(255, 255, 255, 0.58)');
    await ui.css(selector, 'border-top-color', 'rgba(0, 0, 0, 0)');
    await ui.node(selector, (e) => {
      e.disabled = true;
    });
    await ui.css(selector, 'background-color', 'rgb(226, 232, 240)');
    await ui.node(selector, (e) => {
      e.disabled = false;
      e.blur();
    });
  };
  for (const width of [320, 1280]) {
    await resize(width, 800);
    await checkSelect('.search select');
    await ui.attribute('.search select', 'aria-label', 'Где искать');
    await click('button[aria-label="Настройки"]');
    await glass('.settings');
    await ui.css('.settings .ui-file-button', 'border-radius', '20px');
    const count = await evaluate(() => document.querySelectorAll('.settings select').length);
    for (let i = 0; i < count; i++) await checkSelect(ui.nth('.settings select', i));
    const number = ui.nth('.settings input[type=number]', 0);
    await ui.css(number, 'background-color', 'rgba(255, 255, 255, 0.46)');
    await ui.focus(number);
    await ui.css(number, 'background-color', 'rgba(255, 255, 255, 0.58)');
    assert.equal(await ui.node('.settings', (e) => e.scrollWidth > e.clientWidth), false);
    assert(
      await evaluate(() =>
        [...document.querySelectorAll('.settings-form>fieldset')].every((e) => {
          const line = getComputedStyle(e.querySelector('legend'), '::before');
          return (
            line.content !== 'none' &&
            line.top === '-16px' &&
            -parseFloat(line.top) - parseFloat(line.height) >= 12
          );
        }),
      ),
      'section divider must be separated from its legend',
    );
    await shot(`${width}-settings`);
    await click('button[aria-label="Закрыть настройки"]');
    await ui.count('.settings', 0);
    const page = await ui.rect('.page');
    await clickAt(Math.floor(page.x + page.width - 2), Math.floor(page.y + 798), {
      button: 'right',
    });
    await glass('[role=menu]');
    await ui.hover(ui.nth('[role=menuitem]', 0));
    await ui.css(ui.nth('[role=menuitem]', 0), 'background-color', 'rgba(255, 204, 0, 0.45)');
    const item = await evaluate(() => {
      const e = [...document.querySelectorAll('[role=menuitem]')].find(
        (e) => e.textContent.trim() === 'Новая закладка',
      );
      if (!e) throw Error('Missing New bookmark menu item');
      e.dataset.parityAction = 'new-bookmark';
      return '[data-parity-action="new-bookmark"]';
    });
    await click(item);
    await glass('.modal');
    await checkSelect('.modal select');
    await click('button[aria-label="О создании эскиза"]');
    await glass('[role=tooltip].is-open');
    await ui.focus('button[aria-label="О создании эскиза"]');
    await key('Escape');
    await shot(`${width}-modal`);
    await click('button[aria-label="Закрыть"]');
    await ui.count('dialog', 0);
    await fill('.search input', 'test');
    await ui.focus('.search input');
    await glass('.suggestions');
    await ui.node('.search input', (e) => e.blur());
    await fill('.search input', '');
    caseDone(`surfaces-${width}`);
  }
  for (const signature of selectSignatures)
    assert.deepEqual(
      signature,
      selectSignatures[0],
      'standalone selects must share geometry, arrow and typography',
    );
  for (const signature of glassSignatures)
    assert.deepEqual(
      signature,
      glassSignatures[0],
      'settings, dialogs, menus, tooltips and suggestions must share the glass material',
    );
  caseDone('shared-signatures');
  await click('button[aria-label="Настройки"]');
  await media({ transparency: 'reduce' });
  await ui.css('.settings', 'background-color', 'rgb(255, 255, 255)');
  await ui.css('.settings', 'backdrop-filter', 'none');
  await media({ forcedColors: 'active', reducedMotion: 'reduce' });
  await ui.css('#theme-mode', 'transition-duration', '0s');
  await ui.css('.settings', 'backdrop-filter', 'none');
  assert.deepEqual(await errors(), []);
  caseDone('accessibility-media');
  console.log(
    'PASS ' +
      browser +
      ' global consistency: selects, chevrons, focus/disabled, shared glass surfaces, 320/1280 and accessibility modes',
  );
});
