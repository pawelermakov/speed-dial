import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  requiredCases,
  requiredArtifacts,
  validateScenarioReport,
  firefoxScenarios,
} from '../scenarios.mjs';

const runId = '11111111-1111-4111-8111-111111111111';
test('converted accessibility scenarios require the same cases and artifacts on both platforms', () => {
  for (const id of Object.keys(requiredArtifacts)) {
    assert.ok(firefoxScenarios.has(id));
    for (const browser of ['chrome', 'firefox']) {
      const expected = { id, browser, runId };
      assert.doesNotThrow(() =>
        validateScenarioReport(
          {
            ...expected,
            status: 'passed',
            cases: [...requiredCases[id]],
            artifactCount: requiredArtifacts[id],
          },
          expected,
        ),
      );
    }
  }
});
test('missing cases, screenshots and invalid artifact counts cannot pass', () => {
  for (const id of Object.keys(requiredArtifacts)) {
    const expected = { id, browser: 'firefox', runId };
    const report = {
      ...expected,
      status: 'passed',
      cases: [...requiredCases[id]],
      artifactCount: requiredArtifacts[id],
    };
    for (const patch of [
      { cases: [] },
      { cases: [...report.cases, report.cases[0]] },
      { artifactCount: undefined },
      { artifactCount: 0 },
      { artifactCount: report.artifactCount - 1 },
      { artifactCount: String(report.artifactCount) },
      { screenshotPath: 'private' },
    ])
      assert.throws(() => validateScenarioReport({ ...report, ...patch }, expected));
  }
});
