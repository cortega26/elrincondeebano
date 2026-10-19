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
        // Plan 231 ratchet: module-level floors (achieved − 5; measured
        // 100/100 on 2026-10-18). Raise with the PR that keeps it green.
        'astro-poc/src/scripts/storefront/sw-registration.js': {
          lines: 95,
          functions: 95,
        },
      },
    },
  },
});
