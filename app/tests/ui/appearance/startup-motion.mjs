import assert from 'node:assert/strict';
import { runSharedScenario } from '../../browser/helpers/extension-driver.mjs';
import { startupMotionFixture } from '../../browser/helpers/startup-motion-helpers.mjs';
import { uiAssertions } from '../../browser/helpers/ui-assertions.mjs';

await runSharedScenario(
  'startup-motion',
  async (browser, driver) => {
    const {
      evaluate,
      evaluatePeer,
      poll,
      releaseApp,
      ready,
      openPeer,
      closePeer,
      reload,
      resize,
      click,
      media,
      errors,
      shot,
      caseDone,
    } = driver;
    const ui = uiAssertions(driver),
      grid = '.bookmarks';
    await releaseApp();
    const scale = process.argv.includes('--fractional-scale') ? 1.25 : 1;
    assert.equal(await evaluate(() => devicePixelRatio), scale);
    await evaluate(async () => {
      let ready;
      const entered = new Promise((resolve) => (ready = resolve));
      void navigator.locks.request('speed-dial-data', () => {
        ready();
        return new Promise((resolve) => (window.releaseStartupData = resolve));
      });
      await entered;
    });
    await openPeer();
    try {
      await releaseApp('peer', { waitUntilReady: false });
      await poll(() =>
        evaluatePeer(() => {
          const e = document.querySelector('.page');
          return !!e && e.getBoundingClientRect().width > 0;
        }),
      ).toBe(true);
      assert.equal(
        await evaluatePeer(() => document.querySelector('.dial').classList.contains('is-loaded')),
        false,
      );
      assert.equal(
        await evaluatePeer(() => document.querySelector('.bookmark-area').textContent.trim()),
        '',
      );
      assert.equal(
        await evaluatePeer(() => document.querySelector('.bookmark-area').children.length),
        0,
      );
      assert.equal(await evaluatePeer(() => document.querySelectorAll('.surface-empty').length), 0);
      await shot('pending-startup', { peer: true, waitForAnimations: false });
    } finally {
      await evaluate(() => window.releaseStartupData());
    }
    await ready('peer');
    await closePeer();
    caseDone('pending-peer');
    const fixture = await evaluate(async () => {
      const api = globalThis.browser ?? chrome;
      const { rootFolderId } = await api.storage.local.get('rootFolderId');
      const row = await api.bookmarks.create({
        parentId: rootFolderId,
        title: 'Startup tile',
        url: 'https://example.com/',
      });
      const folder = await api.bookmarks.create({
        parentId: rootFolderId,
        title: 'Startup folder',
      });
      await api.bookmarks.create({
        parentId: folder.id,
        title: 'Folder tile',
        url: 'https://folder.example/',
      });
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 1920, 1080);
      ctx.fillStyle = '#17212f';
      for (let x = 0; x < 1920; x += 5) ctx.fillRect(x, 0, 2, 1080);
      ctx.font = '24px Segoe UI';
      ctx.fillText('Sharp screenshot sample 0123456789', 20, 40);
      const thumbnail = await new Promise((r) => canvas.toBlob(r));
      const db = await new Promise((r) => {
        const req = indexedDB.open('SpeedDialX');
        req.onsuccess = () => r(req.result);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('tileAssets', 'readwrite');
        tx.objectStore('tileAssets').put({ bookmarkId: row.id, url: row.url, thumbnail });
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
      db.close();
      return row.id;
    });

    const releaseImage = async () => {
      await poll(() => evaluate(() => typeof window.releaseStartupImage)).toBe('function');
      await evaluate(() => {
        const release = window.releaseStartupImage;
        delete window.releaseStartupImage;
        release();
      });
    };
    const restart = async () => {
      await reload();
      await releaseApp('self', { waitUntilReady: false });
    };
    const childCount = () =>
      evaluate(() => document.querySelectorAll('.bookmarks > a,.bookmarks > button').length);
    await restart();
    await poll(() => evaluate(() => typeof window.releaseStartupImage)).toBe('function');
    await ui.css(grid, 'visibility', 'hidden');
    assert.equal(await evaluate(() => window.tileReveals.length), 0);
    await releaseImage();
    await ui.css(grid, 'visibility', 'visible');
    const tileCount = await childCount();
    assert.deepEqual(await evaluate(() => window.tileReveals), []);
    await ui.css('header', 'opacity', '1');
    await ui.css('header', 'animation-name', 'none');
    await ui.css('.bookmark-toolbar', 'animation-name', 'none');
    await ui.css('.bookmark', 'opacity', '1');
    await ui.css(grid, 'opacity', '1');
    await ui.css(grid, 'animation-name', 'none');
    assert.deepEqual(await evaluate(() => window.startupEvents), []);
    caseDone('decode-startup');
    const folder = 'button.folder-tab[title="Startup folder"]';
    await click(folder);
    await ui.attribute('.bookmark', 'href', 'https://folder.example/');
    const folderCount = await childCount();
    await poll(() => evaluate(() => window.tileReveals.length)).toBe(folderCount);
    for (const reveal of await evaluate(() => window.tileReveals))
      assert.deepEqual(reveal, {
        frames: [{ opacity: 0 }, { opacity: 1 }],
        duration: 150,
        tile: true,
      });
    await click('.folder-root');
    await releaseImage();
    await ui.css(grid, 'visibility', 'visible');
    await poll(() => evaluate(() => window.tileReveals.length)).toBe(tileCount + folderCount);
    const count = await evaluate(() => window.tileReveals.length);
    await click('.folder-root');
    assert.equal(await evaluate(() => window.tileReveals.length), count);
    await evaluate(
      (id) =>
        (globalThis.browser ?? chrome).bookmarks.update(id, { title: 'Renamed startup tile' }),
      fixture,
    );
    await ui.attribute('.bookmark', 'title', 'Renamed startup tile — https://example.com/');
    assert.equal(await evaluate(() => window.tileReveals.length), count);
    assert.equal(await evaluate(() => window.startupEvents.length), 0);
    caseDone('folder-reveal-metadata');
    for (const width of [360, 1280, 1920]) {
      await resize(width, 800);
      await evaluate(() => {
        window.pauseTileReveal = true;
      });
      await click(folder);
      await ui.attribute('.bookmark', 'href', 'https://folder.example/');
      await click('.folder-root');
      await releaseImage();
      await ui.css(grid, 'visibility', 'visible');
      const tile = ui.nth('.bookmark', 0);
      await poll(() =>
        ui.node(tile, (e) =>
          e.getAnimations().some((a) => a.id === 'bookmark-reveal' && a.playState === 'paused'),
        ),
      ).toBe(true);
      const before = await ui.rect(tile);
      await ui.css(grid, 'opacity', '1');
      const clip = {
        x: Math.ceil(before.x) + 12,
        y: Math.ceil(before.y) + 12,
        width: Math.floor(before.width) - 24,
        height: Math.max(8, Math.floor(before.height) - 64),
      };
      const during = await shot(`${width}-during`, { clip, waitForAnimations: false });
      await evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.id === 'bookmark-reveal')
          .forEach((a) => a.finish()),
      );
      const after = await shot(`${width}-after`, { clip, waitForAnimations: false });
      assert.deepEqual(await ui.rect(tile), before);
      assert.equal(during.readUInt32BE(16), after.readUInt32BE(16));
      assert.equal(during.readUInt32BE(20), after.readUInt32BE(20));
      const delta = await evaluate(
        async ([a, b]) => {
          const read = async (bytes) => {
            const bitmap = await createImageBitmap(
              new Blob([Uint8Array.from(bytes)], { type: 'image/png' }),
            );
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          };
          const x = await read(a),
            y = await read(b);
          let changed = 0,
            max = 0;
          for (let i = 0; i < x.length; i += 4) {
            let difference = 0;
            for (let c = 0; c < 3; c++)
              difference = Math.max(difference, Math.abs(x[i + c] - y[i + c]));
            if (difference > 1) changed++;
            max = Math.max(max, difference);
          }
          return { changed, max };
        },
        [Array.from(during), Array.from(after)],
      );
      assert.equal(
        delta.changed,
        0,
        `screenshot detail changed at ${width}: ${JSON.stringify(delta)}`,
      );
      caseDone('bitmap-' + width);
    }
    await restart();
    await releaseImage();
    await ui.css(grid, 'visibility', 'visible');
    await evaluate(() => {
      window.pauseTileReveal = true;
    });
    await click(folder);
    await ui.attribute('.bookmark', 'href', 'https://folder.example/');
    await poll(() =>
      ui.node(grid, (e) =>
        e.getAnimations({ subtree: true }).some((a) => a.id === 'bookmark-reveal'),
      ),
    ).toBe(true);
    await media({ reducedMotion: 'reduce' });
    await poll(() => ui.node(grid, (e) => e.getAnimations({ subtree: true }).length)).toBe(0);
    await restart();
    await releaseImage();
    await ui.css(grid, 'visibility', 'visible');
    await ui.css(grid, 'opacity', '1');
    assert.deepEqual(await evaluate(() => window.tileReveals), []);
    assert.deepEqual(await evaluate(() => window.startupEvents), []);
    await click(folder);
    await ui.attribute('.bookmark', 'href', 'https://folder.example/');
    assert.deepEqual(await evaluate(() => window.tileReveals), []);
    assert.deepEqual(await errors(), []);
    caseDone('reduced-motion');
    console.log(
      'PASS ' +
        browser +
        ' startup: pending peer, decode readiness, instant startup, folder reveals, bitmap detail at three widths and reduced motion',
    );
  },
  {
    launchOptions: async (browser) => ({
      extension: await startupMotionFixture(browser),
      gated: true,
      deviceScaleFactor: process.argv.includes('--fractional-scale') ? 1.25 : 1,
    }),
  },
);
