import { defineConfig, devices } from '@playwright/test';
import { randomBytes } from 'node:crypto';

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
  // Plan 183: per-run harness credential — generated once per config process
  // when the operator/CI did not provide one. Workers inherit it via
  // process.env and the harness via webServer.env, so specs and server always
  // agree with no committed default anywhere in the tree. An explicitly
  // exported ADMIN_CREDENTIAL always wins (local override, CI secret).
  const harnessCredential = process.env.ADMIN_CREDENTIAL || randomBytes(32).toString('hex');
  if (!process.env.ADMIN_CREDENTIAL) {
    process.env.ADMIN_CREDENTIAL = harnessCredential;
  }
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
      env: { ...process.env, ADMIN_CREDENTIAL: harnessCredential },
      reuseExistingServer: overrides.reuseExistingServer ?? false,
      timeout: 20_000,
    },
  });
}
