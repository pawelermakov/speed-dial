import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { suites, scenarioPaths, firefoxScenarios, requiredCases } from '../scenarios.mjs';

const root = resolve(import.meta.dirname, '../..');
function files(dir) {
  return readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? files(path) : path.endsWith('.mjs') ? [path] : [];
  });
}

test('every registered scenario exists and shared suites use the same implementation', () => {
  const ids = new Set([...suites.browser, ...suites.ui]);
  assert.deepEqual([...ids].sort(), Object.keys(scenarioPaths).sort());
  assert.equal(new Set(Object.values(scenarioPaths)).size, ids.size);
  for (const suite of [suites.browser, suites.ui]) assert.equal(new Set(suite).size, suite.length);
  for (const id of ids) {
    assert.ok(existsSync(resolve(root, scenarioPaths[id])), id);
    assert.ok(scenarioPaths[id].endsWith(`/${id}.mjs`), id);
  }
  assert.deepEqual([...firefoxScenarios].sort(), [...ids].sort());
  assert.deepEqual(Object.keys(requiredCases).sort(), [...ids].sort());
});

test('every browser/UI script is registered or an explicitly named helper', () => {
  const helpers = new Set([
    'tests/browser/helpers/firefox-driver.mjs',
    'tests/browser/helpers/firefox-network.mjs',
    'tests/browser/helpers/extension-driver.mjs',
    'tests/browser/helpers/ui-assertions.mjs',
    'tests/browser/helpers/startup-motion-helpers.mjs',
    'tests/browser/helpers/data-management-helpers.mjs',
    'tests/browser/helpers/i18n-helpers.mjs',
    'tests/browser/helpers/wallpaper-helpers.mjs',
    'tests/browser/helpers/text-tile-helpers.mjs',
  ]);
  assert.deepEqual(
    [...files('tests/browser'), ...files('tests/ui')].filter((path) => !helpers.has(path)).sort(),
    Object.values(scenarioPaths).sort(),
  );
});

test('relocated scripts have no broken relative module imports', () => {
  for (const file of [...files('tests/browser'), ...files('tests/ui')]) {
    const ast = ts.createSourceFile(
      file,
      readFileSync(resolve(root, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const node of ast.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const source = node.moduleSpecifier.text;
      if (source.startsWith('.'))
        assert.ok(existsSync(resolve(root, dirname(file), source)), `${file}: ${source}`);
    }
  }
});

test('live command resolves to the same provider scenario and local fixtures exist', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  assert.equal(manifest.scripts['test:live'], `node ${scenarioPaths['search-providers']} --live`);
  for (const provider of ['yandex', 'google', 'kinopoisk', 'imdb', 'myshows']) {
    const fixture = resolve(root, `modules/dial/modules/search/tests/fixtures/${provider}.json`);
    assert.ok(existsSync(fixture), provider);
    assert.doesNotThrow(() => JSON.parse(readFileSync(fixture, 'utf8')), provider);
  }
});
