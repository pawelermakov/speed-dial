// Manual same-machine comparison; requires genuine baseline production builds.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { resolve, relative, sep, dirname } from 'node:path';
import ts from 'typescript';
import { gzipSync } from 'node:zlib';
import { cpus, platform, arch } from 'node:os';
import { openExtension, selectedBrowsers } from '../browser/helpers/extension-driver.mjs';
const args = process.argv.slice(2),
  baselineArg = args.find((v) => v.startsWith('--baseline-dir=')),
  sampleArg = args.find((v) => v.startsWith('--samples='));
assert.ok(
  baselineArg,
  'Supply --baseline-dir=<directory containing old chrome-mv3/firefox-mv2 builds>',
);
assert.ok(
  args.every(
    (v) => v === baselineArg || v === sampleArg || ['--chrome-only', '--firefox-only'].includes(v),
  ),
  'Unknown argument',
);
const samples = sampleArg ? Number(sampleArg.slice('--samples='.length)) : 8;
assert.ok(
  Number.isSafeInteger(samples) && samples >= 2 && samples <= 30,
  'Use 2–30 paired samples',
);
const baseline = resolve(baselineArg.slice('--baseline-dir='.length)),
  directory = resolve('.browser-test', 'startup-benchmark-' + crypto.randomUUID());
await mkdir(directory, { recursive: true });
const settings = {
  language: 'ru',
  mailruEnabled: false,
  gmailEnabled: false,
  yandexMailEnabled: false,
  weatherEnabled: false,
  weatherCity: 'moscow',
  weatherProvider: 'yandex',
  theme: 'light',
  width: 100,
  countColumns: 6,
  space: 24,
  verticalCenter: false,
  addButton: false,
  bookmarkSearch: true,
  movieSearch: false,
  searchProvider: 'yandex',
};
const image = [...(await readFile('public/images/icon128.png'))],
  favicon = [...(await readFile('public/images/icon16.png'))];
function observeStartup(expected) {
  const result = (window.startupBenchmark = {
    containerVisibleMs: null,
    readyDomMs: null,
    readyFrameMs: null,
    expected,
  });
  let waiting = false;
  const visible = (e) =>
    e && getComputedStyle(e).visibility !== 'hidden' && e.getClientRects().length > 0;
  const check = () => {
    const page = document.querySelector('.page');
    if (!visible(page)) return;
    result.containerVisibleMs ??= performance.now();
    const gear = document.querySelector('.settings-trigger'),
      tiles = [...document.querySelectorAll('.bookmark')];
    if (
      !gear ||
      gear.disabled ||
      !document.querySelector('.folder-root') ||
      tiles.length !== expected
    )
      return;
    if (expected && !tiles.every((e) => e.style.backgroundImage.includes('blob:'))) return;
    if (
      ![...document.querySelectorAll('.bookmark img')].every(
        (e) => e.complete && e.naturalWidth > 0,
      )
    )
      return;
    result.readyDomMs ??= performance.now();
    result.viewport = { width: innerWidth, height: innerHeight };
    if (!waiting) {
      waiting = true;
      requestAnimationFrame(() => {
        result.readyFrameMs = performance.now();
        observer.disconnect();
      });
    }
  };
  const observer = new MutationObserver(check);
  observer.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });
  document.addEventListener('load', check, true);
  check();
}
async function instrument(source, destination, count) {
  await cp(source, destination, { recursive: true });
  const path = resolve(destination, 'newtab.html'),
    html = await readFile(path, 'utf8');
  assert.equal([...html.matchAll(/<head>/g)].length, 1);
  await writeFile(
    path,
    html.replace('<head>', '<head><script src="/test-startup-benchmark.js"></script>'),
  );
  await writeFile(
    resolve(destination, 'test-startup-benchmark.js'),
    `(${observeStartup})(${count});`,
  );
}
async function bundle(root) {
  const html = await readFile(resolve(root, 'newtab.html'), 'utf8'),
    entry = html.match(/<script type="module"[^>]*src="([^"]+)"/)[1].slice(1),
    entries = [];
  const scan = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const path = resolve(dir, e.name);
      if (e.isDirectory()) await scan(path);
      else if (/[.](js|css)$/.test(e.name)) {
        const bytes = await readFile(path);
        entries.push({
          path: relative(root, path).replaceAll('\\', '/'),
          bytes: bytes.length,
          gzip: gzipSync(bytes).length,
        });
      }
    }
  };
  await scan(root);
  const initial = new Set();
  const visit = async (path) => {
    if (initial.has(path)) return;
    initial.add(path);
    const file = resolve(root, path);
    const ast = ts.createSourceFile(
      path,
      await readFile(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const node of ast.statements) {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const value = node.moduleSpecifier.text;
        if (value.startsWith('.'))
          await visit(relative(root, resolve(dirname(file), value)).replaceAll('\\', '/'));
      }
    }
  };
  for (const match of html.matchAll(/<script[^>]*src="([^"]+)"/g)) await visit(match[1].slice(1));
  const initialStyles = [...html.matchAll(/<link[^>]*href="([^"]+[.]css)"/g)].map((match) =>
    match[1].slice(1),
  );
  const entryRow = entries.find((row) => row.path === entry);
  assert.ok(entryRow);
  return {
    entry: entryRow,
    initialJavaScript: [...initial].map((path) => entries.find((row) => row.path === path)),
    initialJavaScriptBytes: entries
      .filter((row) => initial.has(row.path))
      .reduce((sum, row) => sum + row.bytes, 0),
    initialCssBytes: entries
      .filter((row) => initialStyles.includes(row.path))
      .reduce((sum, row) => sum + row.bytes, 0),
    background: entries.find((row) => row.path === 'background.js'),
    javascriptBytes: entries
      .filter((row) => row.path.endsWith('.js'))
      .reduce((sum, row) => sum + row.bytes, 0),
    cssBytes: entries
      .filter((row) => row.path.endsWith('.css'))
      .reduce((sum, row) => sum + row.bytes, 0),
    files: entries,
  };
}
async function removeGenerated(path) {
  const target = resolve(path);
  assert.ok(target.startsWith(directory + sep), 'Only generated benchmark data may be removed');
  await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
async function clearCaches(profile) {
  for (const name of [
    'cache2',
    'startupCache',
    'shader-cache',
    'thumbnails',
    'ShaderCache',
    'GrShaderCache',
    'GraphiteDawnCache',
    'Default/Cache',
    'Default/Code Cache',
    'Default/GPUCache',
    'Default/Service Worker',
  ])
    await removeGenerated(resolve(profile, name));
}
async function prepare(browser, extension, profile, count) {
  const d = await openExtension(browser, { extension, profile });
  try {
    await d.evaluate(
      async ({ settings, count, image, favicon }) => {
        const api = globalThis.browser ?? globalThis.chrome,
          { rootFolderId } = await api.storage.local.get('rootFolderId');
        const root = await api.bookmarks.create({
            parentId: rootFolderId,
            title: 'Startup benchmark',
          }),
          items = [];
        for (let i = 0; i < count; i++)
          items.push(
            await api.bookmarks.create({
              parentId: root.id,
              title: 'Cached bookmark ' + i,
              url: 'https://benchmark-' + i + '.invalid/',
            }),
          );
        await api.storage.local.set({ rootFolderId: root.id, settings: { value: settings } });
        await api.storage.sync.set(
          Object.fromEntries(
            Object.entries(settings).map(([key, value]) => ['settings.v1.' + key, value]),
          ),
        );
        if (items.length) {
          const db = await new Promise((resolve, reject) => {
            const r = indexedDB.open('SpeedDialX');
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
          });
          await new Promise((resolve, reject) => {
            const tx = db.transaction('tileAssets', 'readwrite');
            for (const item of items)
              tx.objectStore('tileAssets').put({
                bookmarkId: item.id,
                url: item.url,
                thumbnail: new Blob([Uint8Array.from(image)], { type: 'image/png' }),
                favicon: new Blob([Uint8Array.from(favicon)], { type: 'image/png' }),
                faviconColor: '#345678',
                thumbnailUpdatedAt: 1234567890,
                faviconUpdatedAt: 1234567890,
              });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
          });
          db.close();
        }
        await api.runtime.sendMessage({ type: 'settings-sync', action: 'retry' });
      },
      { settings, count, image, favicon },
    );
    await d.reload();
    await d.poll(() => d.evaluate(() => document.querySelectorAll('.bookmark').length)).toBe(count);
    assert.deepEqual(await d.errors(), []);
  } finally {
    await d.close();
  }
}
const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b),
    p = (sorted.length - 1) * q,
    i = Math.floor(p);
  return sorted[i] + (sorted[Math.ceil(p)] - sorted[i]) * (p - i);
};
const results = {
  method: {
    samples,
    warmupPairs: 1,
    viewport: { width: 1280, height: 800 },
    fixture: 'empty or 24 direct bookmarks with 128px cached PNG thumbnails and 16px favicons',
    clock:
      'navigationStart to ready DOM and first requestAnimationFrame; new browser process for each sample',
    cache:
      'fresh copies of the same seeded profile; browser HTTP/code/startup caches removed; OS filesystem cache uncontrolled',
    order: 'baseline/current order alternates per paired round',
    instrumentation:
      'same external observer before production bootstrap; app entry and code are not delayed or modified',
    excludes:
      'installation, browser automation startup and profile copying are excluded from page metrics; launchAndDriverReadyMs includes driver overhead and is diagnostic only',
  },
  environment: { node: process.version, os: platform(), arch: arch(), cpu: cpus()[0]?.model },
  toolchain: Object.fromEntries(
    await Promise.all(
      ['wxt', 'vite', 'vue', 'dexie', 'vue-i18n', '@playwright/test'].map(async (name) => [
        name,
        JSON.parse(await readFile(resolve('node_modules', name, 'package.json'), 'utf8')).version,
      ]),
    ),
  ),
  bundles: {},
  runs: [],
  summary: [],
};
for (const browser of selectedBrowsers()) {
  const name = browser === 'chrome' ? 'chrome-mv3' : 'firefox-mv2';
  results.bundles[browser] = {
    baseline: await bundle(resolve(baseline, name)),
    current: await bundle(resolve('.output', name)),
  };
  for (const count of [0, 24]) {
    const kind = count ? 'cached-24' : 'empty',
      seed = resolve(directory, browser + '-' + kind + '-seed'),
      builds = {};
    for (const version of ['baseline', 'current']) {
      builds[version] = resolve(directory, browser + '-' + kind + '-' + version);
      await instrument(
        resolve(version === 'baseline' ? baseline : '.output', name),
        builds[version],
        count,
      );
    }
    const installed = resolve(directory, browser + '-' + kind + '-installed');
    await cp(builds.baseline, installed, { recursive: true });
    await prepare(browser, installed, seed, count);
    for (let round = -1; round < samples; round++) {
      const order = round % 2 === 0 ? ['baseline', 'current'] : ['current', 'baseline'];
      for (const version of order) {
        await cp(builds[version], installed, { recursive: true });
        const profile = resolve(directory, `profile-${browser}-${kind}-${version}-${round}`);
        await cp(seed, profile, { recursive: true });
        await clearCaches(profile);
        let d;
        try {
          const started = performance.now();
          d = await openExtension(browser, {
            extension: installed,
            profile,
            sizeBeforeNavigation: true,
          });
          const launchAndDriverReadyMs = performance.now() - started;
          await d.poll(() => d.evaluate(() => window.startupBenchmark?.readyFrameMs)).toBeTruthy();
          const metrics = await d.evaluate(() => ({
            viewport: window.startupBenchmark.viewport,
            entryScript: new URL(document.querySelector('script[type="module"]').src).pathname,
            containerVisibleMs: window.startupBenchmark.containerVisibleMs,
            readyDomMs: window.startupBenchmark.readyDomMs,
            readyFrameMs: window.startupBenchmark.readyFrameMs,
            paint: Object.fromEntries(
              performance.getEntriesByType('paint').map((e) => [e.name, e.startTime]),
            ),
            loaded: performance
              .getEntriesByType('resource')
              .filter((e) => e.name.startsWith(location.origin + '/'))
              .map((e) => new URL(e.name).pathname),
            userAgent: navigator.userAgent,
          }));
          assert.deepEqual(metrics.viewport, { width: 1280, height: 800 });
          assert.equal(metrics.entryScript, '/' + results.bundles[browser][version].entry.path);
          for (const key of ['containerVisibleMs', 'readyDomMs', 'readyFrameMs'])
            assert.ok(Number.isFinite(metrics[key]) && metrics[key] > 0);
          assert.deepEqual(await d.errors(), []);
          results.runs.push({
            browser,
            kind,
            version,
            round,
            warmup: round < 0,
            launchAndDriverReadyMs,
            ...metrics,
          });
          await writeFile(resolve(directory, 'results.json'), JSON.stringify(results, null, 2));
          console.log(browser, kind, version, round, metrics.readyFrameMs.toFixed(1) + 'ms');
        } finally {
          await d?.close();
          await removeGenerated(profile);
        }
      }
    }
    const pair = { browser, kind };
    for (const version of ['baseline', 'current']) {
      const rows = results.runs.filter(
        (r) => r.browser === browser && r.kind === kind && r.version === version && !r.warmup,
      );
      assert.equal(rows.length, samples);
      pair[version] = Object.fromEntries(
        ['containerVisibleMs', 'readyDomMs', 'readyFrameMs'].map((key) => [
          key,
          {
            median: quantile(
              rows.map((r) => r[key]),
              0.5,
            ),
            p95: quantile(
              rows.map((r) => r[key]),
              0.95,
            ),
            min: Math.min(...rows.map((r) => r[key])),
            max: Math.max(...rows.map((r) => r[key])),
          },
        ]),
      );
    }
    results.summary.push(pair);
    await writeFile(resolve(directory, 'results.json'), JSON.stringify(results, null, 2));
    await removeGenerated(seed);
  }
}
await writeFile(resolve(directory, 'results.json'), JSON.stringify(results, null, 2));
console.log('Startup benchmark:', relative(process.cwd(), resolve(directory, 'results.json')));
