import { defineConfig, devices } from '@playwright/test';

// Import workflow e2e (plan 060 step 3). Separate config because Playwright
// webServer is config-level only: this one serves a temp COPY of the fixture
// catalog on :3101 (ADMIN_CREDENTIAL=e2e-import) so browser tests exercise
// uploaded files and downloads without ever touching the real catalog.
export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/import-export.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'reports/e2e/import-latest.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3101',
    trace: process.env.CI ? 'on-first-retry' : 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'import-e2e',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node scripts/e2e-import-server.mjs',
    url: 'http://127.0.0.1:3101/api/v1/health',
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
