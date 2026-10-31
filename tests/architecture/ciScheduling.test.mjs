import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  suites,
  scenarioPaths,
  firefoxScenarios,
  shardScenarios,
  requiredCases,
} from '../scenarios.mjs';

test('CI runs the exact browser/UI union without repeating shared scenarios', () => {
  const union = new Set([...suites.browser, ...suites.ui]);
  assert.deepEqual(suites.ci, [...union]);
  assert.equal(suites.ci.length, new Set(suites.ci).size);
});

test('every shard count covers each supported scenario exactly once', () => {
  for (const selected of [suites.ci, suites.ci.filter((id) => firefoxScenarios.has(id))]) {
    for (let count = 1; count <= selected.length; count++) {
      const shards = Array.from({ length: count }, (_, i) =>
        shardScenarios(selected, i + 1, count),
      );
      assert.ok(shards.every((shard) => shard.length));
      assert.deepEqual(shards.flat().sort(), [...selected].sort());
      assert.equal(new Set(shards.flat()).size, selected.length);
      assert.deepEqual(shards[0], shardScenarios(selected, 1, count));
    }
  }
  // New scenarios with no duration measurement must also be scheduled.
  assert.deepEqual(shardScenarios(['new-scenario'], 1, 1), ['new-scenario']);
});

const list = (group, ...args) =>
  spawnSync(process.execPath, ['scripts/test.mjs', group, ...args, '--list'], {
    cwd: new URL('../..', import.meta.url),
    encoding: 'utf8',
  });

test('the CI matrix resolves every platform scenario and one build per shard', () => {
  for (const [browser, count] of Object.entries({ chrome: 5, firefox: 5 })) {
    const commands = [];
    for (let shard = 1; shard <= count; shard++) {
      const result = list('ci', `--${browser}-only`, `--shard=${shard}/${count}`);
      assert.equal(result.status, 0, result.stderr);
      assert.equal((result.stdout.match(/> node node_modules\/wxt/g) ?? []).length, 1);
      commands.push(...[...result.stdout.matchAll(/> node (tests\/\S+\.mjs)/g)].map((m) => m[1]));
    }
    const expected = suites.ci
      .filter((id) => browser === 'chrome' || firefoxScenarios.has(id))
      .map((id) => scenarioPaths[id]);
    assert.deepEqual(commands.sort(), expected.sort());
    assert.equal(new Set(commands).size, commands.length);
  }
});

test('invalid shards fail before builds or browser execution', () => {
  for (const args of [
    ['ci', '--shard=0/3'],
    ['ci', '--shard=4/3'],
    ['ci', '--shard=1/0'],
    ['ci', '--shard=1/99'],
    ['ci', '--shard=1.5/3'],
    ['ci', '--shard=1/3', '--shard=2/3'],
    ['ci', '--shard=1/3', '--scenario=i18n'],
    ['browser', '--shard=1/3'],
    ['ui', '--shard=1/3'],
    ['unit', '--shard=1/3'],
  ]) {
    const result = list(...args);
    assert.notEqual(result.status, 0, args.join(' '));
    assert.ok(!result.stdout.includes('> node'));
  }
  for (const [index, count] of [
    [0, 3],
    [4, 3],
    [1, 0],
    [1, Infinity],
    [NaN, 3],
  ])
    assert.throws(() => shardScenarios(suites.ci, index, count));
});

test('CI uploads every validated scenario report', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/checks.yml', import.meta.url),
    'utf8',
  );
  const uploaded = [
    ...workflow.matchAll(/parity-reports\/([a-z0-9-]+)-\$\{\{ matrix\.browser \}\}\.json/g),
  ].map((match) => match[1]);
  assert.deepEqual(uploaded.sort(), Object.keys(requiredCases).sort());
});
