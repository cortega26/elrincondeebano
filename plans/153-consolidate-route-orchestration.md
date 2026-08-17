# 153 — Consolidate route orchestration into a catalog-command helper

- **Source**: Auditoría 10, DEBT-02 · **Status**: TODO · **Priority**: P2 · **Effort**: M
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/server/routes/productRoutes.ts admin/content-manager/src/server/routes/categoryRoutes.ts admin/content-manager/src/server/services/productService.ts`

## Problem

Route handlers repeat the full write pipeline and orchestrate the repositories directly, bypassing the service layer as a transactional unit. In `productRoutes.ts` the same 7-step sequence appears 5× (POST `:161-210`, PATCH `:212-332`, batch-update `:338-425`, reorder `:427-478`, bulk/apply `:527-581`): envelope guard → `repos.products.loadCatalog()` (20 sites across routes) → `baseRev = catalog.rev` → service call → error mapping (the ternary `statusCode===409?'CONFLICT':...` appears 17× in `server/`) → `writeCatalog` → success envelope with `resulting_revision`. Guards are copy-pasted ("Missing command_id" 7×). Error handling is 169 inline `reply.status(...)` sends vs 7 `throw new HttpError` — the central handler (`app.ts:412`) is bypassed by the majority of routes.

The domain service (`productService.ts:559`) is only an in-memory mutator; invariants spanning "validate + persist" can't live in one place, and per-route error codes drift (`REORDER_SCOPE_AMBIGUOUS` at `productRoutes.ts:446`, `NO_MATCHES` at `:63`).

## Scope

**In**: `admin/content-manager/src/server/routes/productRoutes.ts` (primary), a new helper module (e.g. `src/server/routes/catalog-command.ts`), integration tests (`test/integration/mutationApi.test.ts`, `reorderBulkApi.test.ts`, `writeBoundary.test.ts` — the existing suites pin the contract).

**Out**: `categoryRoutes.ts`, `changes.ts`, the response shapes, the 409/retry contract the web client and e2e depend on, `writeCatalog`/idempotency interplay (`productRepository.ts:112-118`).

## Steps

1. Build `catalog-command.ts` exposing a small helper, e.g. `runCatalogCommand(repos, body, apply, { reply })` that owns: envelope guard (command_id present) → loadCatalog → baseRev → `apply(catalog)` (returns `{ ok, statusCode, error }`) → `writeCatalog(catalog, command_id, baseRev)` → success envelope with `resulting_revision`. Route bodies shrink to the domain-specific `apply` closure and their own validation.
2. Refactor the 5 product routes onto it. Preserve EXACT response envelopes and status codes — the integration + e2e suites are the proof. The reorder endpoint keeps its full-catalog check (plan 088, see plan 128) as the domain `apply`.
3. Do NOT convert error handling to `throw HttpError` in this plan (that is a separate consolidation with the central handler); just stop the copy-paste.
4. Run the admin suite. Any contract change fails a test — investigate, don't paper over.

## Tests

- No new test _files_; the existing `mutationApi`, `reorderBulkApi`, `writeBoundary`, and e2e suites must pass unchanged — they assert the envelopes, statuses, and the 409 contract.
- Add one focused test for the helper itself if easy (envelope guard + write-failure mapping) following `test/contract/` style; optional.
- Run: `npm run admin:test` green; `npm run admin:typecheck`; `npm run lint` green.

## Done criteria

- [ ] The 5 product routes use the helper (grep for the boilerplate pattern → fewer hits; target: no repeated loadCatalog+writeCatalog pairs in `productRoutes.ts`).
- [ ] Full admin suite green with zero response-shape changes.
- [ ] `npm run admin:test` green.

## Maintenance

This must land AFTER plans 128 (reorder fix) and 141 (withFreshRev test) — both touch the same flow and their tests pin the retry contract. A reviewer should confirm the idempotency interplay in `writeCatalog` is untouched: the helper must pass through the same `command_id` and `baseRev` the routes passed today.

## Rollback

`git revert <sha>`.

## STOP conditions

- If a route's failure path has a custom status code the helper can't express, stop and report that route — do not generalize it away.
