import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { textTilePrelude, instrumentTextTileHtml } from '../browser/helpers/text-tile-helpers.mjs';
import { requiredCases, validateScenarioReport } from '../scenarios.mjs';

test('sampler observes every visible frame, colour changes and preview text fallback', () => {
  const frames = [],
    listeners = {},
    delays = [];
  const text = {
    href: 'https://example.com/',
    style: { backgroundColor: 'red' },
    visibility: 'visible',
  };
  const preview = {
    href: 'https://image.example/',
    style: { backgroundImage: 'url(blob:test)' },
    visibility: 'visible',
    querySelector: () => null,
  };
  const hidden = { href: 'https://hidden.example/', visibility: 'hidden' };
  class Image {
    decode() {
      return Promise.resolve('decoded');
    }
  }
  const window = {};
  runInNewContext(`(${textTilePrelude})();`, {
    window,
    HTMLImageElement: Image,
    document: { querySelectorAll: () => [text, preview, hidden] },
    getComputedStyle: (tile) => ({ visibility: tile.visibility }),
    requestAnimationFrame: (callback) => frames.push(callback),
    setTimeout: (callback, delay) => {
      delays.push(delay);
      callback();
    },
    addEventListener: (name, callback) => {
      listeners[name] = callback;
    },
  });
  frames.shift()();
  text.style.backgroundColor = 'blue';
  preview.querySelector = () => ({});
  frames.shift()();
  assert.equal(new Set(window.tileColors[text.href]).size, 2);
  assert.equal(Object.keys(window.tileColors).length, 1);
  assert.deepEqual(
    Array.from(window.initialPreviews, (value) => value.text),
    [false, true],
  );
  assert.equal(frames.length, 1);
  listeners.error({ message: 'script error' });
  listeners.unhandledrejection({ reason: 'promise error' });
  assert.deepEqual(Array.from(window.tileErrors), ['script error', 'promise error']);
  return new Image().decode().then((value) => {
    assert.equal(value, 'decoded');
    assert.deepEqual(delays, [100]);
  });
});

test('prelude is external and precedes bootstrap without changing app entry or CSS', () => {
  const html =
    '<head><script src="/bootstrap.js"></script><script type="module" src="/chunks/app.js"></script><link rel="stylesheet" href="/main.css"></head>';
  const script = '<script src="/test-text-tile-prelude.js"></script>';
  const result = instrumentTextTileHtml(html);
  assert.equal(result.replace(script, ''), html);
  assert.ok(result.indexOf(script) < result.indexOf('/bootstrap.js'));
  for (const invalid of ['', html + html]) assert.throws(() => instrumentTextTileHtml(invalid));
});

test('both platforms require every text-tile case and ten fresh screenshots', () => {
  for (const browser of ['chrome', 'firefox']) {
    const expected = { id: 'text-tiles', browser, runId: '11111111-1111-4111-8111-111111111111' };
    const report = {
      ...expected,
      status: 'passed',
      cases: [...requiredCases['text-tiles']],
      artifactCount: 10,
    };
    assert.doesNotThrow(() => validateScenarioReport(report, expected));
    for (const patch of [
      { cases: report.cases.slice(1) },
      { artifactCount: 9 },
      { artifactCount: undefined },
    ])
      assert.throws(() => validateScenarioReport({ ...report, ...patch }, expected));
  }
});
