// Fixed original-design PNGs are the oracle. No original source code or Git is used.
import { chromium, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
const out = resolve('.browser-test/visual-parity');
const fixtures = resolve('tests/fixtures/visual');
await mkdir(out, { recursive: true });
const provenance = JSON.parse(await readFile(resolve(fixtures, 'provenance.json'), 'utf8'));
const image = 'data:image/png;base64,' + (await readFile('public/images/icon128.png')).toString('base64');
const icon = 'data:image/png;base64,' + (await readFile('public/images/icon16.png')).toString('base64');
const extension = resolve('.output/chrome-mv3');
const ctx = await chromium.launchPersistentContext(resolve('.browser-test', 'visual-' + randomUUID()), {
  channel: 'chromium', headless: true,
  args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
  viewport: { width: 1280, height: 800 },
});
const results = [];
try {
  const worker = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
  const page = await ctx.newPage();
  await page.goto(worker.url().replace('background.js', 'newtab.html'));
  await expect(page.locator('button[aria-label="Настройки"]')).toBeEnabled();
  await page.evaluate(async ({ image, icon }) => {
    const blob = await (await fetch(image)).blob();
    const db = await new Promise(resolve => { const r = indexedDB.open('SpeedDialX'); r.onsuccess = () => resolve(r.result); });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('bookmarks', 'readwrite'); const store = tx.objectStore('bookmarks'); store.clear();
      for (let i = 1; i <= 8; i++) store.put({ id: i, url: 'https://example.com/' + i, title: 'Закладка ' + i, favicon: icon, thumbnail: blob, position: i });
      tx.oncomplete = resolve; tx.onerror = reject;
    });
    db.close();
    await chrome.storage.local.set({ settings: { value: { width: 100, countColumns: 6, space: 24, verticalCenter: false, addButton: true, email: '' }, legacyMigrated: true } });
  }, { image, icon });
  await page.reload(); await expect(page.locator('.bookmark')).toHaveCount(8);
  const freeze = () => page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await freeze();
  async function shot(name) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.mouse.move(0, 0);
    if (name !== 'search') await page.evaluate(() => document.activeElement?.blur());
    await page.evaluate(() => document.fonts.ready);
    const baseline = await readFile(resolve(fixtures, name + '.png'));
    expect(createHash('sha256').update(baseline).digest('hex'), 'Reference image integrity: ' + name).toBe(provenance.sha256[name]);
    const current = await page.screenshot({ path: resolve(out, name + '-new.png') });
    const diff = await page.evaluate(async ([a, b]) => {
      const load = src => new Promise(resolve => { const i = new Image(); i.onload = () => resolve(i); i.src = src; });
      const images = await Promise.all([a, b].map(load));
      if (images[0].width !== images[1].width || images[0].height !== images[1].height) throw new Error('Screenshot dimensions differ');
      const canvas = document.createElement('canvas'); canvas.width = images[0].width; canvas.height = images[0].height;
      const c = canvas.getContext('2d'); c.drawImage(images[0], 0, 0); const x = c.getImageData(0, 0, canvas.width, canvas.height).data;
      c.clearRect(0, 0, canvas.width, canvas.height); c.drawImage(images[1], 0, 0); const y = c.getImageData(0, 0, canvas.width, canvas.height).data;
      let changed = 0;
      for (let i = 0; i < x.length; i += 4) if (Math.max(...[0, 1, 2].map(k => Math.abs(x[i + k] - y[i + k]))) > 16) changed++;
      return { changed, total: x.length / 4, percent: changed / (x.length / 4) * 100 };
    }, ['data:image/png;base64,' + baseline.toString('base64'), 'data:image/png;base64,' + current.toString('base64')]);
    results.push({ name, ...diff }); console.log(name, diff);
    expect(diff.changed, name + ' differs from the fixed original-design reference').toBeLessThanOrEqual(4);
  }
  const settings = async () => {
    await page.locator('.page').click({ button: 'right', position: { x: 10, y: 10 } });
    await page.getByRole('menuitem', { name: 'Настройки', exact: true }).click();
  };
  const close = () => page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  for (const [width, height] of [[360, 800], [1280, 800], [1920, 1080]]) {
    await page.setViewportSize({ width, height }); await shot('grid-' + width);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('.page').click({ button: 'right', position: { x: 10, y: 10 } }); await shot('page-context');
  await page.getByRole('menuitem', { name: 'Настройки', exact: true }).click(); await shot('settings');
  await page.locator('.settings-header button').evaluate(e => e.click());
  await page.locator('.add-card').click(); await shot('add'); await close();
  await page.locator('.bookmark').first().click({ button: 'right', position: { x: 40, y: 40 } }); await shot('context');
  await page.getByRole('menuitem', { name: 'Изменить', exact: true }).click(); await shot('edit'); await close();
  for (const mode of ['import', 'export']) {
    await settings();
    await page.locator('.settings').getByRole('button', { name: mode === 'import' ? 'Импорт' : 'Экспорт', exact: true }).click();
    await page.locator('textarea').evaluate(e => { e.scrollTop = 0; e.setSelectionRange(0, 0); });
    await shot(mode); await close();
  }
  await expect(page.locator('dialog')).toHaveCount(0);
  await page.route('https://suggest.yandex.ru/**', route => route.fulfill({ json: ['тест', ['тестовая строка', 'тест поиска']] }));
  await page.bringToFront(); await page.getByRole('combobox').focus(); await page.getByRole('combobox').fill('тест');
  await expect(page.getByRole('option')).toHaveCount(2);
  await page.addStyleTag({ content: ':focus-visible{outline:none!important}' });
  await shot('search');
  await page.getByRole('combobox').fill('');
  await page.route('https://portal.mail.ru/**', route => route.fulfill({ json: { data: { mail_cnt: '3' } } }));
  await page.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); settings.value.email = 'test@example.invalid'; await chrome.storage.local.set({ settings }); });
  await page.reload(); await expect(page.locator('.badge')).toHaveText('3'); await freeze(); await shot('mail');
  const before = await page.locator('.search').boundingBox();
  await settings(); await page.getByLabel('Центрировать по вертикали').check();
  await page.locator('.settings').getByRole('button', { name: 'Сохранить', exact: true }).click(); await expect(page.locator('.settings')).toHaveCount(0);
  const after = await page.locator('.search').boundingBox(); expect(after.y).toBe(before.y);
  const area = await page.locator('.bookmark-area').boundingBox(); const grid = await page.locator('.bookmarks').boundingBox();
  expect(Math.abs(grid.y + grid.height / 2 - area.y - area.height / 2)).toBeLessThan(1); console.log('PASS centering moves only bookmarks');
  const settingsButton = page.getByRole('button', { name: 'Настройки', exact: true });
  await settingsButton.focus(); expect((await settingsButton.boundingBox()).width).toBeGreaterThan(1);
  await settingsButton.press('Enter'); await expect(page.locator('.settings')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('.settings')).toHaveCount(0); console.log('PASS keyboard access to settings');
  expect(results.map(result => result.name).sort()).toEqual(Object.keys(provenance.sha256).sort());
  await writeFile(resolve(out, 'results.json'), JSON.stringify(results, null, 2));
} finally { await ctx.close(); }
