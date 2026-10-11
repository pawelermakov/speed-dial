import { chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { firefoxSmoke } from './firefox-smoke.mjs';

const results = [];
const recordResult = results.push.bind(results);
results.push = (...items) => { items.forEach(item => console.log('PASS', item)); return recordResult(...items); };
const root = resolve('.browser-test');
await mkdir(root, { recursive: true });
const site = createServer((request, response) => {
  if (request.url === '/never') return;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end('<!doctype html><title>Локальный сайт</title><body style="background:#fc0;font-family:sans-serif"><h1>Проверка скриншота</h1></body>');
});
await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
const siteUrl = 'http://127.0.0.1:' + site.address().port;
const fixture = await readFile('tests/fixtures/legacy-export.json', 'utf8');
const png = await readFile('public/images/icon128.png');
const dataUrl = 'data:image/png;base64,' + png.toString('base64');
let currentContext;

async function browserContext(name, profile) {
  if (name === 'chrome') {
    const extension = resolve('.output/chrome-mv3');
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true,
      args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
      viewport: { width: 1280, height: 800 },
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    return { context, url: worker.url().replace('background.js', 'newtab.html') };
  }
  throw new Error('Use Firefox native Marionette driver.');
}
async function data(page) {
  return page.evaluate(async () => {
    const open = indexedDB.open('SpeedDialX');
    const db = await new Promise((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    const transaction = db.transaction(['bookmarks', 'assets'], 'readonly');
    const all = transaction.objectStore('bookmarks').getAll();
    const bg = transaction.objectStore('assets').get('background');
    const [tabs, background] = await Promise.all([all, bg].map(request => new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    })));
    db.close();
    return {
      tabs: tabs.sort((a,b) => a.position - b.position).map(tab => ({ id: tab.id, title: tab.title, url: tab.url, position: tab.position, thumbnail: tab.thumbnail?.size ?? 0 })),
      background: background?.blob.size ?? 0,
    };
  });
}
async function ready(page) {
  await expect(page.getByRole('button', { name: 'Настройки', exact: true })).toBeEnabled();
}
async function settings(page) {
  await page.locator('.page').click({button:'right',position:{x:5,y:5}});
  await page.getByRole('menuitem', { name: 'Настройки', exact: true }).click();
  return page.getByRole('complementary', { name: 'Настройки' });
}
async function contextAction(page, index, action) {
  await page.locator('.bookmark').nth(index).click({ button: 'right' });
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}
async function scenario(name) {
  const profile = resolve(root, name + '-' + randomUUID());
  const launched = await browserContext(name, profile);
  currentContext = launched.context;
  let context = launched.context;
  let page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let accept = true;
  page.on('dialog', dialog => accept ? dialog.accept() : dialog.dismiss());
  await page.goto(launched.url, { waitUntil: 'domcontentloaded' });
  await ready(page);
  expect((await data(page)).tabs).toEqual([]);
  results.push(name + ': clean newtab and actual extension runtime');
  await page.locator('.page').click({button:'right',position:{x:5,y:5}});
  const menu = page.getByRole('menu'); const firstItem=page.getByRole('menuitem').first();
  await expect(menu).toBeFocused();
  await expect.poll(()=>firstItem.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await firstItem.evaluate(e=>getComputedStyle(e).fontFamily)).toContain('Helvetica');
  await menu.press('ArrowUp');await expect(page.getByRole('menuitem',{name:'Настройки',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowDown');await expect(firstItem).toBeFocused();
  await page.getByRole('menuitem',{name:'Настройки',exact:true}).hover();
  await expect(page.locator('.keyboard-active')).toHaveCount(0);
  await page.mouse.move(0,0);
  await expect.poll(()=>firstItem.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);
  await page.getByRole('combobox').click();
  expect(await page.getByRole('combobox').evaluate(e=>getComputedStyle(e).outlineStyle)).toBe('none');
  results.push(name + ': menu starts unselected; keyboard/mouse focus and font verified');

  // Capture a real local HTTP page through the extension background.
  await page.locator('.page').click({button:'right',position:{x:5,y:5}});
  await page.getByRole('menuitem', { name: 'Новая закладка', exact: true }).click();
  await page.getByLabel('Адрес сайта', { exact: true }).fill(siteUrl);
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
  await ready(page);
  let stored = await data(page);
  expect(stored.tabs[0].thumbnail).toBeGreaterThan(0);
  expect(stored.tabs[0].title).toBe('Локальный сайт');
  expect(context.pages().filter(p => p.url().startsWith(siteUrl))).toHaveLength(0);
  await page.screenshot({ path: resolve(root, name + '-capture.png') });
  const paired = await page.evaluate(async url => {
    const api = globalThis.browser ?? chrome;
    const before = (await api.tabs.query({})).map(tab => tab.id).sort();
    const capture = requestId => new Promise((resolve, reject) => {
      const port = api.runtime.connect({ name: 'speed-dial-capture' });
      const timeout = setTimeout(() => { port.disconnect(); reject(new Error('capture pair timeout')); }, 15000);
      port.onMessage.addListener(response => { clearTimeout(timeout); port.disconnect(); resolve({ id: response.requestId, title: response.title, bytes: response.thumbnail?.length, error: response.error }); });
      port.postMessage({ type: 'capture', requestId, url });
    });
    const captures = await Promise.all([capture('pair-a'), capture('pair-b')]);
    const after = (await api.tabs.query({})).map(tab => tab.id).sort();
    return { before, after, captures };
  }, siteUrl);
  expect(paired.after).toEqual(paired.before);
  expect(paired.captures.map(result => result.id)).toEqual(['pair-a', 'pair-b']);
  expect(paired.captures.every(result => !result.error && result.title === 'Локальный сайт' && result.bytes > 0)).toBe(true);
  results.push(name + ': real captureVisibleTab, paired queue responses, metadata and cleanup');

  await contextAction(page, 0, 'Изменить');
  await page.getByLabel('Заголовок', { exact: true }).fill('Свой заголовок <script>alert(1)</script>');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await ready(page);
  await contextAction(page, 0, 'Обновить эскиз');
  await ready(page);
  expect((await data(page)).tabs[0].title).toBe('Свой заголовок <script>alert(1)</script>');
  expect(await page.locator('.bookmark script').count()).toBe(0);
  const newPagePromise = context.waitForEvent('page');
  await contextAction(page, 0, 'Открыть в новой вкладке');
  const opened = await newPagePromise;
  await opened.waitForURL(siteUrl + '/');
  await opened.close();
  await page.bringToFront();
  await page.locator('.bookmark').nth(0).click();
  await page.waitForURL(siteUrl + '/');
  await page.goto(launched.url); await ready(page);
  results.push(name + ': edit/refresh preserve title; links open in current/new tab; safe text');

  // A hung page reaches the actual 20 second timeout and allows saving without capture.
  await page.locator('main').click({ button: 'right', position: { x: 8, y: 250 } });
  await page.getByRole('menuitem', { name: 'Новая закладка' }).click();
  await page.getByLabel('Адрес сайта', { exact: true }).fill(siteUrl + '/never');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохранить без эскиза' })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Сохранить без эскиза' }).click();
  await ready(page);
  expect((await data(page)).tabs).toHaveLength(2);
  results.push(name + ': timeout and explicit fallback without screenshot');

  await page.locator('.bookmark').nth(0).dragTo(page.locator('.bookmark').nth(1));
  await ready(page);
  expect((await data(page)).tabs.map(tab => tab.position)).toEqual([1, 2]);
  expect((await data(page)).tabs[1].title).toContain('Свой заголовок');
  await page.reload(); await ready(page);
  expect((await data(page)).tabs[1].title).toContain('Свой заголовок');
  results.push(name + ': drag/drop order survives reload');

  accept = false;
  await contextAction(page, 0, 'Удалить');
  expect((await data(page)).tabs).toHaveLength(2);
  accept = true;
  await contextAction(page, 0, 'Удалить'); await ready(page);
  expect((await data(page)).tabs).toHaveLength(1);

  let panel = await settings(page);
  await panel.getByLabel('Ширина (%)', { exact: true }).fill('80');
  await panel.getByLabel('Количество столбцов', { exact: true }).fill('4');
  await panel.getByLabel('Расстояние (px)', { exact: true }).fill('0');
  await panel.getByLabel('Центрировать по вертикали').check();
  await panel.getByLabel('Показать кнопку «+»').check();
  await panel.getByLabel('Изменить фон').setInputFiles({ name: 'background.png', mimeType: 'image/png', buffer: png });
  await panel.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await ready(page);
  await expect(page.locator('.add-card')).toBeVisible();
  expect((await data(page)).background).toBe(png.length);
  await page.reload(); await ready(page);
  expect((await data(page)).background).toBe(png.length);
  results.push(name + ': settings, false booleans, zero gap and persisted background');

  panel = await settings(page); await panel.getByRole('button', { name: 'Экспорт', exact: true }).click();
  const exported = JSON.parse(await page.getByLabel('JSON', { exact: true }).inputValue());
  expect(exported.settings.space).toBe(0);
  expect(exported.settings.background).toBe(dataUrl);
  expect(exported.tabs[0].thumbnail).toBe('');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Сохранить в файл' }).click();
  expect((await download).suggestedFilename()).toBe('export.json');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  results.push(name + ': JSON export, download and background round trip');

  panel = await settings(page); await panel.getByRole('button', { name: 'Импорт', exact: true }).click();
  await page.getByLabel('JSON', { exact: true }).fill('broken JSON');
  await page.getByRole('button', { name: 'Импортировать' }).click();
  await expect(page.getByRole('alert')).toContainText('Некорректный JSON');
  expect((await data(page)).tabs).toHaveLength(1);
  await page.getByLabel('Выберите JSON-файл').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(fixture) });
  accept = false;
  await page.getByRole('button', { name: 'Импортировать' }).click();
  expect((await data(page)).tabs).toHaveLength(1);
  accept = true;
  await page.getByRole('button', { name: 'Импортировать' }).click();
  await ready(page);
  expect((await data(page)).tabs).toHaveLength(2);
  expect((await data(page)).background).toBe(0);
  await expect(page.locator('.add-card')).toHaveCount(0);
  results.push(name + ': invalid import and cancellation preserve data; legacy file restores fields');

  for (const [width, height] of [[360,800], [1280,800], [1920,1080]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: resolve(root, name + '-' + width + '.png') });
  }
  results.push(name + ': screenshots and overflow checks at 360/1280/1920');

  // Deterministic UI keyboard test, followed by a separate live endpoint probe.
  await page.route('https://suggest.yandex.ru/**', route => route.fulfill({ json: ['тест', ['первый', 'второй']] }));
  await expect(page.locator('dialog')).toHaveCount(0);
  await page.bringToFront();
  const search = page.getByRole('combobox');
  await search.click();
  await search.fill('тест');
  await expect(page.getByRole('option')).toHaveCount(2);
  await search.press('ArrowDown'); await search.press('ArrowDown');
  await expect(page.getByRole('option', { selected: true })).toHaveText('второй');
  await expect(search).toHaveValue('второй');
  await search.press('ArrowDown');
  await expect(search).toHaveValue('первый');
  await page.getByRole('option').last().hover();
  await page.mouse.move(0, 0);
  await expect(page.getByRole('option', { selected: true })).toHaveCount(0);
  await search.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.unroute('https://suggest.yandex.ru/**');
  const live = await page.evaluate(async () => {
    const probe = async url => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10000), credentials: 'include' });
        const json = await response.json();
        return { status: response.status, suggestions: Array.isArray(json[1]) ? json[1].length : undefined, mailStatus: json.status };
      } catch (error) { return { error: String(error) }; }
    };
    return {
      yandex: await probe('https://suggest.yandex.ru/suggest-sl?part=speed%20dial'),
      mail: await probe('https://portal.mail.ru/NaviData?mac=1'),
    };
  });
  results.push(name + ': live network ' + JSON.stringify(live));
  let mailResponse = { data: { mail_cnt: '3' } };
  await page.evaluate(() => {
    const originalFetch = window.fetch;
    window.fetch = function(input, options) {
      if (String(input).startsWith('https://portal.mail.ru/')) window.__mailCredentials = options?.credentials;
      return originalFetch.apply(this, arguments);
    };
  });
  await page.route('https://portal.mail.ru/**', route => route.fulfill({ json: mailResponse }));
  panel = await settings(page);
  await panel.getByLabel('E-mail Mail.ru').fill('test@example.invalid');
  await panel.getByRole('button', { name: 'Сохранить', exact: true }).click(); await ready(page);
  await expect(page.locator('.badge')).toHaveText('3');
  expect(await page.evaluate(() => window.__mailCredentials), 'Mail fetch must request session credentials').toBe('include');
  mailResponse = { data: { mail_cnt: '0' } };
  panel = await settings(page);
  await panel.getByRole('button', { name: 'Сохранить', exact: true }).click(); await ready(page);
  await expect(page.locator('.badge')).toHaveCount(0);
  mailResponse = { status: 'noauth', data: {} };
  panel = await settings(page);
  await panel.getByRole('button', { name: 'Сохранить', exact: true }).click(); await ready(page);
  await expect(page.locator('.mail')).toHaveAttribute('title', /Нет авторизации Mail.ru/);
  await expect(page.locator('.badge')).toHaveCount(0);
  panel = await settings(page);
  await panel.getByLabel('E-mail Mail.ru').fill('');
  await panel.getByRole('button', { name: 'Сохранить', exact: true }).click(); await ready(page);
  await expect(page.locator('.mail')).toHaveCount(0);
  await page.unroute('https://portal.mail.ru/**');
  results.push(name + ': Mail UI string 3/0/noauth/empty email and credentials include (synthetic responses, no personal account)');

  panel = await settings(page);
  await panel.getByLabel('Изменить фон').setInputFiles({ name: 'background.png', mimeType: 'image/png', buffer: png });
  await panel.getByRole('button', { name: 'Сохранить', exact: true }).click(); await ready(page);
  const beforeRestart = await data(page);
  await context.close(); currentContext = undefined;
  const reopened = await browserContext(name, profile);
  context = reopened.context; currentContext = context;
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => accept ? dialog.accept() : dialog.dismiss());
  await page.goto(reopened.url); await ready(page);
  expect(await data(page)).toEqual(beforeRestart);
  results.push(name + ': browser restart retains bookmarks, order, settings and background');

  panel = await settings(page);
  await panel.getByRole('button', { name: 'Удалить все данные' }).click();
  await ready(page);
  expect((await data(page)).tabs).toHaveLength(0);
  expect((await data(page)).background).toBe(0);
  await expect(page.locator('.add-card')).toHaveCount(0);
  expect(errors).toEqual([]);
  results.push(name + ': reset and no unhandled JS errors');
  await context.close(); currentContext = undefined;

  // Close and relaunch the browser with the same isolated profile, not just reload.
  const restarted = await browserContext(name, profile);
  currentContext = restarted.context;
  page = await restarted.context.newPage();
  await page.goto(restarted.url, { waitUntil: 'domcontentloaded' }); await ready(page);
  expect((await data(page)).tabs).toHaveLength(0);
  await restarted.context.close(); currentContext = undefined;
  results.push(name + ': browser restart persists reset state');
}
try {
  for (const browser of process.argv.includes('--chrome-only') ? ['chrome'] : process.argv.includes('--firefox-only') ? ['firefox'] : ['chrome', 'firefox']) {
    console.log('Smoke:', browser);
    if (browser === 'firefox') await firefoxSmoke(siteUrl, results); else await scenario(browser);
  }
} finally {
  await currentContext?.close();
  site.closeAllConnections();
  await new Promise(resolve => site.close(resolve));
  await writeFile(resolve(root, 'results.json'), JSON.stringify(results, null, 2));

}
