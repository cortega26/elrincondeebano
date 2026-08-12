import { defineAdminConfig } from './playwright.base.ts';

// Media workbench against an isolated temp repo.
export default defineAdminConfig({
  testMatch: '**/media-workbench.spec.ts',
  port: 3103,
  serverCommand: 'PORT=3103 node scripts/e2e-import-server.mjs',
  projectName: 'media-e2e',
  jsonReport: 'reports/e2e/media-latest.json',
});
