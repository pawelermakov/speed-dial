import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import {
  wallpaperPrelude,
  instrumentWallpaperHtml,
} from '../browser/helpers/wallpaper-helpers.mjs';
import { gateStartupHtml } from '../browser/helpers/extension-driver.mjs';
import { requiredCases, validateScenarioReport } from '../scenarios.mjs';

function prelude() {
  const window = {},
    listeners = {};
  class Image {
    constructor(src, decoded = Promise.resolve()) {
      this.src = src;
      this.decoded = decoded;
    }
    decode() {
      return this.decoded;
    }
  }
  runInNewContext(`(${wallpaperPrelude})();`, {
    window,
    HTMLImageElement: Image,
    addEventListener: (name, callback) => {
      listeners[name] = callback;
    },
  });
  return { window, Image, listeners };
}

test('blob decode waits for the real decoder and explicit release', async () => {
  const { window, Image } = prelude();
  window.holdWallpaperDecode = true;
  let decoded,
    finished = false;
  const result = new Image(
    'blob:test',
    new Promise((resolve) => {
      decoded = resolve;
    }),
  ).decode();
  void result.then(() => {
    finished = true;
  });
  assert.equal(window.releaseWallpaperDecode, undefined);
  decoded();
  await new Promise(setImmediate);
  assert.equal(finished, false);
  assert.equal(typeof window.releaseWallpaperDecode, 'function');
  window.releaseWallpaperDecode();
  await result;
  assert.equal(finished, true);
  await new Image('blob:subsequent').decode();
});

test('the hook preserves normal decoding, rejection and runtime errors', async () => {
  const { window, Image, listeners } = prelude();
  await new Image('blob:normal').decode();
  window.holdWallpaperDecode = true;
  await new Image('data:image/png;base64,test').decode();
  await assert.rejects(
    new Image('blob:broken', Promise.reject(new Error('decode failed'))).decode(),
    /decode failed/,
  );
  listeners.error({ message: 'script error' });
  listeners.unhandledrejection({ reason: 'promise error' });
  assert.deepEqual(Array.from(window.wallpaperErrors), ['script error', 'promise error']);
});

test('instrumentation preserves the gated app and runs before the production bootstrap', () => {
  const html =
    '<head><script src="/bootstrap.js"></script><script type="module" src="/chunks/app.js"></script><link rel="stylesheet" href="/main.css"></head>';
  const gated = gateStartupHtml(html);
  const script = '<script src="/test-wallpaper-prelude.js"></script>';
  const result = instrumentWallpaperHtml(gated);
  assert.equal(result.replace(script, ''), gated);
  assert.ok(result.indexOf(script) < result.indexOf('/bootstrap.js'));
  assert.ok(!result.includes('type="module"'));
  for (const invalid of ['', html + html]) assert.throws(() => instrumentWallpaperHtml(invalid));
});

test('both platforms require all wallpaper cases and three screenshots', () => {
  for (const browser of ['chrome', 'firefox']) {
    const expected = {
      id: 'wallpaper-startup',
      browser,
      runId: '11111111-1111-4111-8111-111111111111',
    };
    const report = {
      ...expected,
      status: 'passed',
      cases: [...requiredCases['wallpaper-startup']],
      artifactCount: 3,
    };
    assert.doesNotThrow(() => validateScenarioReport(report, expected));
    for (const patch of [
      { cases: report.cases.slice(1) },
      { artifactCount: 2 },
      { artifactCount: undefined },
    ])
      assert.throws(() => validateScenarioReport({ ...report, ...patch }, expected));
  }
});
