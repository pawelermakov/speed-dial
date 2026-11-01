import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Linter } from 'eslint';
import parser from '@typescript-eslint/parser';
import architecture from './eslint-architecture.mjs';

const root = resolve(import.meta.dirname, '../../..');
function lint(code, file = 'app/modules/settings/services/sample.ts') {
  return new Linter().verify(
    code,
    [
      {
        files: ['**/*.{ts,mjs}'],
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
    "import type { X } from '../../mail/entities/models'",
    "export { X } from '../../mail/entities/models'",
    "export * from '../../mail/entities/models'",
    "const lazy = import('../../mail/entities/models')",
    'const lazy = import(`../../mail/entities/models`)',
    "type X = import('../../mail/entities/models').X",
    "import { X } from '@/app/modules/mail/entities/models.ts'",
  ]) {
    const messages = lint(code);
    assert.equal(messages.length, 1, code);
    assert.equal(messages[0].ruleId, 'architecture/import-boundaries', code);
  }
});
test('public sibling contracts and direct local imports remain available', () => {
  for (const source of [
    '../../mail',
    '../../mail/index.ts',
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
test('common cannot depend on features or composition roots', () => {
  for (const source of ['@/app/modules/settings', '@/app/composables/useServices'])
    assert.equal(lint(`import { X } from '${source}'`, 'app/common/helpers/sample.ts').length, 1);
});
test('production cannot import tests through relative paths or aliases', () => {
  for (const source of [
    '@/app/tests/helpers/i18n',
    '~/app/tests/helpers/i18n',
    '../tests/fixture',
    './sample.test.ts',
  ])
    assert.equal(lint(`import { X } from '${source}'`).length, 1, source);
});
test('composables receive adapters but may refer to component types', () => {
  const file = 'app/modules/settings/composables/sample.ts';
  assert.equal(lint("import { X } from '../adapters/storage'", file).length, 1);
  assert.deepEqual(lint("import type X from '../components/Dialog.vue'", file), []);
});
test('only module composition roots can wire module internals', () => {
  for (const file of ['app/tests/helpers/sample.ts', 'eslint.config.mjs'])
    assert.deepEqual(lint("import { X } from '@/app/modules/settings/adapters/storage'", file), []);
  for (const file of ['app/adapters/createNewtabApplication.ts', 'entrypoints/background.ts']) {
    assert.equal(
      lint("import { X } from '@/app/modules/settings/adapters/storage'", file).length,
      1,
    );
    for (const entry of ['settings', 'bookmarks/background', 'appearance'])
      assert.deepEqual(lint(`import { X } from '@/app/modules/${entry}'`, file), []);
  }
});

test('test runner may load its registry while production roots cannot load tests', () => {
  assert.deepEqual(lint("import { suites } from './scenarios.mjs'", 'app/tests/run.mjs'), []);
  assert.equal(
    lint(
      "import { suites } from '../tests/scenarios.mjs'",
      'app/adapters/createNewtabApplication.ts',
    ).length,
    1,
  );
});

test('pure layers reject runtime dependencies but retain type-only ports', () => {
  for (const layer of ['entities', 'helpers', 'services']) {
    const file = `app/modules/settings/${layer}/sample.ts`;
    for (const source of [
      'vue',
      'vue-i18n',
      'wxt/browser',
      'dexie',
      '../../weather/components',
      '../../mail/context',
      '../../backup/newtab',
      '../../settings/composables',
      '@/app/common/ui/keyboard',
      '../adapters/storage',
      '../newtab',
      '../background',
      '@/app/common/i18n',
    ])
      assert.equal(lint(`import { X } from '${source}'`, file).length, 1, `${layer}: ${source}`);
    assert.deepEqual(lint("import type { X } from '../services/interfaces'", file), []);
  }
});

test('composables cannot bypass ports with lazy components or browser APIs', () => {
  const file = 'app/modules/settings/composables/sample.ts';
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
    "import { normalizeUrl } from '@/services/validation'",
    "const icon = import('@/services/favicons')",
    'const lazy = import(`../../../../services/repository`)',
  ]) {
    const messages = new Linter().verify(
      code,
      [
        {
          files: ['**/*.{ts,mjs}'],
          languageOptions: { parser },
          plugins: { architecture },
          rules: { 'architecture/no-retired-imports': 'error' },
        },
      ],
      { filename: resolve(root, 'app/modules/settings/services/sample.ts') },
    );
    assert.equal(messages.length, 1, code);
    assert.equal(messages[0].ruleId, 'architecture/no-retired-imports');
  }
});

test('feature components can compose public sibling UI entries', () => {
  for (const source of ['../../weather/components', '../../mail/components'])
    assert.deepEqual(
      lint(`import { X } from '${source}'`, 'app/modules/settings/components/Panel.ts'),
      [],
    );
});

test('application services remain pure after merging the application root', () => {
  for (const source of [
    'vue',
    'wxt/browser',
    'dexie',
    '../adapters/storage',
    '../components/Dialog.vue',
  ])
    assert.equal(lint(`import { X } from '${source}'`, 'app/services/sample.ts').length, 1, source);
});
test('feature UI uses its own context and cannot depend on application internals', () => {
  for (const layer of ['components', 'composables']) {
    const file = `app/modules/settings/${layer}/sample.ts`;
    assert.deepEqual(lint("import { useService } from '../context'", file), []);
    for (const source of [
      '../../../services/application',
      '../../../composables/useServices',
      '../../../composables/screenTypes',
      '../../../adapters/createNewtabApplication',
    ])
      assert.equal(lint(`import type { X } from '${source}'`, file).length, 1, source);
  }
  assert.equal(lint("import { useServices } from '../../../composables/useServices'").length, 1);
});

test('common remains independent of application roots and screens', () => {
  const file = 'app/common/ui/sample.ts';
  for (const source of [
    '@/app',
    '@/app/adapters/createNewtabApplication',
    '@/app/adapters/createBackgroundApplication',
    '@/app/composables/useScreen',
    '@/app/modules/bookmarks',
    '@/entrypoints/background',
  ])
    assert.equal(lint(`import type { X } from '${source}'`, file).length, 1, source);
  assert.deepEqual(lint("import { X } from '../helpers/url'", file), []);
  assert.deepEqual(lint("import { X } from '@/app/common/i18n'", file), []);
});

test('parent screen uses public feature UI and composable entries', () => {
  const file = 'app/composables/sample.ts';
  for (const source of [
    '../modules/bookmarks/composables',
    '../modules/search/context',
    '../modules/settings/context',
  ])
    assert.deepEqual(lint(`import { X } from '${source}'`, file), []);
  for (const source of [
    '../modules/bookmarks/helpers/reorder',
    '../modules/settings/composables/useSettingsState',
  ])
    assert.equal(lint(`import { X } from '${source}'`, file).length, 1);
});

test('public component and composable directory entries support explicit index imports', () => {
  const file = 'app/components/Sample.ts';
  for (const source of [
    '../modules/bookmarks/components',
    '../modules/bookmarks/components/index.ts',
    '../modules/settings/composables',
    '../modules/settings/composables/index.ts',
  ])
    assert.deepEqual(lint(`import { X } from '${source}'`, file), []);
  for (const source of ['./index', '../components', '../composables/index.ts'])
    assert.equal(
      lint(`import type { X } from '${source}'`, 'app/modules/settings/components/Sample.ts')
        .length,
      1,
      source,
    );
});

test('composables may refer to component types but cannot load component barrels', () => {
  const file = 'app/composables/sample.ts';
  for (const source of ['../modules/search/components', '../modules/search/components/index.ts']) {
    assert.deepEqual(lint(`import type { X } from '${source}'`, file), []);
    assert.equal(lint(`import { X } from '${source}'`, file).length, 1);
  }
});
