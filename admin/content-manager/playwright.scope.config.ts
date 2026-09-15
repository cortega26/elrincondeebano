import { defineAdminConfig } from './playwright.base.ts';

// Pagination and bulk/reorder scope e2e (plan 088): temp COPY of the
// 80-product fixture on :3105 with a per-run ADMIN_CREDENTIAL (plan 183).
// (Own port since plan 206: :3102 double-booked changes+scope and killed
// scope's server under parallel load.)
export default defineAdminConfig({
  testMatch: '**/scope.spec.ts',
  port: 3105,
  serverCommand: 'PORT=3105 node scripts/e2e-scope-server.mjs',
  projectName: 'scope-e2e',
  jsonReport: 'reports/e2e/scope-latest.json',
});
