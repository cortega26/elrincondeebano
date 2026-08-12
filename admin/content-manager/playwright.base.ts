import { defineConfig, devices } from '@playwright/test';

// Plan 123: shared factory for the admin e2e matrix — the six configs only
// declare their deltas (testMatch, port, server command, project/report
// names). CI (`admin.yml`) invokes each config by name; do not rename the
// config files.
export interface AdminPlaywrightConfigOverrides {
  testMatch: string;
  port: number;
  serverCommand: string;
  projectName: string;
  jsonReport: string;
  workers?: number;
  reuseExistingServer?: boolean;
  extraTestIgnore?: string[];
}

export function defineAdminConfig(overrides: AdminPlaywrightConfigOverrides) {
  const { testMatch, port, serverCommand, projectName, jsonReport } = overrides;
  return defineConfig({
    testDir: './test/e2e',
    testMatch,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: overrides.workers ?? 1,
    reporter: [
      ['html', { open: 'never' }],
      ['json', { outputFile: jsonReport }],
    ],
    use: {
      baseURL: `http://127.0.0.1:${port}`,
      trace: process.env.CI ? 'on-first-retry' : 'off',
      screenshot: 'only-on-failure',
    },
    projects: [
      {
        name: projectName,
        use: { ...devices['Desktop Chrome'] },
        testIgnore: overrides.extraTestIgnore,
      },
    ],
    webServer: {
      command: serverCommand,
      url: `http://127.0.0.1:${port}/api/v1/health`,
      reuseExistingServer: overrides.reuseExistingServer ?? false,
      timeout: 20_000,
    },
  });
}
