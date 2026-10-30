import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
const out = resolve('.browser-test/glass-motion');
await mkdir(out, { recursive: true });
const extension = resolve('.output/chrome-mv3');
const context = await chromium.launchPersistentContext(resolve(out, crypto.randomUUID()), {
  locale: 'ru-RU',
  channel: 'chromium',
  headless: true,
  args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
});
try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(worker.url().replace('background.js', 'newtab.html'));
  await expect(page.locator('.folder-root')).toBeEnabled();
  await page.bringToFront();
  await page.waitForTimeout(500);
  const sample = async (selector, action) =>
    page.evaluate(
      async ({ selector, action }) => {
        window.motionSamples = [];
        const start = performance.now();
        const frame = () => {
          const e = document.querySelector(selector);
          if (e) {
            const s = getComputedStyle(e);
            let p = e.parentElement,
              ancestors = [];
            while (p) {
              ancestors.push(getComputedStyle(p).opacity);
              p = p.parentElement;
            }
            window.motionSamples.push({
              opacity: s.opacity,
              transform: s.transform,
              blur: s.backdropFilter,
              ancestors,
            });
          }
          if (performance.now() - start < 500) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        if (action === 'close')
          document
            .querySelector(selector)
            .closest('dialog,.settings-overlay')
            .querySelector('button[aria-label^="Закрыть"]')
            .click();
        else if (action === 'settings')
          document.querySelector('button[aria-label="Настройки"]').click();
        else if (action === 'modal') document.querySelector('[role="menuitem"]').click();
        else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise((r) => setTimeout(r, 550));
        return window.motionSamples;
      },
      { selector, action },
    );
  const verify = (rows, label) => {
    assert(rows.length > 2, label + ' must sample animation');
    assert(
      rows.some((row) => Number(row.opacity) < 1 || row.transform !== 'none'),
      label + ' must include intermediate frames',
    );
    for (const row of rows) {
      assert(
        row.ancestors.every((x) => x === '1'),
        label + ' must not fade glass ancestors',
      );
      assert.equal(row.blur, 'blur(12px) saturate(1.6)', label + ' blur must remain stable');
    }
  };
  verify(await sample('.settings', 'settings'), 'settings enter');
  verify(await sample('.settings', 'close'), 'settings leave');
  await expect(page.locator('.settings')).toHaveCount(0);
  await page.locator('.page').click({ button: 'right', position: { x: 2, y: 790 } });
  await expect(page.getByRole('menu')).toBeVisible();
  verify(await sample('.modal', 'modal'), 'modal enter');
  verify(await sample('.modal', 'close'), 'modal leave');
  await expect(page.locator('dialog')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.locator('.settings')).toHaveCSS('transition-duration', '0s');
  await page.getByRole('button', { name: 'Закрыть настройки', exact: true }).click();
  await expect(page.locator('.settings')).toHaveCount(0);
  console.log(
    'PASS glass motion: stable blur and opaque ancestors throughout modal/settings enter and leave; reduced motion',
  );
} finally {
  await context.close();
}
