import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'tests/**/*.test.ts',
      'modules/**/*.test.ts',
      'shared/**/*.test.ts',
      'app/**/*.test.ts',
    ],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
  },
});
