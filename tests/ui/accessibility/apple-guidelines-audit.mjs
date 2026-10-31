import assert from 'node:assert/strict';
import { runSharedScenario } from '../../browser/helpers/extension-driver.mjs';
import { uiAssertions } from '../../browser/helpers/ui-assertions.mjs';

const luminance = (rgb) =>
  rgb
    .map((v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);

await runSharedScenario('apple-guidelines-audit', async (browser, driver) => {
  const {
    evaluate,
    poll,
    ready,
    resize,
    click,
    key,
    fill,
    hover,
    wheel,
    media,
    coarsePointer,
    errors,
    shot,
    caseDone,
  } = driver;
  const ui = uiAssertions(driver),
    gear = 'button[aria-label="Настройки"]',
    panel = 'dialog[aria-label="Настройки"]',
    close = 'button[aria-label="Закрыть настройки"]';
  const blur = (selector) =>
    ui.node(selector, (e) => {
      e.blur();
    });
  const disabled = (selector, expected) =>
    poll(() => ui.node(selector, (e) => e.matches(':disabled'))).toBe(expected);
  const hidden = (selector) =>
    poll(() =>
      evaluate((selector) => {
        const e = document.querySelector(selector);
        return (
          !e ||
          getComputedStyle(e).visibility !== 'visible' ||
          !e.getBoundingClientRect().width ||
          !e.getBoundingClientRect().height
        );
      }, selector),
    ).toBe(true);
  await ready();
  for (const [width, height] of [
    [320, 240],
    [320, 800],
    [1280, 800],
  ]) {
    await resize(width, height);
    await click(gear);
    await ui.visible(panel);
    assert(await ui.node(panel, (e) => e.matches(':modal')));
    await ui.attribute(gear, 'aria-expanded', 'true');
    await ui.focused(close);
    await key('Shift+Tab');
    await ui.focused('.settings-bottom button');
    await key('Tab');
    await ui.focused(close);
    await ui.focus('.search input');
    assert(
      await ui.node(panel, (e) => e.contains(document.activeElement)),
      'background focus must be blocked',
    );
    const number = 'input[aria-label="Ширина (%)"]';
    await fill(number, '1');
    await ui.attribute(number, 'aria-invalid', 'true');
    await ui.attribute(number, 'aria-describedby', 'settings-width-error');
    await poll(() => ui.node('#settings-width-error', (e) => e.textContent.trim())).toBe(
      'Введите целое число от 50 до 100.',
    );
    await fill(number, '100');
    await blur(number);
    await ui.count('#settings-width-error', 0);
    for (const name of ['О синхронизации', 'О настройке почты']) {
      const help = `button[aria-label="${name}"]`,
        tip = `${panel} [role="tooltip"].is-open`;
      if (width === 320 && height === 240 && name === 'О синхронизации')
        await ui.node('#sync-info', (e) => {
          e.textContent += ' Long tooltip content for scrolling verification.'.repeat(30);
        });
      await ui.focus(help);
      await ui.visible(tip);
      await poll(() =>
        ui.node(
          tip,
          (e, { width, height }) => {
            const b = e.getBoundingClientRect();
            return b.x >= 15 && b.y >= 15 && b.right <= width - 15 && b.bottom <= height - 15;
          },
          { width, height },
        ),
      ).toBe(true);
      await ui.css(tip, 'opacity', '1');
      await hover(tip);
      const point = await ui.node(tip, (e) => {
        const r = e.getBoundingClientRect();
        return { x: Math.floor(r.x + r.width / 2), y: Math.floor(r.y + r.height / 2) };
      });
      await wheel(point.x, point.y, 300);
      await ui.visible(tip);
      await poll(() =>
        ui.node(tip, (e) => {
          const r = e.getBoundingClientRect();
          return (
            r.left >= 15 &&
            r.top >= 15 &&
            r.right <= innerWidth - 15 &&
            r.bottom <= innerHeight - 15
          );
        }),
      ).toBe(true);
      if (width === 320 && height === 240 && name === 'О синхронизации')
        await poll(() => ui.node(tip, (e) => e.scrollTop)).toBeGreaterThan(0);
      await shot(`${width}-${height}-${name === 'О синхронизации' ? 'sync' : 'mail'}`);
      await ui.focus(help);
      await key('Escape');
      await hidden(tip);
      await ui.visible(panel);
    }
    const green = await ui.node('.settings', (e) => {
      const span = document.createElement('span');
      span.style.color = 'var(--success)';
      e.append(span);
      const rgb = getComputedStyle(span).color.match(/\d+/g).map(Number);
      span.remove();
      return rgb;
    });
    assert(
      (luminance([137, 137, 137]) + 0.05) / (luminance(green) + 0.05) >= 4.5,
      'status text must contrast with the darkest fixed .54 glass over black',
    );
    await key('Escape');
    await ui.count(panel, 0);
    await ui.focused(gear);
    await ui.attribute(gear, 'aria-expanded', 'false');
    caseDone(`modal-tooltips-${width}-${height}`);
  }
  const search = '.search input',
    add = '.bookmark-empty button',
    url = '#bookmark-url';
  await fill(search, 'test');
  await click('button[aria-label="Очистить поисковый запрос"]');
  await ui.value(search, '');
  await ui.focused(search);
  await ui.count('.suggestions', 0);
  await click(add);
  await ui.focused(url);
  await fill(url, 'not-a-domain');
  await blur(url);
  await disabled('.bookmark-form button[type=submit]', true);
  await ui.count('.bookmark-form [role=alert]', 0);
  await fill(url, 'example.com');
  await disabled('.bookmark-form button[type=submit]', false);
  await key('Escape');
  await ui.count('dialog', 0);
  await ui.focused(add);
  await click(gear);
  await click('.settings-bottom button');
  await ui.focused('.modal .close');
  await key('Escape');
  await ui.count('.data-management', 0);
  await ui.count('dialog', 0);
  await ui.focused(gear);
  caseDone('search-bookmark-backup-focus');
  await click(gear);
  await media({ contrast: 'more' });
  await ui.css('.settings', 'background-color', 'rgba(255, 255, 255, 0.96)');
  await poll(() =>
    evaluate(
      () =>
        getComputedStyle(document.querySelector('.settings input[type=number]')).backgroundColor,
    ),
  ).toBe('rgba(255, 255, 255, 0.86)');
  await shot('increased-contrast');
  await media({ contrast: 'more', transparency: 'reduce' });
  await ui.css('.settings', 'background-color', 'rgb(255, 255, 255)');
  await ui.css('.settings', 'backdrop-filter', 'none');
  await media({ forcedColors: 'active', reducedMotion: 'reduce' });
  await ui.css('.settings', 'backdrop-filter', 'none');
  await ui.css('.settings', 'transition-duration', '0s');
  await click(close);
  await ui.count(panel, 0);
  await media();
  await poll(() => evaluate(() => matchMedia('(forced-colors:active)').matches)).toBe(false);
  caseDone('contrast-transparency-motion');
  await coarsePointer();
  await resize(320, 700);
  await fill(search, 'Touch query');
  await ui.css('button[aria-label="Очистить поисковый запрос"]', 'width', '44px');
  assert(
    await ui.node('.search', (e) => e.scrollWidth <= e.clientWidth),
    'touch search must fit narrow viewport',
  );
  await click(gear);
  await ui.css(close, 'width', '44px');
  await ui.css('button[aria-label="О синхронизации"]', 'height', '44px');
  await ui.css('.settings', 'transform', 'none');
  await shot('touch-settings');
  await click(close);
  assert.deepEqual(await errors(), []);
  caseDone('coarse-pointer');
  console.log(
    'PASS ' +
      browser +
      ' Apple audit: modal focus, errors, tooltips, status contrast, accessibility media and touch sizes',
  );
});
