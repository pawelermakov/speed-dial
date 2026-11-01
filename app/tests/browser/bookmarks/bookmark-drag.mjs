import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runSharedScenario } from '../helpers/extension-driver.mjs';
import { uiAssertions } from '../helpers/ui-assertions.mjs';

const setupFixture = async (bytes) => {
  const { rootFolderId } = await (globalThis.browser ?? chrome).storage.local.get('rootFolderId'),
    rows = [];
  for (let i = 0; i < 6; i++)
    rows.push(
      await (globalThis.browser ?? chrome).bookmarks.create({
        parentId: rootFolderId,
        title: 'Drag ' + i,
        url: 'https://drag' + i + '.example/',
      }),
    );
  const db = await new Promise((resolve) => {
    const r = indexedDB.open('SpeedDialX');
    r.onsuccess = () => resolve(r.result);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('tileAssets', 'readwrite');
    for (const row of rows)
      tx.objectStore('tileAssets').put({
        bookmarkId: row.id,
        url: row.url,
        thumbnail: new Blob([Uint8Array.from(bytes)], { type: 'image/png' }),
        favicon: new Blob([Uint8Array.from(bytes)], { type: 'image/png' }),
      });
    tx.oncomplete = resolve;
    tx.onerror = reject;
    tx.onabort = reject;
  });
  db.close();
  await (globalThis.browser ?? chrome).storage.local.set({
    settings: { value: { addButton: true, countColumns: 3 } },
  });
  return { root: rootFolderId, ids: rows.map((r) => r.id) };
};

const readOrder = (root) =>
  (globalThis.browser ?? chrome).bookmarks
    .getChildren(root)
    .then((rows) => rows.filter((r) => r.url).map((r) => r.id));

const beginSyntheticDrag = (el) => {
  window.dragSource = el;
  window.transfer = new DataTransfer();
  el.dispatchEvent(
    new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      dataTransfer: window.transfer,
    }),
  );
};

const refreshAsset = async ({ id, bytes }) => {
  const db = await new Promise((resolve) => {
    const r = indexedDB.open('SpeedDialX');
    r.onsuccess = () => resolve(r.result);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('tileAssets', 'readwrite'),
      store = tx.objectStore('tileAssets'),
      r = store.index('bookmarkId').get(id);
    r.onsuccess = () =>
      store.put({
        ...r.result,
        favicon: new Blob([Uint8Array.from(bytes)], { type: 'image/png' }),
        faviconUpdatedAt: Date.now(),
      });
    tx.oncomplete = resolve;
    tx.onerror = reject;
    tx.onabort = reject;
  });
  db.close();
  const channel = new BroadcastChannel('speed-dial-updates');
  channel.postMessage({ type: 'updated', assets: true });
  channel.close();
};

const finishAssetDrop = (el) => {
  const r = el.getBoundingClientRect();
  el.dispatchEvent(
    new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: window.transfer,
      clientX: r.right - 2,
      clientY: r.top + 20,
    }),
  );
  window.dragSource.dispatchEvent(
    new DragEvent('dragend', { bubbles: true, dataTransfer: window.transfer }),
  );
};

const observeFaviconSource = () => {
  window.nativeDragTarget = '';
  document.addEventListener(
    'dragstart',
    (event) => (window.nativeDragTarget = event.target.tagName),
    { once: true, capture: true },
  );
};

const readFaviconSource = () => window.nativeDragTarget;

const editExternal = (id) =>
  (globalThis.browser ?? chrome).bookmarks.update(id, { title: 'External edit must cancel' });

const finishStaleDrop = (el) => {
  const r = el.getBoundingClientRect();
  el.dispatchEvent(
    new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: window.transfer,
      clientX: r.right - 2,
      clientY: r.bottom - 2,
    }),
  );
  window.dragSource.dispatchEvent(
    new DragEvent('dragend', { bubbles: true, dataTransfer: window.transfer }),
  );
};

const finishTrailingDrop = (el) => {
  const r = el.querySelector('.add-card').getBoundingClientRect();
  el.dispatchEvent(
    new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: window.transfer,
      clientX: r.x + r.width / 2,
      clientY: r.y + r.height / 2,
    }),
  );
  window.dragSource.dispatchEvent(
    new DragEvent('dragend', { bubbles: true, dataTransfer: window.transfer }),
  );
};

await runSharedScenario(
  'bookmark-drag',
  async (browser, driver) => {
    const { evaluate, poll, ready, reload, dragTo, caseDone } = driver,
      ui = uiAssertions(driver);
    await ready();
    const bytes = Array.from(await readFile('public/images/icon128.png')),
      fixture = await evaluate(setupFixture, bytes);
    await reload();
    await ui.count('.bookmark', 6);
    await ui.count('.bookmark-title img', 6);
    const order = () => evaluate(readOrder, fixture.root),
      start = () => ui.node(ui.nth('.bookmark', 0), beginSyntheticDrag);
    const height = (await ui.rect('.bookmarks')).height;
    await start();
    await ui.count('.bookmark.dragging', 1);
    await ui.count('.add-card', 1);
    await ui.css('.add-card', 'visibility', 'hidden');
    assert.equal((await ui.rect('.bookmarks')).height, height);
    const icon = ui.nth('.bookmark-title img', 1),
      oldIcon = await ui.node(icon, (e) => e.getAttribute('src'));
    await evaluate(refreshAsset, { id: fixture.ids[1], bytes });
    await poll(() => ui.node(icon, (e) => e.getAttribute('src'))).not.toBe(oldIcon);
    await ui.count('.bookmark.dragging', 1);
    await ui.node(ui.nth('.bookmark', 2), finishAssetDrop);
    let expected = [fixture.ids[1], fixture.ids[2], fixture.ids[0], ...fixture.ids.slice(3)];
    await poll(order).toEqual(expected);
    caseDone('asset-refresh-and-grid-height');
    const resetTrace = () =>
      evaluate(() => {
        window.nativeDragTrace = [];
        if (!window.observeNativeDrag) {
          window.observeNativeDrag = true;
          for (const type of ['dragstart', 'drop', 'dragend'])
            document.addEventListener(
              type,
              (e) =>
                window.nativeDragTrace.push({
                  type,
                  trusted: e.isTrusted,
                  tag: e.target.tagName,
                  grid: e.target === document.querySelector('.bookmarks'),
                }),
              true,
            );
        }
      });
    const assertNative = async ({ drop = true, gap = false } = {}) => {
      const events = await evaluate(() => window.nativeDragTrace);
      assert.equal(events.filter((e) => e.type === 'dragstart').length, 1);
      assert.equal(events.filter((e) => e.type === 'dragend').length, 1);
      assert.equal(events.filter((e) => e.type === 'drop').length, drop ? 1 : 0);
      assert(
        events.every((e) => e.trusted),
        'native drag must use trusted browser input',
      );
      assert.equal(events.find((e) => e.type === 'dragstart').tag, 'A');
      if (gap)
        assert.equal(
          events.find((e) => e.type === 'drop').grid,
          true,
          'native gap drop must hit the grid',
        );
      await ui.count('.bookmark.dragging', 0);
      await ui.count('.bookmark.drop-target', 0);
    };
    const a = await ui.rect(ui.nth('.bookmark', 0)),
      b = await ui.rect(ui.nth('.bookmark', 1)),
      grid = await ui.rect('.bookmarks');
    await resetTrace();
    await dragTo('.bookmark:last-of-type', '.bookmarks', {
      targetPosition: { x: (a.x + a.width + b.x) / 2 - grid.x, y: a.y + a.height / 2 - grid.y },
    });
    expected = [expected[0], expected[5], ...expected.slice(1, 5)];
    await poll(order).toEqual(expected);
    await assertNative({ gap: true });
    caseDone('native-gap-drop');
    await evaluate(observeFaviconSource);
    const source = await ui.rect(ui.nth('.bookmark', 0)),
      image = await ui.rect(ui.nth('.bookmark-title img', 0)),
      target = await ui.rect(ui.nth('.bookmark', 5));
    await resetTrace();
    await dragTo('.bookmark:first-of-type', '.bookmark:last-of-type', {
      sourcePosition: { x: image.x + 8 - source.x, y: image.y + 8 - source.y },
      targetPosition: { x: target.width - 2, y: 20 },
    });
    expected = [...expected.slice(1), expected[0]];
    await poll(order).toEqual(expected);
    assert.equal(await evaluate(readFaviconSource), 'A');
    await assertNative();
    caseDone('native-favicon-drag');
    await resetTrace();
    await dragTo('.bookmark:first-of-type', '.bookmark:last-of-type', { cancel: true });
    await assertNative({ drop: false });
    assert.deepEqual(await order(), expected);
    caseDone('native-cancel');
    await start();
    await evaluate(editExternal, expected[2]);
    await ui.count('.bookmark.dragging', 0);
    await ui.node('.bookmarks', finishStaleDrop);
    assert.deepEqual(await order(), expected);
    caseDone('external-edit-cancels');
    await start();
    await ui.node('.bookmarks', finishTrailingDrop);
    expected = [...expected.slice(1), expected[0]];
    await poll(order).toEqual(expected);
    caseDone('trailing-slot-appends');
    console.log(
      'PASS ' +
        browser +
        ' bookmark drag: asset refresh/grid height, trusted native gap/favicon drops and cancellation, external edits and trailing slot',
    );
  },
  { timeout: 30000 },
);
