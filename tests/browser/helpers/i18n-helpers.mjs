import assert from 'node:assert/strict';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export function observeStartupLanguage() {
  window.startupLanguages = [];
  new MutationObserver(() => {
    const gear = document.querySelector('.settings-trigger');
    if (
      gear &&
      getComputedStyle(gear).visibility === 'visible' &&
      window.startupLanguages.length < 100
    )
      window.startupLanguages.push(gear.title);
  }).observe(document, { childList: true, subtree: true, characterData: true, attributes: true });
}

export function validateStartupLanguages(values, expected) {
  assert.ok(Array.isArray(values) && values.length > 0, 'Startup language trace must not be empty');
  assert.ok(
    Array.from(values).every((value) => value === expected),
    'No wrong-language startup observation',
  );
}

export function instrumentLanguageHtml(html) {
  const entries = [...html.matchAll(/<script type="module"[^>]*src="[^"]+"[^>]*><\/script>/g)];
  assert.equal(entries.length, 1, 'Exactly one production app entry is required');
  return html.replace(
    entries[0][0],
    '<script src="/test-language-observer.js"></script>' + entries[0][0],
  );
}

export async function i18nFixture(browser) {
  assert.ok(['chrome', 'firefox'].includes(browser));
  const source = resolve(`.output/${browser === 'chrome' ? 'chrome-mv3' : 'firefox-mv2'}`);
  const destination = resolve('.browser-test', `i18n-build-${browser}-${crypto.randomUUID()}`);
  await cp(source, destination, { recursive: true });
  const html = resolve(destination, 'newtab.html');
  await writeFile(html, instrumentLanguageHtml(await readFile(html, 'utf8')));
  await writeFile(
    resolve(destination, 'test-language-observer.js'),
    `(${observeStartupLanguage})();`,
  );
  return destination;
}
