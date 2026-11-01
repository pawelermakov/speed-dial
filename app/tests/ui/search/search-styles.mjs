import assert from 'node:assert/strict';
import { runSharedScenario } from '../../browser/helpers/extension-driver.mjs';
import { uiAssertions } from '../../browser/helpers/ui-assertions.mjs';

await runSharedScenario('search-styles', async (browser, driver) => {
  const {
    evaluate,
    poll,
    ready,
    resize,
    click,
    key,
    fill,
    movePointer,
    pointerButton,
    mockFetch,
    media,
    shot,
    caseDone,
  } = driver;
  const ui = uiAssertions(driver),
    search = '.search',
    input = '.search input',
    button = '.search-submit',
    provider = '.search select',
    list = '.suggestions';
  const disabled = (selector, value) =>
    poll(() => ui.node(selector, (e) => e.matches(':disabled'))).toBe(value);
  const fixture = (body, status = 200) => mockFetch('suggest.yandex.ru', { body, status });
  await ready();
  await fixture(JSON.stringify(['test', ['First suggestion', 'Second suggestion']]));
  await disabled(provider, false);
  for (const width of [320, 360, 700, 1280]) {
    await resize(width, 700);
    await fill(input, '');
    await ui.hover(button);
    await disabled(button, true);
    for (const [property, value] of [
      ['background-color', 'rgb(226, 232, 240)'],
      ['color', 'rgb(71, 85, 105)'],
      ['cursor', 'not-allowed'],
      ['box-shadow', 'none'],
    ])
      await ui.css(button, property, value);
    await ui.css(search, 'height', '48px');
    await ui.css(search, 'border-radius', '24px');
    await ui.css(button, 'height', '40px');
    await ui.css(button, 'border-radius', '20px');
    const buttonBox = await ui.rect(button),
      formBounds = await ui.rect(search);
    assert.equal(formBounds.x + formBounds.width - buttonBox.x - buttonBox.width, 4);
    assert.equal(buttonBox.y - formBounds.y, 4);
    if (width <= 480) {
      const iconBox = await ui.rect(button + ' svg');
      assert.equal(iconBox.x + iconBox.width / 2, buttonBox.x + buttonBox.width / 2);
      assert.equal(iconBox.y + iconBox.height / 2, buttonBox.y + buttonBox.height / 2);
    }
    await fill(input, '   ');
    await disabled(button, true);
    await fill(input, 'test');
    await movePointer(0, 0);
    await disabled(button, false);
    await ui.css(button, 'background-color', 'rgb(255, 204, 0)');
    await ui.hover(button);
    await ui.css(button, 'background-color', 'rgb(242, 194, 0)');
    await ui.css(button, 'box-shadow', 'none');
    await pointerButton(true);
    await ui.css(button, 'background-color', 'rgb(230, 184, 0)');
    await movePointer(0, 0);
    await pointerButton(false);
    await click(input);
    await ui.css(input, 'outline-style', 'none');
    await key('Tab');
    await ui.focused('.search-clear');
    await key('Tab');
    await ui.focused(button);
    await ui.hover(button);
    await ui.css(button, 'outline-width', '2px');
    await ui.css(button, 'box-shadow', 'none');
    await ui.count('.search .select-chevron', 0);
    await ui.css(provider, 'padding-right', '12px');
    await ui.css(provider, 'height', '40px');
    await ui.css(provider, 'border-radius', '20px');
    const providerBox = await ui.rect(provider),
      searchBox = await ui.rect(search);
    assert.equal(providerBox.x - searchBox.x, 4);
    assert.equal(providerBox.y - searchBox.y, 4);
    await ui.hover(provider);
    await ui.css(provider, 'background-color', 'rgba(0, 0, 0, 0)');
    await ui.css(provider, 'border-top-color', 'rgba(0, 0, 0, 0)');
    await ui.count(provider + ' option', 3);
    assert(
      await ui.node(provider, (e) => {
        const s = getComputedStyle(e),
          c = document.createElement('canvas').getContext('2d');
        c.font = s.font;
        return Array.from(e.options).every(
          (o) =>
            c.measureText(o.text).width <=
            e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight),
        );
      }),
      'provider names must fit without clipping',
    );
    assert((await ui.rect(input)).width > 80);
    await click(input);
    await ui.visible('.suggestions li:first-child');
    assert.equal(
      await ui.node('.suggestions li:first-child', (e) => e.textContent.trim()),
      'First suggestion',
    );
    await ui.attribute('.suggestions li:first-child', 'role', 'option');
    await key('ArrowDown');
    await ui.attribute('.suggestions li:first-child', 'aria-selected', 'true');
    await ui.css('.suggestions li:first-child', 'box-shadow', 'none');
    await ui.css('.suggestions li:first-child', 'background-color', 'rgba(255, 204, 0, 0.45)');
    await ui.css(list, 'border-radius', '16px');
    await ui.css(list, 'backdrop-filter', 'blur(12px) saturate(1.6)');
    const box = await ui.rect(search);
    assert(box.x >= 0 && box.x + box.width <= width);
    await shot('main-search-' + width, { selector: search });
    caseDone('controls-' + width);
  }
  await fixture(
    JSON.stringify([
      'long',
      Array.from({ length: 8 }, (_, i) => 'Long suggestion ' + i + ' ' + 'long title '.repeat(15)),
    ]),
  );
  for (const width of [320, 1280]) {
    await resize(width, 400);
    for (const [name, background] of [
      ['light', '#fff'],
      ['dark', '#000'],
      ['pattern', 'repeating-conic-gradient(#000 0% 25%,#fff 0% 50%) 0/32px 32px'],
    ]) {
      await evaluate((background) => {
        const style = document.createElement('style');
        style.textContent =
          '.page-background {opacity:1!important;background:' + background + '!important}';
        document.head.append(style);
      }, background);
      await fill(input, 'long ' + name);
      await click(input);
      await ui.count(list + ' li', 8);
      await ui.css('.search-surface', 'background-color', 'rgba(255, 255, 255, 0.86)');
      await ui.css('.search-surface', 'backdrop-filter', 'blur(12px)');
      await ui.css(search, 'backdrop-filter', 'none');
      await ui.css(input, 'background-color', 'rgba(0, 0, 0, 0)');
      await ui.css(input, 'backdrop-filter', 'none');
      await ui.css(list, 'background-color', 'rgba(255, 255, 255, 0.54)');
      await ui.css(list, 'backdrop-filter', 'blur(12px) saturate(1.6)');
      for (let i = 0; i < 8; i++) await key('ArrowDown');
      const item = list + ' [aria-selected=true]';
      await ui.attribute(input, 'aria-activedescendant', 'suggestion-7');
      const row = await ui.rect(item),
        bounds = await ui.rect(list);
      assert(
        row.y >= bounds.y && row.y + row.height <= bounds.y + bounds.height + 1,
        'selected suggestion must remain visible',
      );
      assert(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= 400);
      await ui.css(list, 'opacity', '1');
      assert(
        await ui.node(item, (e) => {
          const r = e.getBoundingClientRect();
          return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }),
        'suggestion must be above folders',
      );
      await shot(`suggestions-${width}-${name}`);
      await key('Escape');
      await ui.count(list, 0);
      caseDone(`background-${width}-${name}`);
    }
  }
  for (const [width, height] of [
    [320, 180],
    [360, 240],
    [1280, 240],
  ]) {
    await resize(width, height);
    await fill(input, 'short ' + height);
    await click(input);
    await ui.count(list + ' li', 8);
    await ui.css(list, 'opacity', '1');
    const bounds = await ui.rect(list),
      form = await ui.rect(search);
    assert.equal(bounds.x, form.x);
    assert.equal(bounds.width, form.width);
    assert(
      bounds.y >= 15 && bounds.y + bounds.height <= height - 15,
      'dropdown must fit short viewport',
    );
    await ui.css(list, 'padding', '3px');
    await ui.css(list + ' li:first-child', 'border-radius', '10px');
    await ui.css(
      list,
      'box-shadow',
      'rgba(12, 20, 34, 0.2) 0px 8px 28px 0px, rgba(255, 255, 255, 0.85) 0px 1px 1px 0px inset, rgba(255, 255, 255, 0.18) 0px -1px 0px 0px inset',
    );
    const first = list + ' li:first-child';
    await ui.hover(first);
    await key('ArrowDown');
    await ui.count(list + ' [aria-selected=true]', 1);
    await ui.css(first, 'background-color', 'rgba(0, 0, 0, 0)');
    await movePointer(0, height - 1);
    await ui.count(list + ' [aria-selected=true]', 1);
    assert(
      await ui.node(list + ' [aria-selected=true]', (e) => {
        const r = e.getBoundingClientRect();
        return e.contains(document.elementFromPoint(r.right - 12, r.y + r.height / 2));
      }),
      'upward dropdown must be above tools',
    );
    await shot(`short-${width}-${height}`);
    await key('Escape');
    await ui.count(list, 0);
    assert.notEqual(await ui.node(input, (e) => e.getAttribute('aria-controls')), 'suggestions');
    caseDone(`short-${width}-${height}`);
  }
  await resize(320, 500);
  await fixture('["empty",[]]');
  await fill(input, 'empty');
  await click(input);
  const feedback = '.search [role=status]';
  await ui.text(feedback, 'Нет подсказок');
  await ui.css(feedback, 'font-size', '14px');
  await ui.css(feedback, 'border-radius', '16px');
  const feedbackBox = await ui.rect(feedback),
    formBox = await ui.rect(search);
  assert.equal(feedbackBox.x, formBox.x);
  assert.equal(feedbackBox.width, formBox.width);
  await fixture('unavailable', 503);
  await fill(input, 'failure');
  await ui.text(feedback, 'Подсказки временно недоступны');
  await disabled(button, false);
  await shot('error');
  caseDone('empty-error-feedback');
  await fixture(
    JSON.stringify(['contrast', Array.from({ length: 8 }, (_, i) => 'Suggestion ' + i)]),
  );
  await fill(input, 'contrast');
  await click(input);
  await ui.count(list + ' li', 8);
  await key('ArrowDown');
  await media({ forcedColors: 'active' });
  const highlight = await evaluate(() => {
    const e = document.createElement('span');
    e.style.backgroundColor = 'Highlight';
    document.body.append(e);
    const color = getComputedStyle(e).backgroundColor;
    e.remove();
    return color;
  });
  await ui.css(list + ' [aria-selected=true]', 'background-color', highlight);
  await media({ transparency: 'reduce' });
  await ui.css('.search-surface', 'background-color', 'rgb(255, 255, 255)');
  await ui.css('.search-surface', 'backdrop-filter', 'none');
  await ui.css(list, 'background-color', 'rgb(255, 255, 255)');
  await ui.css(list, 'backdrop-filter', 'none');
  await media({ reducedMotion: 'reduce', forcedColors: 'active', transparency: 'reduce' });
  await ui.hover(button);
  await ui.css(button, 'transition-duration', '0s');
  caseDone('accessibility-media');
  console.log(
    'PASS ' +
      browser +
      ' search audit: controls, geometry, suggestions, feedback, short viewports, backgrounds and accessibility media',
  );
});
