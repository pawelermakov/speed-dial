import assert from 'node:assert/strict';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export function textTilePrelude() {
  window.tileErrors = [];
  addEventListener('error', (event) => window.tileErrors.push(event.message));
  addEventListener('unhandledrejection', (event) => window.tileErrors.push(String(event.reason)));
  // Preserve the slow decoder fixture used to expose startup colour/preview races.
  const decode = HTMLImageElement.prototype.decode;
  HTMLImageElement.prototype.decode = async function () {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return decode.call(this);
  };
  window.tileColors = {};
  window.initialPreviews = [];
  const sample = () => {
    for (const tile of document.querySelectorAll('.bookmark')) {
      if (getComputedStyle(tile).visibility !== 'visible') continue;
      if (tile.href === 'https://image.example/') {
        window.initialPreviews.push({
          image: tile.style.backgroundImage,
          text: !!tile.querySelector('.tile-hostname'),
        });
      } else (window.tileColors[tile.href] ??= []).push(tile.style.backgroundColor);
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}

export function instrumentTextTileHtml(html) {
  assert.equal([...html.matchAll(/<head>/g)].length, 1, 'Exactly one document head is required');
  return html.replace('<head>', '<head><script src="/test-text-tile-prelude.js"></script>');
}

export async function textTileFixture(browser) {
  assert.ok(['chrome', 'firefox'].includes(browser));
  const source = resolve('.output', browser === 'chrome' ? 'chrome-mv3' : 'firefox-mv2');
  const destination = resolve('.browser-test', `text-tile-build-${browser}-${crypto.randomUUID()}`);
  await cp(source, destination, { recursive: true });
  const html = resolve(destination, 'newtab.html');
  await writeFile(html, instrumentTextTileHtml(await readFile(html, 'utf8')));
  await writeFile(resolve(destination, 'test-text-tile-prelude.js'), `(${textTilePrelude})();`);
  return destination;
}
