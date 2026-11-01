import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { suites, scenarioPaths, firefoxScenarios, requiredCases } from '../scenarios.mjs';

const root = resolve(import.meta.dirname, '../../..');
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
    'app/tests/browser/helpers/firefox-driver.mjs',
    'app/tests/browser/helpers/firefox-network.mjs',
    'app/tests/browser/helpers/extension-driver.mjs',
    'app/tests/browser/helpers/ui-assertions.mjs',
    'app/tests/browser/helpers/startup-motion-helpers.mjs',
    'app/tests/browser/helpers/data-management-helpers.mjs',
    'app/tests/browser/helpers/i18n-helpers.mjs',
    'app/tests/browser/helpers/wallpaper-helpers.mjs',
    'app/tests/browser/helpers/text-tile-helpers.mjs',
  ]);
  assert.deepEqual(
    [...files('app/tests/browser'), ...files('app/tests/ui')]
      .filter((path) => !helpers.has(path))
      .sort(),
    Object.values(scenarioPaths).sort(),
  );
});

test('relocated scripts have no broken relative module imports', () => {
  for (const file of [...files('app/tests/browser'), ...files('app/tests/ui')]) {
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
    const fixture = resolve(root, `app/tests/fixtures/search/${provider}.json`);
    assert.ok(existsSync(fixture), provider);
    assert.doesNotThrow(() => JSON.parse(readFileSync(fixture, 'utf8')), provider);
  }
});
