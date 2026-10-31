import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startupFixture } from './extension-driver.mjs';

export function startupMotionPrelude() {
  window.tileReveals = [];
  window.startupEvents = [];
  window.pauseTileReveal = false;
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (frames, options) {
    const animation = animate.call(this, frames, options);
    if (options?.id === 'bookmark-reveal') {
      window.tileReveals.push({
        frames,
        duration: options.duration,
        tile: this.matches('.bookmark,.add-card'),
      });
      if (window.pauseTileReveal) {
        animation.pause();
        animation.currentTime = options.duration - 0.001;
      }
    }
    return animation;
  };
  document.addEventListener('animationend', (e) => {
    if (e.animationName === 'startup-reveal') window.startupEvents.push(e.target.tagName);
  });
  const decode = HTMLImageElement.prototype.decode;
  HTMLImageElement.prototype.decode = function () {
    return decode
      .call(this)
      .then(() => new Promise((resolve) => (window.releaseStartupImage = resolve)));
  };
}

export async function startupMotionFixture(browser) {
  const destination = await startupFixture(browser),
    path = resolve(destination, 'newtab.html');
  const html = await readFile(path, 'utf8');
  assert.equal([...html.matchAll(/<head>/g)].length, 1);
  await writeFile(
    path,
    html.replace('<head>', '<head><script src="/test-startup-motion-prelude.js"></script>'),
  );
  await writeFile(
    resolve(destination, 'test-startup-motion-prelude.js'),
    `(${startupMotionPrelude})();`,
  );
  return destination;
}
