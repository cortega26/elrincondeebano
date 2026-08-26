# 158 — Split changes.ts (1,076 lines) into import/change-set/history route modules

- **Source**: Auditoría 10, DEBT-08 · **Status**: TODO · **Priority**: P3 · **Effort**: M
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/server/routes/changes.ts admin/content-manager/src/server/app.ts`

## Problem

`admin/content-manager/src/server/routes/changes.ts` is 1,076 lines — ~10× the admin median (105 lines across 103 files) — mixing 16 routes with four distinct responsibilities in one file: import/export, change-sets, diff, and product delete/history revert/undo/redo (routes registered at `:110,114,130,171,253,292,367,413,462,467,541,631,789,855,919,1012`). It's the file where the highest-churn business rules intersect (409 semantics, idempotency, change-set lifecycle, plan-069-era import logic) and the most likely to accumulate another 200 lines on the next feature. Prior god-module splits (plan 114 catalog.ts, plan 094 ProductsPage) held; the route layer just became the new biggest thing.

## Scope

**In**: `admin/content-manager/src/server/routes/changes.ts` (split), `admin/content-manager/src/server/app.ts` (registration — `changesRoutes(instance, repos, changeSets, repoRoot, productService)` at `:180-185`), nothing else.

**Out**: Route paths, handler behavior, response shapes, the tests (they exercise the routes through HTTP and must pass unchanged).

## Steps

1. Split into three modules by line ranges, keeping the shared helpers (envelope/validation imports) in a small `changes-common.ts` (or import from `helpers.ts`):
   - `changeSetRoutes.ts` — change-set CRUD/lifecycle + diff (lines ~110-461).
   - `importRoutes.ts` — import preview/apply/export (lines ~462-788).
   - `historyRoutes.ts` — product delete, history, revert, undo/redo (lines ~789-1076).
     Each exports a `changeXxxRoutes(app, deps)` function with the SAME signature shape as today (`changesRoutes`), registering under the same `{ prefix: '/api/v1' }` prefix.
2. Update `app.ts` to register the three modules in place of `changesRoutes` (same prefix, same order — route registration order matters for Fastify matching; preserve it).
3. Do not refactor handler bodies during the split — pure file organization.

## Tests

- The full admin suite must pass UNCHANGED (`npm run admin:test`) — the split is a no-op for the HTTP surface. Run the e2e suites that touch these routes too (`admin/content-manager/test/e2e/import-export.spec.ts`, `change-set.spec.ts`) if cheap; otherwise confirm via integration tests.
- Run: `npm run admin:test` green; `npm run admin:typecheck`; `npm run lint` green.

## Done criteria

- [ ] `changes.ts` no longer exists (or is reduced to a re-export shim).
- [ ] No route path changed (`git diff` on the route registrations shows only file moves).
- [ ] `npm run admin:test` green.

## Maintenance

The 4 responsibilities were already separable by the route registration boundaries — a future import feature now edits `importRoutes.ts` only. A reviewer should verify route ORDER survived the split (Fastify matches by insertion order; overlapping prefixes like `/import` vs `/change-sets` must be unchanged).

## Rollback

`git revert <sha>`.

## STOP conditions

- If two route paths in different split files rely on shared closure state declared at the top of `changes.ts` (module-scoped variables, not per-request), stop and report — the split must thread that state through the deps argument.
