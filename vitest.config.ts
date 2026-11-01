import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['app/tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['app/tests/setup.ts'],
  },
});
