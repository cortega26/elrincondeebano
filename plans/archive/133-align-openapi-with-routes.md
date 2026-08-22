# 133 — Align the OpenAPI document with the actual routes

- **Source**: Auditoría 10, CORR-09 · **Status**: TODO · **Priority**: P2 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/server/openapi.ts admin/content-manager/src/server/routes/productRoutes.ts admin/content-manager/src/server/routes/publication.ts admin/content-manager/test/contract/openapi.test.ts`

## Problem

Plan 127 F2.3 shipped an OpenAPI document generated from the zod schemas as "the single source of truth for the client/server contract" — but it advertises routes that do not exist and misdocuments real shapes. The contract test only checks path existence, not shapes (`test/contract/openapi.test.ts:51`), so the doc silently drifts.

Verified mismatches in `admin/content-manager/src/server/openapi.ts`:

- `:304-308` registers `GET /api/v1/publications` — the route file `publication.ts` only registers `POST /publications`, `POST /publications/preview`, `GET /publications/recovery` (the SPA catch-all 404s `/api/*`).
- `:53-57` list-products response declared as `{ products, total, page, pageSize }` — the actual route returns `{ page, limit, total, items }` (`productRoutes.ts:127-136`).
- `:65-73` create-product request body declared as a bare product (`productReadSchema.omit({ rev: true })`) — the route requires the envelope `{ command_id, payload }` (`productRoutes.ts:164-173`).

## Scope

**In**: `admin/content-manager/src/server/openapi.ts`, `test/contract/openapi.test.ts`.

**Out**: The routes themselves, the client, the web UI.

## Steps

1. Remove the non-existent `GET /publications` registration (or replace with the real recovery endpoint if absent).
2. Correct the documented shapes to the actual envelope semantics:
   - list-products response → `{ page, limit, total, items }`.
   - create/update products request body → `{ command_id, payload }` with the payload schema.
   - Audit the remaining registrations in the file the same way (categories, storefront bundles, media, sync, changes, backup, diagnostics) — for every one, compare against the corresponding route file's actual request/response handling and fix mismatches. When in doubt about a response shape, prefer omitting the response schema over declaring a wrong one.
3. Extend `test/contract/openapi.test.ts` so it catches shape drift, not just path existence: for each client method, parse the OpenAPI doc and assert that the method's request payload validates against the declared request schema (zod `.safeParse` of the client's payload type against the documented schema). Keep the existing path-coverage assertion.

## Tests

- Extend `test/contract/openapi.test.ts` per step 3; the existing test's structure is the pattern.
- Run: `npm run admin:test` green; `npm run admin:typecheck`; `npm run lint` green.

## Done criteria

- [ ] No registration in `openapi.ts` points at an unregistered route (grep the doc output: every path exists in the route files).
- [ ] The shape assertions in step 3 pass for every client method.
- [ ] `npm run admin:test` green.

## Maintenance

This plan is prerequisite evidence for plan 163 (generated typed client): with shape assertions in place, the hand-written client can no longer drift silently. If 163 lands, this test becomes the guard for the generated client instead.

## Rollback

`git revert <sha>`.

## STOP conditions

- If a route's actual shape turns out to be _intentionally_ different from the doc (doc-first contract), stop and report which one — the direction of the fix must be decided explicitly.
