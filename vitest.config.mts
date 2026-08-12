import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'https://localhost/',
      },
    },
    include: ['test/**/*.{spec,test}.{js,mjs,ts}'],
    exclude: ['test/e2e-astro/**', 'node_modules'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 33,
        branches: 25,
        functions: 28,
        lines: 33,
      },
    },
  },
});
