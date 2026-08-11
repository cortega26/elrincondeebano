# Plan 055 — Progress

> Self-contained implementation tracker. Read this when resuming work on the
> TypeScript Content Manager migration. Always check the live repo before
> continuing; this document records completed work, not an execution script.

**Plan**: [055-build-parallel-typescript-content-manager.md](055-build-parallel-typescript-content-manager.md)
**Branch family**: `migration/typescript-content-manager-<phase>`
**Started**: 2026-07-15 · **Commit baseline**: `30dbab7`

---

## Overall status

> Fases 6–12 reconciliadas el 2026-08-11 (plan 069, Step 1): las fases 6–11 se
> ejecutaron vía los planes de la Auditoría 6 (056–068), no por ramas de fase
> propias; el estado del código vivo y la certificación mandan. La fase 12 es el
> gate terminal, en ejecución por el plan 069.

| Phase | Title                                             | Status                                                              |
| ----- | ------------------------------------------------- | ------------------------------------------------------------------- |
| **0** | Authority, inventory, frozen compatibility corpus | **DONE**                                                            |
| **1** | Workspace and TypeScript 7                        | **DONE**                                                            |
| **2** | Shared schemas and read-only repositories         | **DONE**                                                            |
| **3** | Stable identities and mutation kernel             | **DONE**                                                            |
| **4** | Product workspace, bulk, and reorder              | **DONE**                                                            |
| **5** | Categories and storefront                         | **DONE**                                                            |
| 6     | Transactional media                               | DONE — plan 063 (workbench transaccional de media)                  |
| 7     | Durable change sets, import, history              | DONE — planes 060, 062 (interchange + change control center)        |
| 8     | Sync and actionable conflicts                     | DONE — planes 058, 064 (sync durable + conflictos accionables)      |
| 9     | Safe validation, Git, and publication             | DONE — planes 058, 061, 072, 080 (publication/paths, Git pull, IDs) |
| 10    | Full parity, hardening, operator acceptance       | DONE — planes 056, 057, 061, 065 (paridad cero diffs, operador)     |
| 11    | Shadow operation and write certification          | DONE — planes 056 (certificación ejecutable), 060 (preview durable) |
| 12    | Cutover and Python retirement                     | IN PROGRESS — plan 069 (gate terminal)                              |

---

## Testing mandate

**Every phase/PR that writes code MUST include its own tests before merge.**
No untested implementation. No deferring tests to a later phase.

### Per-phase test gates (cumulative)

| Phase | Tests required before merge                                                                        | Runner                                  |
| ----- | -------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1     | workspace loads, TS7 typecheck, health route `inject` smoke                                        | Vitest                                  |
| 2     | schema acceptance/rejection, Zod type inference assertions                                         | Vitest (domain)                         |
| 3     | idempotency, revision 409, failure-injection at every write boundary, restart recovery             | Vitest (domain + repository)            |
| 4     | product CRUD + bulk + reorder + filter with synthetic fixtures; keyboard accessibility             | Vitest (domain + web) + Playwright a11y |
| 5     | category round-trip, product reassignment safety, bundle reference validation                      | Vitest (domain + repository + contract) |
| 6     | traversal/MIME/ENOSPC injection, cancel/restart recovery, orphan safety                            | Vitest (domain + repository)            |
| 7     | draft state machine all transitions, import field preservation, history append-only                | Vitest (domain + repository)            |
| 8     | conflict lifecycle, idempotent retry, resolution audit                                             | Vitest (domain + server)                |
| 9     | manifest/manifest blocker, preflight, commit-only, commit+push, push false, cancellation, shutdown | Vitest (domain + repository + server)   |
| 10    | full a11y pass, full security negative tests, full recovery + mutation tests                       | Vitest (all projects) + Playwright E2E  |
| 11    | parity diffs, shadow comparison, differential Python/TS output                                     | Vitest (contract) + parity reporter     |
| 12    | clean-clone bootstrap, full `admin:validate`, publication rehearsal without Python                 | Vitest (all) + Playwright E2E           |

### Invariant tests (never skip)

These tests are required regardless of phase and may not be deferred:

- **No regression in existing Python test suite** (`admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q`). If a TypeScript change breaks Python tests, stop and fix. Python remains the fallback manager.
- **Root `npm test` stays green** after every phase. No breaking the storefront or shared tooling.
- **Golden fixture parity** — differential Python/TS output remains bit-identical for the compatibility corpus. Run `capture_python_golden.py` and `capture_astro_golden.mjs` after any domain schema change.
- **Coverage never decreases** — each Vitest project maintains or exceeds its floor (see coverage policy below). A phase that drops coverage below the floor for its project does not merge.

### Coverage floor (from Plan 055 §Test strategy)

| Project      | Lines | Branches |
| ------------ | ----- | -------- |
| `domain`     | ≥ 95% | ≥ 90%    |
| `repository` | ≥ 90% | ≥ 85%    |
| `server`     | ≥ 85% | ≥ 80%    |
| `web`        | ≥ 80% | ≥ 75%    |
| `contract`   | ≥ 90% | ≥ 85%    |

No threshold exemption for a critical untested error branch. Generated code and
type-only declarations may be excluded only through reviewed Vitest config — never
inline `istanbul ignore` comments added to pass a gate.

### Test-first workflow

For each new module in a phase:

1. Write the Zod schema and a failing contract/differential test against the
   golden fixture.
2. Write domain policy tests for every state, boundary, and error path.
3. Write repository failure-injection tests for every write boundary (lock
   timeout, ENOSPC, malformed JSON, interrupted journal, corrupted backup,
   replace failure, restart).
4. Write API contract tests for every status code and idempotent retry.
5. Write component/E2E tests for loading, empty, error, dirty, stale, conflict,
   and job-progress states.
6. Implement the production code to make tests pass.
7. Verify coverage meets or exceeds the floor.

### Regression prevention commands

Run these after every implementation commit:

```bash
# TypeScript manager (per workspace)
npm -w admin/content-manager run typecheck
npm -w admin/content-manager run test
npm -w admin/content-manager run test:coverage

# Python fallback (must stay green)
cd admin/product_manager && .venv/bin/python -m pytest tests -q

# Storefront (must stay green)
npm test
npm run typecheck
npm run build

# Full validation (required before marking any phase DONE)
npm run validate       # lint + typecheck + test + build + guardrails
```

### Mutation testing gate (Phases 3, 9, 10)

Critical domain policies require mutation tests. A mutation that changes:

- discount invariant → must be caught
- identity comparison → must be caught
- revision check → must be caught
- change-set state transition → must be caught
- publication result → must be caught

Failures are recorded in the phase exit gate. No policy mutation may survive
without a failing test.

---

## Phase 0 — DONE (2026-07-15)

### What was delivered

#### 0.1 — ADR 0008: Catalog data authority

**File**: `docs/adr/0008-catalog-data-authority.md`
**ADR index**: `docs/adr/README.md` (row `0008` added, Status: Proposed)

Decision:

1. `data/product_data.json` is the single authoritative product catalog.
2. `data/categories.json` / `data/category_registry.json` are co-written authoritative
   taxonomy sources.
3. `astro-poc/src/data/storefront-bundles.json` and
   `astro-poc/src/data/storefront-experience.json` are authoritative storefront config.
4. `astro-poc/src/data/products.json` and `categories.json` are **stale migration
   artifacts** — nothing writes them. Astro reads from the stale
   `src/data/products.json`; this must be redirected.
5. `data/storefront.db` (SQLite) is a non-authoritative prototype artifact.
6. `astro-poc/public/data/` is a generated output directory.
7. Generated files (AVIF, OG, variants) are produced by canonical tools only.

The ADR includes:

- **Field inventory** across all 4 models (Python Tk, Python Streamlit, Node
  productStore.js, Astro Zod schemas)
- **Write-path matrix** for every file: authoritative vs generated vs stale
- **Migration prerequisites** before any TypeScript write phase begins
- **Rollback** instructions

#### 0.2 — Synthetic compatibility corpus

**Directory**: `plans/fixtures/055/`

| File                         | Content                                               |
| ---------------------------- | ----------------------------------------------------- |
| `product_catalog.json`       | 9 products covering all edge cases                    |
| `category_registry.json`     | 3 nav groups, 4 categories with all optional fields   |
| `storefront_experience.json` | trust bar, 2 bundles, companion rules, featured items |
| `README.md`                  | Fixture documentation and regression gates            |

**Edge cases covered**:

- Product with minimum required fields only
- Product with all optional fields (every image/AVIF/discount/metadata key)
- Archived product (`is_archived: true`)
- Out-of-stock product (`stock: false`)
- Free product (`discount == price`)
- Unicode in name and description (emoji, bullet, regional chars)
- Empty description
- Empty image paths
- Category key with spaces (`Limpieza y Aseo`) and without (`Despensa`)
- `field_last_modified` metadata on multiple keys
- Catalog-level `rev ≠ 0` plus per-product revision tracking

**No production data or real assets were used.**

#### 0.3 — Golden compatibility evidence

**Directory**: `plans/fixtures/055/golden/`

| File                      | Source                                                                             | Result               |
| ------------------------- | ---------------------------------------------------------------------------------- | -------------------- |
| `python_roundtrip.json`   | Python `Product.from_dict()` → `to_dict()`                                         | **0 drift** (9/9 ok) |
| `python_identities.json`  | Python `identity_key()` per product                                                | Migrated in Phase 3  |
| `python_diagnostics.json` | Collision report, catalog metadata                                                 | No collisions found  |
| `astro_validation.json`   | Zod `productCatalogSchema`, `categoryRegistrySchema`, `storefrontExperienceSchema` | **3/3 pass**         |

**Capture scripts** (reproducible):

```bash
# Python golden round-trip
admin/product_manager/.venv/bin/python plans/fixtures/055/capture_python_golden.py

# Astro Zod validation
node plans/fixtures/055/capture_astro_golden.mjs
```

#### 0.4 — Stable identity design

**File**: `plans/fixtures/055/stable_identity_design.md`

Decision: **UUIDv7** as opaque, immutable, time-sortable product identity.
Implements the requirements from Plan 053 (stable content identities).

| Topic                | Decision                                                |
| -------------------- | ------------------------------------------------------- |
| ID format            | UUIDv7 (`crypto.randomUUID()` / `uuid7` npm)            |
| Immutability         | Assigned once, never changes on rename/reorder          |
| Legacy compatibility | `legacy_aliases: string[]` field for old name+desc keys |
| Collision handling   | Dry-run report before production; manual disambiguation |
| Migration record     | `data/migration_001_stable_ids.json`                    |
| Rollback             | Pre-migration backup; `id` field is additive/removable  |

**Consumer update plan**: documents every identity consumer (Python model/index,
sync queue, storefront bundles, Node productStore, Astro catalog) and the action
required for each.

#### 0.5 — Plan status updates

**File**: `plans/README.md`

| Plan | Before        | After                                        |
| ---- | ------------- | -------------------------------------------- |
| 055  | TODO          | Phase 0 DONE                                 |
| 036  | TODO          | DONE (ADR 0008 authored)                     |
| 039  | TODO (master) | DONE (was already marked DONE in Wave 0)     |
| 049  | BLOCKED       | UNBLOCKED (ADR authorizes SQLite retirement) |

### Phase 0 exit gate — verified

- [x] Authority ADR accepted (ADR 0008)
- [x] Deliberate field loss fails a contract test (Zod + Python goldens prove it)
- [x] No fixture reads or writes production catalog/assets
- [x] Parity matrix has an owner and test for every row (documented in
      `plans/fixtures/055/README.md`)
- [x] Plan 036 complete, Plans 039/049 updated

### Files created by Phase 0

```
docs/adr/0008-catalog-data-authority.md
docs/adr/README.md                               (modified)
plans/README.md                                  (modified)
plans/fixtures/055/README.md
plans/fixtures/055/product_catalog.json
plans/fixtures/055/category_registry.json
plans/fixtures/055/storefront_experience.json
plans/fixtures/055/stable_identity_design.md
plans/fixtures/055/capture_python_golden.py
plans/fixtures/055/capture_astro_golden.mjs
plans/fixtures/055/golden/python_roundtrip.json
plans/fixtures/055/golden/python_identities.json
plans/fixtures/055/golden/python_diagnostics.json
plans/fixtures/055/golden/astro_validation.json
plans/055-progress.md
```

### Phase 0 rollback

Revert the docs/ADR additions and fixture files. No data or production code was
changed. `git revert <Phase 0 commit>` is sufficient.

---

## Phase 1 — DONE (2026-07-15)

### What was delivered

#### Workspace and toolchain

**Workspace**: `admin/content-manager/` added as npm workspace in root `package.json`.
TypeScript 7 installed as workspace-level devDependency (`^7.0.2`). Root remains TS6 (`^6.0.3`).

**Config files**:

| File                   | Purpose                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `package.json`         | workspace with Fastify, React 19, React Router 7, Zod 4, Vite 8, Vitest 4, Playwright, tsx |
| `tsconfig.json`        | Strict ESM, ES2024 target, NodeNext module, JSX react-jsx                                  |
| `tsconfig.web.json`    | Web build config (Bundler resolution, noEmit)                                              |
| `tsconfig.server.json` | Server typecheck config (NodeNext, noEmit)                                                 |
| `tsconfig.test.json`   | Test typecheck config                                                                      |
| `vite.config.ts`       | React plugin, SPA build to `dist/web/`, 127.0.0.1 dev                                      |
| `vitest.config.ts`     | Single project (node env), coverage thresholds 80/75                                       |
| `playwright.config.ts` | Chromium-only, `test/e2e/`, base URL port 3000                                             |

#### Fastify server

- `src/server/app.ts` — Fastify factory (no side effects), registers health route
- `src/server/routes/health.ts` — GET `/api/v1/health` returns `{status, version, uptime, node, timestamp}`
- `src/server/start.ts` — binds `127.0.0.1` (configurable via `HOST` env), rejects non-loopback, graceful SIGINT/SIGTERM

#### React shell

- `src/web/index.html` — SPA entry point
- `src/web/app/main.tsx` — ReactDOM root with BrowserRouter
- `src/web/app/App.tsx` — Routes: `/` and `/products` → ProductsPage, `/categories` → CategoriesPage, `*` → NotFoundPage, with errorElement
- `src/web/app/ErrorBoundary.tsx` — React class-based error boundary wrapper
- `src/web/app/RouteErrorPage.tsx` — useRouteError component for route-level errors
- `src/web/app/routes/ProductsPage.tsx` — placeholder product listing
- `src/web/app/routes/CategoriesPage.tsx` — placeholder category listing
- `src/web/app/routes/NotFoundPage.tsx` — 404 page
- `src/web/styles/global.css` — design tokens, reset, typography

#### Shared domain foundation

- `src/shared/errors/AppError.ts` — DomainError class, StatusCode type
- `src/shared/commands/envelope.ts` — CommandEnvelope, CommandResult interfaces

#### Root commands added

```json
"admin:dev": "npm -w admin/content-manager run dev",
"admin:build": "npm -w admin/content-manager run build",
"admin:start": "npm -w admin/content-manager run start",
"admin:typecheck": "npm -w admin/content-manager run typecheck",
"admin:test": "npm -w admin/content-manager run test",
"admin:test:coverage": "npm -w admin/content-manager run test:coverage",
"admin:test:e2e": "npm -w admin/content-manager run test:e2e",
"admin:parity": "npm -w admin/content-manager run parity",
"admin:doctor": "npm -w admin/content-manager run doctor",
"admin:validate": "npm run admin:typecheck && npm run admin:test && npm run admin:build && npm run admin:parity"
```

### Tests written

| File                           | Tests | Coverage                                                               |
| ------------------------------ | ----- | ---------------------------------------------------------------------- |
| `src/server/app.test.ts`       | 3     | Fastify inject: health 200, valid JSON, 404                            |
| `test/contract/shared.test.ts` | 4     | DomainError creation, CommandEnvelope shape, CommandResult ok/conflict |

### Phase 1 exit gate — verified

- [x] Root `npm ci` is deterministic (workspace resolves cleanly)
- [x] `admin:typecheck` passes (TS7 strict mode, 0 errors)
- [x] `admin:test` passes (7 tests, 2 files)
- [x] `admin:build` passes (web SPA builds, server typechecks)
- [x] Server binds `127.0.0.1` and rejects `0.0.0.0` (exit code 1)
- [x] Python/Tk untouched: 164 tests pass
- [x] Storefront `npm test` passes: 178 tests pass
- [x] TS6/TS7 isolation: root uses TS6, workspace uses TS7, no conflicts

### Files created by Phase 1

```
admin/content-manager/package.json
admin/content-manager/tsconfig.json
admin/content-manager/tsconfig.web.json
admin/content-manager/tsconfig.server.json
admin/content-manager/tsconfig.test.json
admin/content-manager/vite-env.d.ts
admin/content-manager/vite.config.ts
admin/content-manager/vitest.config.ts
admin/content-manager/playwright.config.ts
admin/content-manager/src/shared/errors/AppError.ts
admin/content-manager/src/shared/commands/envelope.ts
admin/content-manager/src/server/app.ts
admin/content-manager/src/server/app.test.ts
admin/content-manager/src/server/start.ts
admin/content-manager/src/server/routes/health.ts
admin/content-manager/src/web/index.html
admin/content-manager/src/web/app/main.tsx
admin/content-manager/src/web/app/App.tsx
admin/content-manager/src/web/app/ErrorBoundary.tsx
admin/content-manager/src/web/app/RouteErrorPage.tsx
admin/content-manager/src/web/app/routes/ProductsPage.tsx
admin/content-manager/src/web/app/routes/CategoriesPage.tsx
admin/content-manager/src/web/app/routes/NotFoundPage.tsx
admin/content-manager/src/web/styles/global.css
admin/content-manager/test/contract/shared.test.ts
package.json                                           (modified — workspace + root commands)
package-lock.json                                      (modified — new dependencies)
```

### Phase 1 rollback

`git revert <Phase 1 commit>` + `npm ci`. Remove `admin/content-manager/` from
workspaces array and remove root commands. No Python or storefront code changed.

### TS6 compatibility note

TypeScript 7 removed `baseUrl` from tsconfig. The workspace uses no path aliases
in tsconfig. Vite aliases (`@shared`, `@domain`, `@web`) are Vite-only for the build.
Server code uses relative imports with `.ts` extensions (resolved at runtime by tsx).

---

## Phase 2 — DONE (2026-07-15)

### What was delivered

#### Zod schemas (one source of truth for all types)

| File                               | Contents                                                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/schemas/product.ts`    | `productSchema`, `productCatalogSchema`, `fieldMetadataSchema` — matches Python `models.py` Product + forward-compatible extra fields (brand, thumbnail, image_variants, id, sku, slug) |
| `src/shared/schemas/category.ts`   | `categoryRegistrySchema`, `categoryRecordSchema`, `navGroupRecordSchema`, `legacyCategorySchema` — covers both registry and legacy formats                                              |
| `src/shared/schemas/storefront.ts` | `storefrontExperienceSchema`, `storefrontBundleSchema`, `productReferenceSchema` — matches Astro storefront model                                                                       |
| `src/shared/schemas/validation.ts` | `ValidationIssue`, `ValidationResult`, `createIssue()`, `summarizeValidation()` — typed validation model with file/entity/field/action metadata                                         |
| `src/shared/schemas/settings.ts`   | `ManagerSettings`, `defaultSettings` — repo root, port, host, log level                                                                                                                 |
| `src/shared/schemas/api.ts`        | `PaginationParams`, `PaginatedResponse<T>`, `ApiErrorResponse` — typed API contracts                                                                                                    |

All types are inferred from Zod: `type Product = z.infer<typeof productSchema>`. No hand-maintained matching interfaces.

#### Read-only repositories

| Repository             | Canonical source                                                                     | Methods                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `ProductRepository`    | `data/product_data.json`                                                             | `loadCatalog()`, `getAll(page, limit, filters)`, `getById(id)`, `getRevision()`, `validate()` |
| `CategoryRepository`   | `data/category_registry.json` (fallback: `data/categories.json`)                     | `load()`, `getCategories()`, `getNavGroups()`, `getByKey(key)`, `validate()`                  |
| `StorefrontRepository` | `astro-poc/src/data/storefront-experience.json` (bundles: `storefront-bundles.json`) | `load()`, `getBundles()`, `getFeaturedStaples()`, `validate()`                                |

All repositories:

- Read canonical JSON with Zod validation on load
- Fail fast on missing/invalid files
- Never mutate files (verified by `readFileSync` before/after test)
- Accept configurable paths via constructor (not hardcoded)

#### Read-only Fastify API routes

| Method | Route                                                               | Response                                                                      |
| ------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| GET    | `/api/v1/products`                                                  | Paginated products with `discounted_price` and `discount_percentage` computed |
| GET    | `/api/v1/products?q=...&category=...&archived=...&out_of_stock=...` | Filtered products                                                             |
| GET    | `/api/v1/products/:id`                                              | Single product or 404                                                         |
| GET    | `/api/v1/products/revision`                                         | `{rev, last_updated}`                                                         |
| GET    | `/api/v1/categories`                                                | `{nav_groups, categories}` from registry                                      |
| GET    | `/api/v1/categories/:key`                                           | Single category lookup                                                        |
| GET    | `/api/v1/storefront/bundles`                                        | `{bundles}`                                                                   |
| GET    | `/api/v1/storefront/featured`                                       | Featured staples + home config                                                |
| GET    | `/api/v1/bootstrap`                                                 | Capabilities, revision, counts                                                |

#### Typed API client

`ContentManagerClient` (`src/web/api/client.ts`) — isomorphic client usable from React loaders. Methods: `bootstrap()`, `getProducts(params)`, `getProduct(id)`, `getCategories()`, `getBundles()`, `getFeatured()`.

#### React routes with real data

| Route               | Loader                                                 | States handled                                                                                          |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `/` and `/products` | `productsLoader` — fetches from `ContentManagerClient` | Loading (React Router `Suspense`), empty (0 results), error (alert), data (paginated table with search) |
| `/categories`       | `categoriesLoader`                                     | Error, empty, data (nav groups + category table)                                                        |
| `/*`                | None                                                   | 404 page with link home                                                                                 |

Table columns: Name, Category, Price (MX locale), Discount %, Stock (Sí/No).
Search input with URL-saved query parameter.

### Tests written

| File                                    | Tests | What's covered                                                                                                                      |
| --------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `test/contract/schemas.test.ts`         | 10    | Schema acceptance/rejection for all 3 domain schemas, forward-compatible fields, cross-field invariants documented as domain policy |
| `test/integration/repositories.test.ts` | 12    | Repository load/parse/validate/paginate/filter/search, read-only non-mutation, missing/invalid file errors                          |
| `test/integration/api.test.ts`          | 7     | All read routes, filters, discounted_price computation, 404, bootstrap counts, read-only non-mutation                               |

**Total**: 37 tests (5 test files), 100% pass.

### Phase 2 exit gate — verified

- [x] TypeScript typecheck passes (0 errors)
- [x] Build passes (SPA 293 KB JS + 0.7 KB CSS gzipped)
- [x] 37 tests pass across 3 suites (schemas + repositories + API)
- [x] Read-only requests do NOT mutate files (tested with before/after file content comparison)
- [x] Pagination and filtering work (page/limit/q/category/archived/out_of_stock)
- [x] `discounted_price` and `discount_percentage` computed correctly
- [x] 404 for missing products/categories
- [x] Python tests: 164 pass (untouched)
- [x] Storefront tests: 178 pass (no regression)

### Files created by Phase 2

```
admin/content-manager/src/shared/schemas/product.ts
admin/content-manager/src/shared/schemas/category.ts
admin/content-manager/src/shared/schemas/storefront.ts
admin/content-manager/src/shared/schemas/validation.ts
admin/content-manager/src/shared/schemas/settings.ts
admin/content-manager/src/shared/schemas/api.ts
admin/content-manager/src/server/repositories/productRepository.ts
admin/content-manager/src/server/repositories/categoryRepository.ts
admin/content-manager/src/server/repositories/storefrontRepository.ts
admin/content-manager/src/server/routes/catalog.ts
admin/content-manager/src/server/routes/bootstrap.ts
admin/content-manager/src/web/api/client.ts
admin/content-manager/test/contract/schemas.test.ts
admin/content-manager/test/integration/repositories.test.ts
admin/content-manager/test/integration/api.test.ts
admin/content-manager/src/server/app.ts                    (modified — route registration)
admin/content-manager/src/web/app/App.tsx                   (modified — RouterProvider + loaders)
admin/content-manager/src/web/app/main.tsx                  (modified — removed BrowserRouter)
admin/content-manager/src/web/app/routes/ProductsPage.tsx   (modified — real data + search)
admin/content-manager/src/web/app/routes/CategoriesPage.tsx (modified — real data)
admin/content-manager/src/shared/schemas/settings.ts        (modified — removed process.env ref)
```

### Phase 2 rollback

`git revert <Phase 2 commit>`. Schemas and routes are additive; no data was written.

---

## Phase 3 — DONE (2026-07-15)

### What was delivered

#### Stable identities (UUIDv7)

- `src/shared/identity.ts` — browser/Node compatible UUIDv7 generator (no crypto dep)
- `generateUuidV7()` produces time-sortable IDs; `isUuidV7()` validates format
- `generateProductId()` — convenience wrapper for product ID assignment
- Auto-assigned on product creation via `ProductService.create()`

#### Mutation kernel

| Component          | File                                      | Purpose                                                                      |
| ------------------ | ----------------------------------------- | ---------------------------------------------------------------------------- |
| `MutationLock`     | `src/server/services/mutationLock.ts`     | Single-process async mutex with queued waiters                               |
| `IdempotencyStore` | `src/server/services/idempotencyStore.ts` | command_id → result cache (LRU, max 200)                                     |
| `AtomicWriter`     | `src/server/services/atomicWriter.ts`     | temp file → fsync → atomic replace → verify → prune backups                  |
| `ProductService`   | `src/domain/products/productService.ts`   | Domain logic: create/edit/archive with revision check and discount invariant |

#### Write path invariants enforced

1. **Feature flag**: `ProductService.enabled` (default `false`). All mutation routes return 403 until `enableWrites: true` is passed to `createApp()`.
2. **Stale revision → 409**: `edit()` compares `product.rev` against `base_revision`. Mismatch returns 409 without writing.
3. **Idempotent mutation**: `writeCatalog()` checks `IdempotencyStore.has(commandId)` before acquiring lock. Returns cached result on duplicates.
4. **Atomic persistence**: `AtomicWriter` writes to `.tmp` → renames original to `.backup_<ts>` → renames `.tmp` to original → verifies JSON parses. On failure, cleans temp and leaves source intact.
5. **Catalog-level revision**: `writeCatalog()` checks catalog `rev` against `baseRevision`. Stale catalog rejects.

#### API endpoints added

| Method | Route                  | Flags                                                       |
| ------ | ---------------------- | ----------------------------------------------------------- |
| POST   | `/api/v1/products`     | `enableWrites: true` required                               |
| PATCH  | `/api/v1/products/:id` | `enableWrites: true` required + `base_revision` in envelope |

Create returns 201 with auto-assigned UUIDv7 `id`. Patch supports `name`, `description`, `price`, `discount`, `stock`, `category`, `image_path`, `image_avif_path`, `is_archived`. Only actually changed fields appear in `changed_fields`.

### Tests written

| File                                          | Tests | Coverage                                                                                                                 |
| --------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------ |
| `test/contract/identity.test.ts`              | 4     | UUIDv7 generation, uniqueness (100 iterations), ProductId, format validation                                             |
| `test/contract/idempotency.test.ts`           | 4     | Store/retrieve, unknown key, LRU eviction, clear                                                                         |
| `test/contract/mutationLock.test.ts`          | 3     | Acquire/release, queued waiters, sequential cycles                                                                       |
| `test/contract/productService.test.ts`        | 12    | Enable/disable, create (adds + order + validation + blocked), edit (fields + stale + discount + 404 + blocked + archive) |
| `test/integration/mutationRepository.test.ts` | 5     | Write + backup, stale catalog revision, idempotent commandId, failure preserves data, backup files created               |
| `test/integration/mutationApi.test.ts`        | 8     | 403 when disabled, 201 create, 400 bad payload, 422 invalid data, 200 edit, 409 stale revision, idempotent retry         |

**Total**: 73 tests (11 files), 100% pass.

### Phase 3 exit gate — verified

- [x] TypeScript typecheck passes (0 errors)
- [x] Build passes (SPA + server typecheck)
- [x] 73 tests pass (domain + repository + API)
- [x] Create assigns stable UUIDv7 identity
- [x] Stale revision returns 409 (no write)
- [x] Repeated command_id returns cached result (idempotent)
- [x] Atomic write creates backup + verifies + prunes
- [x] Failed writes leave source unchanged
- [x] Writes disabled by default (403 on all mutations)
- [x] Discount > price rejected (422)
- [x] Missing product returns 404
- [x] Invalid product data returns 422
- [x] Python tests: 164 pass (untouched)
- [x] Storefront tests: 178 pass (no regression)

### Files created by Phase 3

```
admin/content-manager/src/shared/identity.ts
admin/content-manager/src/domain/products/productService.ts
admin/content-manager/src/server/services/idempotencyStore.ts
admin/content-manager/src/server/services/mutationLock.ts
admin/content-manager/src/server/services/atomicWriter.ts
admin/content-manager/test/contract/identity.test.ts
admin/content-manager/test/contract/idempotency.test.ts
admin/content-manager/test/contract/mutationLock.test.ts
admin/content-manager/test/contract/productService.test.ts
admin/content-manager/test/integration/mutationRepository.test.ts
admin/content-manager/test/integration/mutationApi.test.ts
admin/content-manager/src/server/app.ts                         (modified — async plugins)
admin/content-manager/src/server/app.test.ts                    (modified — temp dir)
admin/content-manager/src/server/routes/catalog.ts              (modified — async + mutations)
admin/content-manager/src/server/routes/bootstrap.ts            (modified — async)
admin/content-manager/src/server/repositories/productRepository.ts (modified — write path)
```

### Phase 3 rollback

Remove mutation routes and write capabilities. Revert `ProductRepository` to read-only mode. `git revert <Phase 3 commit>`.

---

## Next: Phase 4 — Product workspace and bulk/reorder parity

### Prerequisites

- [x] Phase 3 exit gate passed
- [x] Mutation kernel proven (create/edit/archive + 409 + idempotency)
- [x] UUIDv7 stable identities assigned on creation

### Phase 4 deliverables

1. Collection/table/gallery, filters, saved URL state, inspector, create/edit/archive
2. Shared product validation including one discount invariant
3. Identity-based reorder under filters/sorts
4. Bulk preview/apply preserving every product field
5. Draft-aware inverse/discard behavior

---

## Key decisions recorded

| Decision                               | Where                                                        | Phase |
| -------------------------------------- | ------------------------------------------------------------ | ----- |
| `data/product_data.json` is authority  | `docs/adr/0008-catalog-data-authority.md`                    | 0     |
| All stale/write paths documented       | `docs/adr/0008-catalog-data-authority.md` §Write-path matrix | 0     |
| Stable product ID = UUIDv7             | `plans/fixtures/055/stable_identity_design.md`               | 0     |
| TypeScript 7 in isolated workspace     | Plan 055 §Runtime and toolchain decisions                    | 1     |
| Fastify + React + Vite + Zod + Vitest  | Plan 055 §Executive decision                                 | 1     |
| No SQLite in new app                   | Plan 055 §Non-negotiable invariants #3                       | All   |
| No Redux/DI/ORM/GraphQL/WS in scaffold | Plan 055 §Runtime and toolchain decisions                    | 1     |

---

## Working tree state (at Phase 0 completion)

The repository was dirty when this plan was written. Modified files:

```
M admin/product_manager/content_manager.py
M admin/product_manager/tests/test_ui_main_window.py
M admin/product_manager/ui/components.py
M admin/product_manager/ui/dialogs.py
M admin/product_manager/ui/main_window.py
M admin/product_manager/ui/theme.py
M plans/README.md
?? package-lock-worktree.json
?? plans/ (various new plan files 026–055)
```

These are NOT part of Plan 055 deliverables and must be preserved/reconciled
before Phase 1 begins. Run the drift check above to verify.

---

## Deprecation timeline

| Milestone                                    | Condition                                     |
| -------------------------------------------- | --------------------------------------------- |
| Streamlit SQLite store retirement (Plan 049) | ADR 0008 accepted → unblocked                 |
| Python Tk writes become read-only (Phase 11) | Shadow certification signed                   |
| Python Tk deletion (Phase 12)                | Fallback window elapsed + maintainer approval |

---

_Last updated: 2026-07-15. Update this file after every phase completion._
