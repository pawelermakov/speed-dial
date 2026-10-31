import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import architecture from './scripts/eslint-architecture.mjs';

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
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.webextensions } },
  },
  {
    files: ['**/*.{js,mjs,ts,vue}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { architecture },
    rules: {
      'architecture/no-retired-imports': 'error',
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
          paths: ['vue', 'dexie'],
          patterns: [
            'vue/**',
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
    files: ['shared/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['**/modules/**'] }] },
  },
  {
    files: ['shared/i18n/contracts.ts', 'shared/i18n/messages.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['vue', 'dexie'],
          patterns: [
            'vue/**',
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
        { paths: ['vue'], patterns: ['**/components/**', '**/*.vue'] },
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
          paths: ['vue', 'dexie', 'wxt'],
          patterns: [
            'vue/**',
            'wxt/**',
            '**/adapters/**',
            '**/services/i18n',
            '**/services/validation',
          ],
        },
      ],
    },
  },
  prettier,
);
