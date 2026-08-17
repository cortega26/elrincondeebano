# 150 — Memoize stable admin-server data (OpenAPI doc, storefront file)

- **Source**: Auditoría 10, PERF-07 (scoped) · **Status**: TODO · **Priority**: P2 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/server/openapi.ts admin/content-manager/src/server/routes/openapi.ts admin/content-manager/src/server/repositories/storefrontRepository.ts`

## Problem

The admin server recomputes stable data on every request:

1. **OpenAPI doc rebuilt per request.** `admin/content-manager/src/server/routes/openapi.ts:6-8` calls `buildOpenApi()` (`openapi.ts:36`) on every `GET /openapi.json` — a full `OpenApiGeneratorV3` build from the zod schemas, no memoization. The doc is static between deploys.
2. **Storefront file re-read + re-validated per request.** `storefrontRepository.ts:39-79` `load()` re-reads and re-`safeParse`s the storefront experience file on every call; `getBundles` → `load` per request (`storefront.ts:22-24`). Small file, but the re-parse is pure waste.

**Deliberately OUT of scope**: the per-request `structuredClone` of the product catalog (`productRepository.ts:48-60`). That clone is the plan-105 per-request isolation guarantee (mutations never leak between requests); do NOT cache it away.

## Scope

**In**: `admin/content-manager/src/server/openapi.ts` + `routes/openapi.ts`, `admin/content-manager/src/server/repositories/storefrontRepository.ts`, tests (`test/contract/openapi.test.ts`, `test/contract/storefront`/`storefrontCuration` integration).

**Out**: `productRepository.ts` clone semantics (plan 105), the route response shapes.

## Steps

1. **OpenAPI**: build the document once per process — either a module-level `const OPENAPI_DOC = buildOpenApi()` in `openapi.ts` or a lazy memo in the route file — and serve the same object on every request. (The route currently calls the builder; if the route file imports from `openapi.ts`, hoist the build there.)
2. **StorefrontRepository**: add an mtime+size-keyed cache to `load()` (the `ProductRepository.loadCatalog` pattern at `productRepository.ts:51-60`), invalidated on the repository's own writes. Keep the `safeParse` on cache miss.
3. Verify no behavior change: response bytes identical.

## Tests

- `openapi.test.ts` pattern: two consecutive `GET /openapi.json` responses are identical; (optional) spy that the generator runs once.
- Storefront: two consecutive `load()`s with no write return the same parsed object (assert identity `toBe`); after a write, the next `load()` reflects it (existing `storefrontCuration`/`subcategoryBundles` tests already cover the write path — they must stay green).
- Run: `npm run admin:test` green; `npm run admin:typecheck`; `npm run lint` green.

## Done criteria

- [ ] `GET /openapi.json` served from the memoized build (asserted or by construction + existing tests).
- [ ] Storefront `load()` cached across unchanged reads and invalidated on write (asserted).
- [ ] `npm run admin:test` green.

## Maintenance

If the OpenAPI doc ever becomes request-dependent (e.g. dynamic base URL), the memoization must be revisited. A reviewer should confirm the catalog `structuredClone` was NOT touched — that is plan-105's isolation guarantee.

## Rollback

`git revert <sha>`.

## STOP conditions

- If `buildOpenApi()` has request-dependent inputs (e.g. `request.url`), stop and report — the memoization is invalid.
