import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import architecture from './scripts/eslint-architecture.mjs';

const uiI18nPattern = {
  regex: '(?:^|/)shared/i18n(?:/(?:index|createI18n|injection))?(?:[.]ts)?$',
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
    files: ['scripts/**/*.mjs', 'tests/{browser,ui}/**/*.mjs'],
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
    files: ['modules/**/entities/**/*.ts'],
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
    files: ['modules/**/{entities,helpers,services}/**/*.ts'],
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
    files: ['shared/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['**/modules/**'] }] },
  },
  {
    files: [
      'shared/i18n/contracts.ts',
      'shared/i18n/messages.ts',
      'shared/i18n/errors.ts',
      'shared/i18n/formatMessage.ts',
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
    files: ['modules/dial/composables/useDial.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['../../../services/favicons'],
          patterns: ['wxt', 'wxt/**', '**/adapters/**', '**/infrastructure/**'],
        },
      ],
    },
  },
  {
    files: ['app/createBackgroundApplication.ts', 'entrypoints/background.ts'],
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
      'modules/dial/services/snapshot.ts',
      'modules/dial/modules/{bookmarks,settings,appearance,sync,backup,capture,search,mail}/services/**/*.ts',
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
