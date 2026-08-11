import { defineConfig, devices } from '@playwright/test';

// Pagination and bulk/reorder scope e2e (plan 088). Separate config: the
// webServer serves a temp COPY of the 80-product fixture on :3102
// (ADMIN_CREDENTIAL=e2e-scope) so browser tests exercise pagination and
// scope confirms without touching the real catalog.
export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/scope.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'reports/e2e/scope-latest.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3102',
    trace: process.env.CI ? 'on-first-retry' : 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'scope-e2e',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node scripts/e2e-scope-server.mjs',
    url: 'http://127.0.0.1:3102/api/v1/health',
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
