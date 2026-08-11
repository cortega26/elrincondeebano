import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'reports/e2e/latest.json' }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',
    trace: process.env.CI ? 'on-first-retry' : 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
      // The import/change-set/media workflows run against their own
      // temp-repo webServers (playwright.*.config.ts) so they never touch
      // the real catalog — keep them out of the default suite.
      testIgnore: [
        '**/import-export.spec.ts',
        '**/change-set.spec.ts',
        '**/media-workbench.spec.ts',
      ],
    },
  ],
  webServer: {
    command: 'node --import tsx src/server/start.ts',
    url: 'http://127.0.0.1:3000/api/v1/health',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
