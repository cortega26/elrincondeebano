import { defineAdminConfig } from './playwright.base.ts';

// Storefront curation against an isolated temp repo.
export default defineAdminConfig({
  testMatch: '**/storefront.spec.ts',
  port: 3104,
  serverCommand: 'PORT=3104 node scripts/e2e-import-server.mjs',
  projectName: 'storefront-e2e',
  jsonReport: 'reports/e2e/storefront-latest.json',
});
