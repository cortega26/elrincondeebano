import { defineAdminConfig } from './playwright.base.ts';

// Lazy product form e2e (plan 274): temp COPY of the 80-product fixture on
// :3106 with a per-run ADMIN_CREDENTIAL (plan 183), same harness as scope.
// The server script is reused as-is — it already reads PORT from the env.
export default defineAdminConfig({
  testMatch: '**/products-lazy-form.spec.ts',
  port: 3106,
  serverCommand: 'PORT=3106 node scripts/e2e-scope-server.mjs',
  projectName: 'products-e2e',
  jsonReport: 'reports/e2e/products-latest.json',
});
