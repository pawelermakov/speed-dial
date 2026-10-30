import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
const out = resolve('.browser-test/apple-guidelines');
await mkdir(out, { recursive: true });
const extension = resolve('.output/chrome-mv3');
const context = await chromium.launchPersistentContext(resolve(out, crypto.randomUUID()), {
  locale: 'ru-RU',
  channel: 'chromium',
  headless: true,
  args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
});
const luminance = (rgb) =>
  rgb
    .map((v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(worker.url().replace('background.js', 'newtab.html'));
  const gear = page.getByRole('button', { name: 'Настройки', exact: true });
  await expect(gear).toBeEnabled();
  const panel = page.getByRole('dialog', { name: 'Настройки', exact: true }),
    close = page.getByRole('button', { name: 'Закрыть настройки', exact: true });
  for (const [width, height] of [
    [320, 240],
    [320, 800],
    [1280, 800],
  ]) {
    await page.setViewportSize({ width, height });
    await gear.click();
    await expect(panel).toBeVisible();
    assert(await panel.evaluate((e) => e.matches(':modal')));
    await expect(gear).toHaveAttribute('aria-expanded', 'true');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(
      page.getByRole('button', { name: 'Управление данными', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.locator('.search input').evaluate((e) => e.focus());
    assert(
      await panel.evaluate((e) => e.contains(document.activeElement)),
      'background focus must be blocked',
    );
    const number = page.getByLabel('Ширина (%)', { exact: true });
    await number.fill('1');
    await expect(number).toHaveAttribute('aria-invalid', 'true');
    await expect(number).toHaveAttribute('aria-describedby', 'settings-width-error');
    await expect(page.locator('#settings-width-error')).toHaveText(
      'Введите целое число от 50 до 100.',
    );
    await number.fill('100');
    await number.blur();
    await expect(page.locator('#settings-width-error')).toHaveCount(0);
    for (const name of ['О синхронизации', 'О настройке почты']) {
      const help = page.getByRole('button', { name, exact: true });
      if (width === 320 && height === 240 && name === 'О синхронизации')
        await page
          .locator('#sync-info')
          .evaluate(
            (e) =>
              (e.textContent += ' Long tooltip content for scrolling verification.'.repeat(30)),
          );
      await help.focus();
      const tip = panel.getByRole('tooltip');
      await expect(tip).toBeVisible();
      await expect
        .poll(async () => {
          const b = await tip.boundingBox();
          return (
            !!b &&
            b.x >= 15 &&
            b.y >= 15 &&
            b.x + b.width <= width - 15 &&
            b.y + b.height <= height - 15
          );
        })
        .toBe(true);
      await expect(tip).toHaveCSS('opacity', '1');
      await tip.hover();
      await page.mouse.wheel(0, 300);
      await expect(tip).toBeVisible();
      if (width === 320 && height === 240 && name === 'О синхронизации')
        await expect.poll(() => tip.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
      await page.screenshot({
        path: resolve(
          out,
          `${width}-${height}-${name === 'О синхронизации' ? 'sync' : 'mail'}.png`,
        ),
      });
      await help.press('Escape');
      await expect(tip).toBeHidden();
      await expect(panel).toBeVisible();
    }
    const green = await page.locator('.settings').evaluate((e) => {
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
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(gear).toBeFocused();
    await expect(gear).toHaveAttribute('aria-expanded', 'false');
  }
  const search = page.locator('.search input');
  await search.fill('test');
  await page.getByRole('button', { name: 'Очистить поисковый запрос', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(page.locator('.suggestions')).toHaveCount(0);
  const add = page.getByRole('button', { name: 'Новая закладка', exact: true });
  await add.click();
  const url = page.locator('#bookmark-url');
  await expect(url).toBeFocused();
  await url.fill('not-a-domain');
  await url.blur();
  await expect(page.locator('.bookmark-form button[type=submit]')).toBeDisabled();
  await expect(page.locator('.bookmark-form [role=alert]')).toHaveCount(0);
  await url.fill('example.com');
  await expect(page.locator('.bookmark-form button[type=submit]')).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(add).toBeFocused();
  await gear.click();
  await page.getByRole('button', { name: 'Управление данными', exact: true }).click();
  await expect(page.locator('.modal .close')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.data-management')).toHaveCount(0);
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(gear).toBeFocused();
  await gear.click();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-contrast', value: 'more' }],
  });
  await expect(page.locator('.settings')).toHaveCSS(
    'background-color',
    'rgba(255, 255, 255, 0.96)',
  );
  await expect(page.locator('.settings input[type=number]').first()).toHaveCSS(
    'background-color',
    'rgba(255, 255, 255, 0.86)',
  );
  await page.screenshot({ path: resolve(out, 'increased-contrast.png') });
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-contrast', value: 'more' },
      { name: 'prefers-reduced-transparency', value: 'reduce' },
    ],
  });
  await expect(page.locator('.settings')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('.settings')).toHaveCSS('backdrop-filter', 'none');
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await expect(page.locator('.settings')).toHaveCSS('backdrop-filter', 'none');
  await expect(page.locator('.settings')).toHaveCSS('transition-duration', '0s');
  await close.click();
  await expect(panel).toHaveCount(0);
  await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
  await expect
    .poll(() => page.evaluate(() => matchMedia('(forced-colors:active)').matches))
    .toBe(false);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await expect.poll(() => page.evaluate(() => matchMedia('(pointer:coarse)').matches)).toBe(true);
  await page.setViewportSize({ width: 320, height: 700 });
  await search.fill('Touch query');
  await expect(
    page.getByRole('button', { name: 'Очистить поисковый запрос', exact: true }),
  ).toHaveCSS('width', '44px');
  assert(
    await page.locator('.search').evaluate((e) => e.scrollWidth <= e.clientWidth),
    'touch search must fit narrow viewport',
  );
  await gear.click();
  await expect(close).toHaveCSS('width', '44px');
  await expect(page.getByRole('button', { name: 'О синхронизации', exact: true })).toHaveCSS(
    'height',
    '44px',
  );
  await expect(page.locator('.settings')).toHaveCSS('transform', 'none');
  await page.screenshot({ path: resolve(out, 'touch-settings.png') });
  await close.click();
  assert.deepEqual(errors, []);
  console.log(
    'PASS Apple audit: modal focus/return/Escape, background isolation, associated errors, measured hoverable/scrollable tooltips at 320x240/320x800/1280x800, status contrast, increased/reduced transparency, forced colors/reduced motion',
  );
} finally {
  await context.close();
}
