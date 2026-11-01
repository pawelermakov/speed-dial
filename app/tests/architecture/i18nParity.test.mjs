import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import {
  observeStartupLanguage,
  validateStartupLanguages,
  instrumentLanguageHtml,
} from '../browser/helpers/i18n-helpers.mjs';
import { i18nLocales, requiredCases, validateScenarioReport } from '../scenarios.mjs';

test('startup language assertions reject absent, empty and wrong-language traces', () => {
  for (const trace of [
    undefined,
    null,
    [],
    new Array(2),
    {},
    ['Settings'],
    ['Ajustes', 'Настройки'],
  ])
    assert.throws(() => validateStartupLanguages(trace, 'Ajustes'));
  assert.doesNotThrow(() => validateStartupLanguages(['Ajustes', 'Ajustes'], 'Ajustes'));
});

test('observer records visible startup titles and title attribute changes', () => {
  let notify, options, gear;
  const window = {};
  runInNewContext(`(${observeStartupLanguage})();`, {
    window,
    document: { querySelector: () => gear },
    getComputedStyle: (element) => ({ visibility: element.visibility }),
    MutationObserver: class {
      constructor(callback) {
        notify = callback;
      }
      observe(document, value) {
        options = value;
      }
    },
  });
  assert.equal(options.attributes, true);
  notify();
  gear = { title: 'Settings', visibility: 'hidden' };
  notify();
  assert.equal(window.startupLanguages.length, 0);
  gear.visibility = 'visible';
  notify();
  gear.title = 'Ajustes';
  notify();
  assert.deepEqual(Array.from(window.startupLanguages), ['Settings', 'Ajustes']);
  assert.throws(() => validateStartupLanguages(window.startupLanguages, 'Ajustes'));
});

test('instrumentation precedes the app entry without modifying production scripts or styles', () => {
  const html =
    '<head><script src="/bootstrap.js"></script><script type="module" crossorigin src="/chunks/app.js"></script><link rel="stylesheet" href="/main.css"></head><body><div id="app"></div></body>';
  const observer = '<script src="/test-language-observer.js"></script>';
  const result = instrumentLanguageHtml(html);
  assert.equal(result.replace(observer, ''), html);
  assert.ok(result.indexOf(observer) < result.indexOf('type="module"'));
  for (const invalid of ['', '<script src="/bootstrap.js"></script>', html + html])
    assert.throws(() => instrumentLanguageHtml(invalid));
});

test('both platforms require every regional locale, including formerly platform-only fixtures', () => {
  assert.deepEqual(i18nLocales, ['ru-RU', 'es-MX', 'de-DE', 'es-ES', 'fr-FR']);
  assert.deepEqual(
    requiredCases.i18n,
    i18nLocales.map((tag) => `locale-${tag}`),
  );
  for (const browser of ['chrome', 'firefox']) {
    const expected = { id: 'i18n', browser, runId: '11111111-1111-4111-8111-111111111111' };
    const report = { ...expected, status: 'passed', cases: [...requiredCases.i18n] };
    assert.doesNotThrow(() => validateScenarioReport(report, expected));
    for (const cases of [[], report.cases.slice(1), [...report.cases, report.cases[0]]])
      assert.throws(() => validateScenarioReport({ ...report, cases }, expected));
  }
});
