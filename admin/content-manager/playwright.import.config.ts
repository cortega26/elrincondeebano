import { defineAdminConfig } from './playwright.base.ts';

// Import/export workflow against an isolated temp repo.
export default defineAdminConfig({
  testMatch: '**/import-export.spec.ts',
  port: 3101,
  serverCommand: 'node scripts/e2e-import-server.mjs',
  projectName: 'import-e2e',
  jsonReport: 'reports/e2e/import-latest.json',
});
