import { defineAdminConfig } from './playwright.base.ts';

// Change-set control center against an isolated temp repo.
export default defineAdminConfig({
  testMatch: '**/change-set.spec.ts',
  port: 3102,
  serverCommand: 'PORT=3102 node scripts/e2e-import-server.mjs',
  projectName: 'changes-e2e',
  jsonReport: 'reports/e2e/changes-latest.json',
});
