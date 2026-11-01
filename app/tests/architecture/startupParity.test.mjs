import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { gateStartupHtml } from '../browser/helpers/extension-driver.mjs';
import { requiredCases, validateScenarioReport, suites, firefoxScenarios } from '../scenarios.mjs';
const runId = '11111111-1111-4111-8111-111111111111';
test('runner selects the same startup scenario and rejects missing implementations', () => {
  const cwd = resolve(import.meta.dirname, '../../..');
  for (const browser of ['chrome', 'firefox']) {
    const result = spawnSync(
      process.execPath,
      ['app/tests/run.mjs', 'browser', '--scenario=theme-startup', `--${browser}-only`, '--list'],
      { cwd, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal((result.stdout.match(/> node app\/tests\//g) ?? []).length, 1);
    assert.ok(result.stdout.includes('app/tests/browser/appearance/theme-startup.mjs'));
  }
  for (const scenario of ['missing']) {
    const result = spawnSync(
      process.execPath,
      ['app/tests/run.mjs', 'browser', `--scenario=${scenario}`, '--firefox-only', '--list'],
      { cwd, encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0);
    assert.ok(!result.stdout.includes('> node'));
  }
});
test('startup gate preserves bootstrap, CSS, entry URL and unrelated HTML', () => {
  const html =
    '<head><script src="/wallpaper-bootstrap.js"></script><script type="module" crossorigin src="/chunks/newtab-test.js"></script><link rel="stylesheet" href="/assets/main.css"></head><body><div id="app"></div></body>';
  const result = gateStartupHtml(html);
  assert.equal(
    result.replace('type="application/x-test-gated-module" data-test-app-gate', 'type="module"'),
    html,
  );
  assert.ok(!result.includes('type="module"'));
});
test('startup fixture rejects missing or ambiguous app entry', () => {
  for (const html of [
    '',
    '<script src="/wallpaper-bootstrap.js"></script>',
    '<script type="module" src="/a.js"></script><script type="module" src="/b.js"></script>',
  ])
    assert.throws(() => gateStartupHtml(html));
});
test('startup report contract is mandatory in both suites and platforms', () => {
  assert.ok(suites.browser.includes('theme-startup'));
  assert.ok(suites.ui.includes('theme-startup'));
  assert.ok(firefoxScenarios.has('theme-startup'));
  assert.equal(new Set(requiredCases['theme-startup']).size, requiredCases['theme-startup'].length);
  for (const browser of ['chrome', 'firefox']) {
    const expected = { id: 'theme-startup', browser, runId };
    assert.doesNotThrow(() =>
      validateScenarioReport(
        { ...expected, status: 'passed', cases: [...requiredCases['theme-startup']] },
        expected,
      ),
    );
  }
});
test('stale, failed, foreign and incomplete reports cannot count as success', () => {
  const expected = { id: 'theme-startup', browser: 'firefox', runId };
  const valid = { ...expected, status: 'passed', cases: [...requiredCases['theme-startup']] };
  for (const patch of [
    { runId: '22222222-2222-4222-8222-222222222222' },
    { browser: 'chrome' },
    { id: 'other' },
    { status: 'failed' },
    { cases: [] },
    { cases: valid.cases.slice(1) },
    { cases: [...valid.cases, valid.cases[0]] },
  ])
    assert.throws(() => validateScenarioReport({ ...valid, ...patch }, expected));
});
test('coverage schema rejects local paths, errors and arbitrary metadata', () => {
  const expected = { id: 'theme-startup', browser: 'firefox', runId };
  const report = { ...expected, status: 'passed', cases: [...requiredCases['theme-startup']] };
  for (const patch of [
    { fixture: 'C:/private/profile' },
    { error: 'private diagnostic' },
    { transparency: { path: 'C:/private' } },
    { transparency: { transparencyAvailable: 'private text' } },
  ])
    assert.throws(() => validateScenarioReport({ ...report, ...patch }, expected));
});
