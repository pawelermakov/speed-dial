import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runSharedScenario } from '../../browser/helpers/extension-driver.mjs';
import { uiAssertions } from '../../browser/helpers/ui-assertions.mjs';

await runSharedScenario('appearance', async (browser, driver) => {
  const {
      evaluate,
      poll,
      ready,
      resize,
      click,
      clickAt,
      fill,
      key,
      setInputFiles,
      media,
      errors,
      shot,
      caseDone,
    } = driver,
    ui = uiAssertions(driver),
    gear = 'button[aria-label="Настройки"]';
  await ready();
  await evaluate(async () => {
    const api = globalThis.browser ?? chrome,
      { rootFolderId } = await api.storage.local.get('rootFolderId');
    for (let i = 0; i < 30; i++)
      await api.bookmarks.create({ parentId: rootFolderId, title: 'Folder ' + i });
    await api.bookmarks.create({
      parentId: rootFolderId,
      title: 'Example',
      url: 'https://example.test/',
    });
  });
  await ui.count('.folder-tab', 30);
  await ui.css('.search', 'height', '48px');
  for (const width of [320, 360, 1280, 1920])
    for (const background of ['none', 'light', 'dark', 'pattern']) {
      await resize(width, width < 481 ? 640 : 900);
      await click(gear);
      await ui.visible('.settings');
      if (background === 'none') {
        if (await evaluate(() => !!document.querySelector('button[aria-label="Удалить фон"]')))
          await click('button[aria-label="Удалить фон"]');
      } else {
        const buffer = Buffer.from(
          await evaluate((kind) => {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const c = canvas.getContext('2d');
            if (kind === 'pattern') {
              for (let y = 0; y < 16; y++)
                for (let x = 0; x < 16; x++) {
                  c.fillStyle = ['#000', '#fff', '#f00', '#00f', '#0f0'][(x + y) % 5];
                  c.fillRect(x * 32, y * 32, 32, 32);
                }
            } else {
              c.fillStyle = kind === 'light' ? '#fff' : '#000';
              c.fillRect(0, 0, 512, 512);
            }
            return canvas.toDataURL('image/png').split(',')[1];
          }, background),
          'base64',
        );
        const directory = resolve(
          '.browser-test',
          `appearance-file-${browser}-${crypto.randomUUID()}`,
        );
        await mkdir(directory, { recursive: true });
        const path = resolve(directory, background + '.png');
        await writeFile(path, buffer);
        await setInputFiles('input[aria-label="Изменить фон"]', path);
        await ui.visible('button[aria-label="Удалить фон"]');
      }
      await click('button[aria-label="Закрыть настройки"]');
      await ui.count('.settings', 0);
      await shot(`${width}-${background}-page`);
      assert.equal(await evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const search = await ui.rect('.search'),
        tools = await ui.rect('.tools');
      assert(
        search.y + search.height <= tools.y ||
          tools.y + tools.height <= search.y ||
          search.x + search.width <= tools.x,
      );
      await click(gear);
      await ui.visible('.settings');
      assert.deepEqual(
        await evaluate(() =>
          [...document.querySelectorAll('.settings legend')].map(
            (e) => e.textContent.trim().split('\n')[0],
          ),
        ),
        ['Оформление', 'Закладки', 'Сетка', 'Почта', 'Погода', 'Данные'],
      );
      await ui.css('.settings', 'backdrop-filter', 'blur(12px) saturate(1.6)');
      await ui.css(ui.nth('.settings input[type=number]', 0), 'backdrop-filter', 'none');
      await ui.css('.dial', 'filter', 'none');
      await ui.count('.settings-panel-enter-active', 0);
      await shot(`${width}-${background}-settings`);
      await click('button[aria-label="Закрыть настройки"]');
      await ui.count('.settings', 0);
      const page = await ui.rect('.page');
      await clickAt(Math.floor(page.x + 2), Math.floor(page.y + 600), { button: 'right' });
      await ui.visible('[role=menu]');
      const box = await ui.rect('[role=menu]');
      assert(box.x >= 0 && box.x + box.width <= width && box.y + box.height <= 900);
      await click(await ui.byText('[role=menuitem]', 'Новая папка'));
      await ui.css('.modal', 'border-radius', '24px');
      assert.equal(
        Math.round((await ui.rect('.modal')).width),
        Math.min(360, (await ui.node('.modal-screen', (e) => e.clientWidth)) - 32),
      );
      await ui.text('label[for=folder-name]', 'Название папки');
      await fill('#folder-name', 'Draft');
      await ui.css('dialog', 'opacity', '1');
      await ui.count('.modal-panel-enter-active', 0);
      await shot(`${width}-${background}-dialog`);
      await click('button[aria-label="Закрыть"]');
      await ui.count('dialog', 0);
      caseDone(`layout-${width}-${background}`);
    }
  await resize(640, 360);
  await evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await click(gear);
  const label = await ui.byText('.switch-control label', 'Показывать Mail.ru'),
    id = await ui.node(label, (e) => e.htmlFor),
    toggle = `input[id="${id}"]`;
  await ui.scroll(toggle);
  await ui.visible(toggle);
  await shot('zoom-200');
  await click('button[aria-label="Закрыть настройки"]');
  await ui.count('.settings', 0);
  caseDone('zoom-200');
  await media({ forcedColors: 'active', reducedMotion: 'reduce' });
  await key('Tab');
  await ui.focus(gear);
  await poll(() => ui.node(gear, (e) => getComputedStyle(e).outlineStyle)).not.toBe('none');
  assert.deepEqual(await errors(), []);
  caseDone('accessibility-media');
  console.log(
    'PASS ' +
      browser +
      ' appearance: 30 folders, four widths/backgrounds, surfaces, layers, native menus/dialogs/files, 200% zoom and accessibility media',
  );
});
