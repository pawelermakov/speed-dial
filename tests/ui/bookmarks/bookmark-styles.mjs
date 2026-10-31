import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runSharedScenario } from '../../browser/helpers/extension-driver.mjs';
import { uiAssertions } from '../../browser/helpers/ui-assertions.mjs';

await runSharedScenario('bookmark-styles', async (browser, driver) => {
  const {
    evaluate,
    ready,
    reload,
    resize,
    movePointer,
    pointerButton,
    click,
    key,
    media,
    errors,
    shot,
    caseDone,
  } = driver;
  const ui = uiAssertions(driver),
    add = '.add-card';
  await ready();
  const favicon = Array.from(await readFile('tests/fixtures/favicons/ya.ru.ico'));
  await evaluate(async (favicon) => {
    const api = globalThis.browser ?? chrome;
    const { rootFolderId } = await api.storage.local.get('rootFolderId');
    const rows = [];
    for (const [name, url] of [
      ['Text tile', 'https://text.example/'],
      ['A very long screenshot title that must truncate', 'https://preview.example/'],
      ['Missing favicon', 'https://missing.example/'],
      ['Broken favicon', 'https://broken.example/'],
    ])
      rows.push(await api.bookmarks.create({ parentId: rootFolderId, title: name, url }));
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d'),
      gradient = ctx.createLinearGradient(0, 0, 640, 360);
    gradient.addColorStop(0, '#dbeafe');
    gradient.addColorStop(1, '#2563eb');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = '#17212f';
    ctx.font = '36px Segoe UI';
    ctx.fillText('Preview example', 32, 72);
    const thumbnail = await new Promise((resolve) => canvas.toBlob(resolve));
    const db = await new Promise((resolve) => {
      const r = indexedDB.open('SpeedDialX');
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('tileAssets', 'readwrite'),
        store = tx.objectStore('tileAssets');
      for (let i = 1; i < rows.length; i++)
        store.put({
          bookmarkId: rows[i].id,
          url: rows[i].url,
          thumbnail,
          ...(i === 1
            ? { favicon: new Blob([Uint8Array.from(favicon)], { type: 'image/x-icon' }) }
            : i === 3
              ? { favicon: new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/png' }) }
              : {}),
        });
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    db.close();
    const { settings } = await api.storage.local.get('settings');
    await api.storage.local.set({
      settings: { value: { ...settings?.value, addButton: true } },
    });
  }, favicon);

  await reload();
  await ui.count('.bookmark-title', 3);
  await ui.count('.bookmark-icon', 2);
  await evaluate(() => {
    const style = document.createElement('style');
    style.textContent =
      '.page-background {opacity:1!important;background:var(--audit-background,#fff)!important}';
    document.head.append(style);
  });
  await ui.attribute(add, 'aria-label', 'Новая закладка');
  await ui.css(add, 'backdrop-filter', 'none');
  await ui.css(add, 'background-image', 'none');
  for (const width of [320, 360, 1280, 1920]) {
    await resize(width, 800);
    for (const [name, background] of [
      ['light', '#fff'],
      ['dark', '#000'],
      ['pattern', 'repeating-conic-gradient(#000 0% 25%,#fff 0% 50%) 0/32px 32px'],
    ]) {
      await ui.node('.page', (e, b) => e.style.setProperty('--audit-background', b), background);
      await movePointer(1, 1);
      const count = await evaluate(() => document.querySelectorAll('.bookmark,.add-card').length);
      for (let i = 0; i < count; i++) {
        const tile = ui.nth('.bookmark,.add-card', i),
          box = await ui.rect(tile);
        assert(
          Math.abs(box.height - (box.width * 9) / 16) < 0.1,
          'tile/add must have identical 16:9 border-box ratio',
        );
        await ui.css(tile, 'border-radius', '14px');
        await ui.css(tile, 'transform', 'none');
      }
      for (const tile of [ui.nth('.bookmark', 0), ui.nth('.bookmark', 1), add]) {
        await ui.scroll(tile);
        const before = await ui.rect(tile),
          color = await ui.node(tile, (e) => e.style.backgroundColor);
        await ui.hover(tile);
        await ui.css(
          tile,
          'box-shadow',
          tile === add
            ? 'rgba(12, 20, 34, 0.2) 0px 8px 28px 0px'
            : 'rgba(12, 20, 34, 0.2) 0px 8px 28px 0px, rgba(255, 255, 255, 0.22) 0px 0px 0px 1px inset',
        );
        assert.deepEqual(await ui.rect(tile), before);
        assert.equal(await ui.node(tile, (e) => e.style.backgroundColor), color);
        if (tile !== add) {
          await ui.node(tile, (e) =>
            e.addEventListener('click', (event) => event.preventDefault(), { once: true }),
          );
          await pointerButton(true);
          await ui.css(tile, 'box-shadow', 'rgba(12, 20, 34, 0.16) 0px 2px 6px 0px');
          await pointerButton(false);
        }
      }
      await ui.css(add, 'background-color', 'rgba(255, 255, 255, 0.65)');
      await pointerButton(true);
      await ui.css(add, 'background-color', 'rgba(255, 255, 255, 0.55)');
      await pointerButton(false);
      await ui.visible('dialog');
      await click('button[aria-label="Закрыть"]');
      await ui.count('dialog', 0);
      await ui.hover(ui.nth('.bookmark', 1));
      const caption = ui.nth('.bookmark-title', 0);
      for (const [property, value] of [
        ['background-color', 'rgba(255, 255, 255, 0.96)'],
        ['background-image', 'none'],
        ['border-top-width', '1px'],
        ['border-bottom-width', '0px'],
        ['backdrop-filter', 'none'],
        ['padding-top', '4px'],
        ['padding-bottom', '4px'],
      ])
        await ui.css(caption, property, value);
      const captionBox = await ui.rect(caption),
        parentBox = await ui.node(caption, (e) => {
          const r = e.parentElement.getBoundingClientRect();
          return { y: r.y, height: r.height };
        });
      assert(Math.abs(captionBox.height - 32.2) < 0.2, 'compact caption height');
      assert(
        Math.abs(captionBox.y + captionBox.height - parentBox.y - parentBox.height) < 0.1,
        'caption flush with tile bottom',
      );
      await ui.css(ui.nth('.bookmark-title img', 0), 'object-fit', 'contain');
      await ui.css(ui.nth('.bookmark-title img', 0), 'width', '16px');
      await ui.css(ui.nth('.bookmark-title .bookmark-title-label', 0), 'text-overflow', 'ellipsis');
      await shot(`${width}-${name}`);
      assert.equal(await evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      caseDone(`tiles-${width}-${name}`);
    }
  }
  await key('Tab');
  await ui.focus(ui.nth('.bookmark', 0));
  await key('Home');
  await ui.focused(ui.nth('.bookmark', 0));
  await ui.css(ui.nth('.bookmark', 0), 'outline-width', '2px');
  await ui.css(ui.nth('.bookmark', 0), 'box-shadow', 'rgba(12, 20, 34, 0.16) 0px 2px 6px 0px');
  await media({ forcedColors: 'active', reducedMotion: 'reduce' });
  await ui.css(add, 'transition-duration', '0s');
  await ui.css(ui.nth('.bookmark', 0), 'outline-width', '2px');
  assert.deepEqual(await errors(), []);
  caseDone('accessibility-media');
  console.log(
    'PASS ' +
      browser +
      ' bookmark audit: 4 widths/3 backgrounds, native hover/press, 16:9 geometry, captions, favicons, add/dialog, focus and accessibility media',
  );
});
