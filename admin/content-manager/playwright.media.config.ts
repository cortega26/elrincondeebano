import { defineConfig, devices } from '@playwright/test';

// Media workbench e2e (plan 063 step 5). Runs against a temp COPY of the
// fixture catalog (same harness as import/changes, port 3103) so uploads,
// derivations and applies never touch the real repo.
export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/media-workbench.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'reports/e2e/media-latest.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3103',
    trace: process.env.CI ? 'on-first-retry' : 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'media-e2e',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'PORT=3103 node scripts/e2e-import-server.mjs',
    url: 'http://127.0.0.1:3103/api/v1/health',
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
