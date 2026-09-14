import { defineAdminConfig } from './playwright.base.ts';

// Pagination and bulk/reorder scope e2e (plan 088): temp COPY of the
// 80-product fixture on :3102 with a per-run ADMIN_CREDENTIAL (plan 183).
export default defineAdminConfig({
  testMatch: '**/scope.spec.ts',
  port: 3102,
  serverCommand: 'node scripts/e2e-scope-server.mjs',
  projectName: 'scope-e2e',
  jsonReport: 'reports/e2e/scope-latest.json',
});
