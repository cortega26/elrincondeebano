import { defineAdminConfig } from './playwright.base.ts';

// Pagination and bulk/reorder scope e2e (plan 088): temp COPY of the
// 80-product fixture on :3102 (ADMIN_CREDENTIAL=e2e-scope).
export default defineAdminConfig({
  testMatch: '**/scope.spec.ts',
  port: 3102,
  serverCommand: 'node scripts/e2e-scope-server.mjs',
  projectName: 'scope-e2e',
  jsonReport: 'reports/e2e/scope-latest.json',
});
