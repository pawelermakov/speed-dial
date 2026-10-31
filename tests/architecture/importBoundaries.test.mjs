import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Linter } from 'eslint';
import parser from '@typescript-eslint/parser';
import architecture from '../../scripts/eslint-architecture.mjs';

const root = resolve(import.meta.dirname, '../..');
function lint(code, file = 'modules/dial/modules/settings/services/sample.ts') {
  return new Linter().verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser },
        plugins: { architecture },
        rules: { 'architecture/import-boundaries': 'error' },
      },
    ],
    { filename: resolve(root, file) },
  );
}
test('all import forms reject sibling internals', () => {
  for (const code of [
    "import type { X } from '../../sync/entities/models'",
    "export { X } from '../../sync/entities/models'",
    "export * from '../../sync/entities/models'",
    "const lazy = import('../../sync/entities/models')",
    'const lazy = import(`../../sync/entities/models`)',
    "type X = import('../../sync/entities/models').X",
    "import { X } from '@/modules/dial/modules/sync/entities/models.ts'",
  ]) {
    const messages = lint(code);
    assert.equal(messages.length, 1, code);
    assert.equal(messages[0].ruleId, 'architecture/import-boundaries', code);
  }
});
test('public sibling contracts and direct local imports remain available', () => {
  for (const source of [
    '../../sync',
    '../../sync/index.ts',
    '../../bookmarks/locators',
    '../../settings/schema',
    './interfaces',
  ])
    assert.deepEqual(lint(`import type { X } from '${source}'`), [], source);
});
test('features cannot import parent application contracts or their own barrel', () => {
  for (const source of ['../../../entities/snapshot', '..', '../index.ts'])
    assert.equal(lint(`import type { X } from '${source}'`).length, 1, source);
});
test('shared cannot depend on features or composition roots', () => {
  for (const source of ['../../modules/dial/modules/settings', '../../app/serviceContext'])
    assert.equal(lint(`import { X } from '${source}'`, 'shared/helpers/sample.ts').length, 1);
});
test('production cannot import tests through relative paths or aliases', () => {
  for (const source of [
    '../../../../../tests/helpers/i18n',
    '~/tests/helpers/i18n',
    '../tests/fixture',
    './sample.test.ts',
  ])
    assert.equal(lint(`import { X } from '${source}'`).length, 1, source);
});
test('composables receive adapters but may refer to component types', () => {
  const file = 'modules/dial/modules/settings/composables/sample.ts';
  assert.equal(lint("import { X } from '../adapters/storage'", file).length, 1);
  assert.deepEqual(lint("import type X from '../components/Dialog.vue'", file), []);
});
test('tests and composition roots can wire concrete implementations', () => {
  for (const file of ['tests/helpers/sample.ts', 'app/createNewtabApplication.ts'])
    assert.deepEqual(
      lint("import { X } from '../../modules/dial/modules/settings/adapters/storage'", file),
      [],
    );
});

test('pure layers reject runtime dependencies but retain type-only ports', () => {
  for (const layer of ['entities', 'helpers', 'services']) {
    const file = `modules/dial/modules/settings/${layer}/sample.ts`;
    for (const source of [
      'vue',
      'vue-i18n',
      'wxt/browser',
      'dexie',
      '../adapters/storage',
      '../../../../../shared/i18n',
    ])
      assert.equal(lint(`import { X } from '${source}'`, file).length, 1, `${layer}: ${source}`);
    assert.deepEqual(lint("import type { X } from '../services/interfaces'", file), []);
  }
});

test('composables cannot bypass ports with lazy components or browser APIs', () => {
  const file = 'modules/dial/modules/settings/composables/sample.ts';
  for (const code of [
    "import { browser } from 'wxt/browser'",
    "const component = import('../components/Dialog.vue')",
  ])
    assert.equal(lint(code, file).length, 1);
});

test('retired paths cannot return through aliases or template imports', () => {
  for (const code of [
    "import { t } from '@/services/i18n'",
    "type X = import('~/types/models').X",
    'const lazy = import(`../../../../../services/repository`)',
  ]) {
    const messages = new Linter().verify(
      code,
      [
        {
          files: ['**/*.ts'],
          languageOptions: { parser },
          plugins: { architecture },
          rules: { 'architecture/no-retired-imports': 'error' },
        },
      ],
      { filename: resolve(root, 'modules/dial/modules/settings/services/sample.ts') },
    );
    assert.equal(messages.length, 1, code);
    assert.equal(messages[0].ruleId, 'architecture/no-retired-imports');
  }
});
