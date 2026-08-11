import { defineConfig, devices } from '@playwright/test';

// Change-set control-center e2e (plan 062 step 5). Runs against a temp COPY
// of the fixture catalog (same harness as the import workflow, port 3102) so
// apply/undo/redo never touch the real catalog. ADMIN_CREDENTIAL=e2e-import.
export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/change-set.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'reports/e2e/changes-latest.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3102',
    trace: process.env.CI ? 'on-first-retry' : 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'changes-e2e',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'PORT=3102 node scripts/e2e-import-server.mjs',
    url: 'http://127.0.0.1:3102/api/v1/health',
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
