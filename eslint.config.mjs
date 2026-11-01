import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import architecture from './app/tests/architecture/eslint-architecture.mjs';

const uiI18nPattern = {
  regex: '(?:^|/)app/common/i18n(?:/(?:index|createI18n|injection))?(?:[.]ts)?$',
  message:
    'UI translation context belongs to the newtab application; use pure i18n contracts/messages/errors here.',
};

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.wxt/**',
      '.output/**',
      '.browser-test/**',
      '.idea/**',
      'dist/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['app/tests/{browser,ui}/**/*.mjs'],
    languageOptions: { globals: { ...globals.webextensions } },
  },
  {
    files: ['**/*.{js,mjs,ts,vue}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { architecture },
    rules: {
      'architecture/no-retired-imports': 'error',
      'architecture/import-boundaries': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] } },
  },
  {
    files: ['**/*.ts', '**/*.vue'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
    },
  },
  {
    files: ['app/**/entities/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['vue', 'dexie', 'vue-i18n'],
          patterns: [
            'vue/**',
            'vue-i18n/**',
            'wxt',
            'wxt/**',
            '**/services/**',
            '**/adapters/**',
            '**/components/**',
            '**/composables/**',
            '**/utils/**',
            '**/types/models',
          ],
        },
      ],
    },
  },
  {
    files: ['app/**/{entities,helpers,services}/**/*.ts'],
    ignores: ['**/tests/**', '**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'localStorage',
        'sessionStorage',
        'Image',
        'HTMLElement',
      ],
    },
  },
  {
    files: ['app/common/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['**/modules/**'] }] },
  },
  {
    files: [
      'app/common/i18n/contracts.ts',
      'app/common/i18n/messages.ts',
      'app/common/i18n/errors.ts',
      'app/common/i18n/formatMessage.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['vue', 'dexie', 'vue-i18n', './index', './createI18n', './injection', '../i18n'],
          patterns: [
            'vue/**',
            'vue-i18n/**',
            'wxt',
            'wxt/**',
            '**/modules/**',
            '**/services/**',
            '**/adapters/**',
            '**/components/**',
            '**/composables/**',
            '**/utils/**',
            '**/types/models',
          ],
        },
      ],
    },
  },
  {
    files: ['app/composables/useDial.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['wxt', 'wxt/**', '**/adapters/**', '**/infrastructure/**'],
        },
      ],
    },
  },
  {
    files: ['app/adapters/createBackgroundApplication.ts', 'entrypoints/background.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['vue', 'vue-i18n'],
          patterns: [{ group: ['vue-i18n/**', '**/components/**', '**/*.vue'] }, uiI18nPattern],
        },
      ],
    },
  },
  {
    files: [
      'app/services/snapshot.ts',
      'app/modules/{bookmarks,settings,appearance,sync,backup,capture,search,mail}/services/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['vue', 'dexie', 'wxt', 'vue-i18n'],
          patterns: [
            {
              group: [
                'vue/**',
                'vue-i18n/**',
                'wxt/**',
                '**/adapters/**',
                '**/services/i18n',
                '**/services/validation',
              ],
            },
            uiI18nPattern,
          ],
        },
      ],
    },
  },
  prettier,
);
