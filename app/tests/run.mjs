import {
  suites,
  scenarioPaths,
  requiredCases,
  scenarioReportPath,
  validateScenarioReport,
  shardScenarios,
} from './scenarios.mjs';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const [group, ...args] = process.argv.slice(2);
if (!Object.hasOwn(suites, group)) throw new Error('Expected suite: unit, browser, ui or ci');
const list = args.includes('--list');
const requested = group === 'unit' ? [] : args.filter((arg) => arg.startsWith('--scenario='));
if (requested.length > 1) throw new Error('Choose one scenario');
const scenario = requested[0]?.slice('--scenario='.length);
if (requested.length && !suites[group].includes(scenario))
  throw new Error('Unknown scenario in suite: ' + scenario);
const shardArgs = args.filter((arg) => arg.startsWith('--shard='));
if (shardArgs.length > 1 || (shardArgs.length && (group !== 'ci' || requested.length)))
  throw new Error('Choose one shard of the complete ci suite');
const shard = shardArgs[0]?.match(/^--shard=([1-9]\d*)\/([1-9]\d*)$/);
if (shardArgs.length && !shard) throw new Error('Expected --shard=<index>/<count>');
const forwarded = args.filter(
  (arg) => arg !== '--list' && !requested.includes(arg) && !shardArgs.includes(arg),
);
if (group !== 'unit' && forwarded.some((arg) => !['--chrome-only', '--firefox-only'].includes(arg)))
  throw new Error(
    'Browser suites accept --chrome-only, --firefox-only, --scenario=<id>, --list; ci also accepts --shard=<index>/<count>',
  );
if (forwarded.includes('--chrome-only') && forwarded.includes('--firefox-only'))
  throw new Error('Choose only one browser filter');
let selected = suites[group].filter((name) => !scenario || scenario === name);
if (shard) selected = shardScenarios(selected, Number(shard[1]), Number(shard[2]));
const commands =
  group === 'unit'
    ? [
        [suites.unit[0], '--noEmit'],
        [suites.unit[1], 'run', ...forwarded],
      ]
    : [
        ...(!forwarded.includes('--firefox-only')
          ? [['node_modules/wxt/bin/wxt.mjs', 'build']]
          : []),
        ...(!forwarded.includes('--chrome-only')
          ? [['node_modules/wxt/bin/wxt.mjs', 'build', '-b', 'firefox']]
          : []),
        ...selected.map((name) => [scenarioPaths[name], ...forwarded]),
      ];
const runId = randomUUID();
const browsers = ['chrome', 'firefox'].filter(
  (browser) => !forwarded.includes(browser === 'chrome' ? '--firefox-only' : '--chrome-only'),
);
for (const command of commands) {
  console.log(`\n> node ${command.join(' ')}`);
  if (list) continue;
  const id = Object.keys(scenarioPaths).find((id) => scenarioPaths[id] === command[0]);
  if (id && Object.hasOwn(requiredCases, id))
    for (const browser of browsers) rmSync(scenarioReportPath(id, browser), { force: true });
  const result = spawnSync(process.execPath, command, {
    stdio: 'inherit',
    env: { ...process.env, SPEED_DIAL_TEST_RUN_ID: runId },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  if (id && Object.hasOwn(requiredCases, id))
    for (const browser of browsers)
      validateScenarioReport(JSON.parse(readFileSync(scenarioReportPath(id, browser), 'utf8')), {
        id,
        browser,
        runId,
      });
}
