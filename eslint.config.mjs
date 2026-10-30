import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

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
    rules: {
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
    files: ['composables/useDial.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            '../services/database',
            '../services/repository',
            '../services/settings',
            '../services/favicons',
          ],
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
  prettier,
);
