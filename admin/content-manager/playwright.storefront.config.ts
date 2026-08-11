import { defineConfig, devices } from '@playwright/test';

// Storefront curation e2e (plan 066 step 3-4). Temp COPY of the fixture
// catalog (same harness, port 3104) so curation writes never touch the real
// storefront data.
export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/storefront.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'reports/e2e/storefront-latest.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3104',
    trace: process.env.CI ? 'on-first-retry' : 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'storefront-e2e',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'PORT=3104 node scripts/e2e-import-server.mjs',
    url: 'http://127.0.0.1:3104/api/v1/health',
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
