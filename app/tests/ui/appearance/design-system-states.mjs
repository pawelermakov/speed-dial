import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runSharedScenario, startupFixture } from '../../browser/helpers/extension-driver.mjs';
import { uiAssertions } from '../../browser/helpers/ui-assertions.mjs';

await runSharedScenario(
  'design-system-states',
  async (browser, driver) => {
    const {
      evaluate,
      poll,
      releaseApp,
      reload,
      resize,
      click,
      clickAt,
      fill,
      key,
      movePointer,
      mockFetch,
      media,
      errors,
      shot,
      caseDone,
    } = driver;
    const ui = uiAssertions(driver),
      gear = 'button[aria-label="Настройки"]';
    const fixture = () =>
      mockFetch('suggest.yandex.ru', {
        body: JSON.stringify([
          'test',
          ['A long search suggestion for layout and overflow', 'A second search suggestion'],
        ]),
      });
    await fixture();
    await releaseApp();
    const png = Array.from(await readFile('public/images/icon128.png'));
    await evaluate(async (bytes) => {
      const api = globalThis.browser ?? chrome;
      const { rootFolderId } = await api.storage.local.get('rootFolderId');
      for (const title of ['Работа и длинное название папки', 'Личное', 'Путешествия'])
        await api.bookmarks.create({ parentId: rootFolderId, title });
      await api.bookmarks.create({
        parentId: rootFolderId,
        title: 'A very long text tile title',
        url: 'https://text.example/',
      });
      const row = await api.bookmarks.create({
        parentId: rootFolderId,
        title: 'A long screenshot caption with a favicon and overflow',
        url: 'https://image.example/',
      });
      const db = await new Promise((resolve) => {
        const request = indexedDB.open('SpeedDialX');
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('tileAssets', 'readwrite');
        tx.objectStore('tileAssets').put({
          bookmarkId: row.id,
          url: row.url,
          thumbnail: new Blob([Uint8Array.from(bytes)], { type: 'image/png' }),
          favicon: new Blob([Uint8Array.from(bytes)], { type: 'image/png' }),
        });
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
      db.close();
      const { settings } = await api.storage.local.get('settings');
      await api.storage.local.set({
        settings: { value: { ...settings?.value, addButton: true } },
      });
    }, png);

    await reload();
    await fixture();
    await releaseApp();
    await ui.count('.bookmark-title', 1);
    await evaluate(() => {
      const style = document.createElement('style');
      style.textContent =
        '.page-background {opacity:1!important;background:var(--audit-wallpaper,#000)!important}';
      document.head.append(style);
    });
    const css = (selector, property) =>
      ui.node(ui.nth(selector, 0), (e, p) => getComputedStyle(e).getPropertyValue(p), property);
    const alpha = async (selector) => {
      const bg = await css(selector, 'background-color');
      return bg.startsWith('rgba') ? Number(bg.match(/[\d.]+/g).at(-1)) : 1;
    };
    const clear = async () => {
      await fill('.search input', '');
      await ui.node('.search input', (e) => e.blur());
      await movePointer(0, 0);
    };
    for (const width of [320, 360, 768, 1024, 1280, 1920]) {
      await resize(width, width <= 360 ? 640 : 800);
      await ui.css(gear + ' svg', 'width', '20px');
      await ui.css(gear, 'height', '48px');
      await ui.css('.search', 'height', '48px');
      await ui.css('.folder-root', 'height', '48px');
      const sr = await ui.rect('.search'),
        tr = await ui.rect('.tools');
      assert(
        sr.y + sr.height <= tr.y || tr.y + tr.height <= sr.y || sr.x + sr.width <= tr.x,
        'header controls overlap',
      );
      for (const background of [
        '#fff',
        '#000',
        'repeating-conic-gradient(#000 0% 25%,#fff 0% 50%) 0/40px 40px',
      ]) {
        await ui.node('.page', (e, b) => e.style.setProperty('--audit-wallpaper', b), background);
        for (const selector of ['.settings-trigger', '.folder-tab', '.add-card']) {
          await ui.hover(ui.nth(selector, 0));
          await poll(() => alpha(selector)).toBeCloseTo(0.65, 2);
          if (['.settings-trigger', '.folder-tab'].includes(selector))
            await poll(() => alpha(selector)).toBeCloseTo(0.65, 2);
        }
        await shot(
          `${width}-${background === '#fff' ? 'light' : background === '#000' ? 'dark' : 'pattern'}-hover`,
        );
      }
      await ui.select('.search select', 'bookmarks');
      await ui.focus('.search input');
      await ui.attribute('.search input', 'role', 'searchbox');
      await ui.focused('.search input');
      await ui.visible('.folder-tabs');
      await shot(width + '-local-search');
      await ui.select('.search select', 'yandex');
      await fill('.search input', 'test');
      await ui.count('.suggestions [role=option]', 2);
      await ui.css('.suggestions', 'backdrop-filter', 'blur(12px) saturate(1.6)');
      await shot(width + '-suggestions');
      await clear();
      await click(gear);
      await ui.visible('.settings');
      await ui.css('.sync-account [role=status]', 'font-size', '16px');
      const inputs = await evaluate(
        () => document.querySelectorAll('.settings input[type=number]').length,
      );
      for (let i = 0; i < inputs; i++) {
        const input = ui.nth('.settings input[type=number]', i);
        await ui.css(input, 'width', '88px');
        await ui.css(input, 'height', '40px');
        await ui.css(input, 'backdrop-filter', 'none');
      }
      await ui.focus('button[aria-label="О синхронизации"]');
      await ui.visible('#sync-info');
      await ui.css('#sync-info', 'font-size', '14px');
      const tip = await ui.rect('#sync-info');
      assert(
        tip.x >= 0 &&
          tip.x + tip.width <= width &&
          tip.y >= 0 &&
          tip.y + tip.height <= (width <= 360 ? 640 : 800),
        'tooltip outside viewport',
      );
      await shot(width + '-settings-top');
      const data = await ui.byText('button', 'Управление данными');
      await ui.scroll(data);
      await movePointer(0, 0);
      await shot(width + '-settings-data');
      await click(data);
      await ui.css('dialog.modal-screen', 'opacity', '1');
      await ui.css('.modal', 'backdrop-filter', 'blur(12px) saturate(1.6)');
      await click('button[aria-label="Сбросить настройки и кэш"]');
      await shot(width + '-data');
      await click('button[aria-label="Закрыть"]');
      await ui.count('.data-management', 0);
      await ui.count('dialog', 0);
      const page = await ui.rect('.page');
      await clickAt(Math.floor(page.x + 2), Math.floor(page.y + (width <= 360 ? 600 : 760)), {
        button: 'right',
      });
      await click(await ui.byText('[role=menuitem]', 'Новая папка'));
      await ui.css('dialog.modal-screen', 'opacity', '1');
      await ui.text('label[for=folder-name]', 'Название папки');
      await fill('#folder-name', 'Папка');
      await ui.css('.modal .ui-button', 'height', '40px');
      await shot(width + '-folder');
      await click('button[aria-label="Закрыть"]');
      await ui.count('dialog', 0);
      await ui.attribute('.add-card', 'aria-label', 'Новая закладка');
      await click('.add-card');
      await ui.css('dialog.modal-screen', 'opacity', '1');
      await ui.focus('button[aria-label="О создании эскиза"]');
      await ui.visible('#bookmark-capture-info');
      await shot(width + '-bookmark-tooltip');
      await click('button[aria-label="Закрыть"]');
      await ui.count('dialog', 0);
      assert.equal(await evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      caseDone('states-' + width);
    }
    await media({ forcedColors: 'active', reducedMotion: 'reduce' });
    await key('Tab');
    await ui.focus(gear);
    await poll(() => ui.node(gear, (e) => getComputedStyle(e).outlineStyle)).not.toBe('none');
    await ui.hover(gear);
    await shot('forced-colors');
    assert.deepEqual(await errors(), []);
    caseDone('accessibility-media');
    console.log(
      'PASS ' +
        browser +
        ' interaction-state audit: six widths, backgrounds, search, settings, menus/dialogs, tooltips and accessibility media',
    );
  },
  { launchOptions: async (browser) => ({ extension: await startupFixture(browser), gated: true }) },
);
