import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startupFixture } from './extension-driver.mjs';

export function wallpaperPrelude() {
  window.wallpaperErrors = [];
  addEventListener('error', (event) => window.wallpaperErrors.push(event.message));
  addEventListener('unhandledrejection', (event) =>
    window.wallpaperErrors.push(String(event.reason)),
  );
  const decode = HTMLImageElement.prototype.decode;
  HTMLImageElement.prototype.decode = function () {
    const decoded = decode.call(this);
    if (
      this.src.startsWith('blob:') &&
      window.holdWallpaperDecode &&
      !window.wallpaperDecodeReleased
    )
      return decoded.then(
        () =>
          new Promise((resolve) => {
            (window.wallpaperDecodeWaiters ??= []).push(resolve);
            window.releaseWallpaperDecode = () => {
              window.wallpaperDecodeReleased = true;
              window.wallpaperDecodeWaiters.splice(0).forEach((done) => done());
            };
          }),
      );
    return decoded;
  };
}

export function instrumentWallpaperHtml(html) {
  assert.equal([...html.matchAll(/<head>/g)].length, 1, 'Exactly one document head is required');
  return html.replace('<head>', '<head><script src="/test-wallpaper-prelude.js"></script>');
}

export async function wallpaperFixture(browser) {
  const destination = await startupFixture(browser);
  const path = resolve(destination, 'newtab.html');
  await writeFile(path, instrumentWallpaperHtml(await readFile(path, 'utf8')));
  await writeFile(resolve(destination, 'test-wallpaper-prelude.js'), `(${wallpaperPrelude})();`);
  return destination;
}
