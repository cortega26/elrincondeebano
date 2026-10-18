# Plan 221: One product-filter contract for list, bulk scope, and CSV export

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- admin/content-manager/src/shared/productFilters.ts admin/content-manager/src/shared/schemas/importExport.ts admin/content-manager/src/server/routes/productRoutes.ts admin/content-manager/src/server/routes/importRoutes.ts admin/content-manager/src/server/repositories/productRepository.ts admin/content-manager/src/web/api/products.ts admin/content-manager/src/web/app/routes/ProductsPage.tsx admin/content-manager/src/server/openapi.ts admin/content-manager/test/integration/exportBulkParity.test.ts admin/content-manager/test/integration/exportApi.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

The product list (`GET /products`) and the CSV export filter with three
divergent implementations of the same contract:

- List `q` matches **name + description + category**
  (`productRepository.ts:199,221-222`); export `q` matches **name +
  description only** (`importRoutes.ts:66-71`).
- List `category` compares case-insensitively after trim
  (`productRepository.ts:218`); export compares exact equality
  (`importRoutes.ts:72-74`).
- Export **has no price filters at all** — `csvExportQuerySchema`
  (`importExport.ts:100-108`) does not accept `min_price`/`max_price`, and
  `ProductsPage.tsx:205-213` does not send them — although the list and
  bulk-scope both support them. An operator who filters by price and clicks
  "Export CSV" silently receives rows outside the filter.

After this plan: one shared parser + the repository's canonical predicate is
the only filter path; export/lists/bulk are equal by construction, pinned by
a parity test.

## Current state

`admin/content-manager/src/server/repositories/productRepository.ts:195-225`
— canonical semantics (single pass; `q` over name/description/category;
falsy-skips; clamps live in the route layer today).

`admin/content-manager/src/server/routes/productRoutes.ts:30-55`
(`parseBulkFilters`) and `:117-155` (GET query parse) — two more copies with
subtly different coercions (body booleans vs query strings; different
clamps).

`admin/content-manager/src/server/routes/importRoutes.ts:60-92` — the export
re-implementation:

```ts
const { q, category, archived, out_of_stock, discounted_only, min_discount, max_discount } = query.data;
let products = repos.products.loadCatalog().products;
if (q) { const needle = q.toLowerCase(); products = products.filter((p) =>
  p.name.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle)); }
if (category !== undefined) { products = products.filter((p) => p.category === category); }
...
```

`admin/content-manager/src/shared/schemas/importExport.ts:100-108` —
`csvExportQuerySchema` (no price fields).

`admin/content-manager/src/web/app/routes/ProductsPage.tsx:205-213` —
`exportCsv({ q, category, archived, out_of_stock, discounted_only,
min_discount, max_discount })` (no price fields; comment at `:181` says
"export the current filtered view").

Existing parity test to extend:
`admin/content-manager/test/integration/exportBulkParity.test.ts` (plan
165/192 pattern); export tests in `exportApi.test.ts` (e.g. `:199`), all
using the temp-repo + `app.inject` pattern.

## Commands you will need

| Purpose         | Command                                                                                                                                                             | Provenance | Expected on success |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install         | `npm ci`                                                                                                                                                            | declared   | exit 0              |
| Admin typecheck | `npm run admin:typecheck`                                                                                                                                           | declared   | exit 0              |
| Focused tests   | `npx vitest run test/integration/exportBulkParity.test.ts test/integration/exportApi.test.ts test/integration/productFilters.test.ts` (cwd `admin/content-manager`) | declared   | all pass            |
| Admin tests     | `npm run admin:test`                                                                                                                                                | declared   | all pass            |
| Lint (admin)    | `npm run admin:lint`                                                                                                                                                | declared   | exit 0              |

## Scope

**In scope**:

- `admin/content-manager/src/shared/productFilters.ts` (create)
- `admin/content-manager/src/shared/schemas/importExport.ts`
- `admin/content-manager/src/server/routes/productRoutes.ts`
- `admin/content-manager/src/server/routes/importRoutes.ts`
- `admin/content-manager/src/web/api/products.ts` (the `exportCsv` method)
- `admin/content-manager/src/web/app/routes/ProductsPage.tsx`
- `admin/content-manager/src/server/openapi.ts` (only if it documents the export query params)
- `admin/content-manager/test/integration/exportBulkParity.test.ts`, `exportApi.test.ts`

**Out of scope** (do NOT touch):

- `productRepository.ts` predicate internals — it is the canonical semantics
  this plan converges on; no behavior change there.
- Pagination (`page`/`limit`), CSV column order/format, the CSV formula
  guard, import/apply paths.
- The storefront side of the catalog.

## Git workflow

- Branch: `advisor/221-product-filter-parity`
- Commits: `refactor(admin): single product-filter contract (plan 221)`.

## Steps

### Step 0: Establish a green baseline

Run Install then the focused tests on the unmodified checkout. If a
`declared` command fails, STOP and report.

**Verify**: focused tests → all pass.

### Step 1: Extract the shared contract

Create `admin/content-manager/src/shared/productFilters.ts`:

```ts
export interface ProductFilters {
  q?: string;
  category?: string;
  archived?: boolean;
  out_of_stock?: boolean;
  min_price?: number;
  max_price?: number;
  discounted_only?: boolean;
  min_discount?: number;
  max_discount?: number;
}

// Query-string shape (GET /products, /export.csv): all values are strings.
export function parseQueryFilters(query: Record<string, string | undefined>): ProductFilters;

// JSON-body shape (bulk scope): booleans/numbers arrive typed.
export function parseBodyFilters(raw: unknown): ProductFilters;
```

Rules (single source of truth — copy the exact coercions currently in
`productRoutes.ts:117-155` for the query shape and `:30-55` for the body
shape, including clamps `min/max price ≥ 0`, discount 0–100, `''` → undefined;
non-finite numbers → `undefined` for the parser, and the GET route keeps its
existing non-finite → empty-result behavior by checking after parse).

**Verify**: `npm run admin:typecheck` → exit 0.

### Step 2: Rewire the three consumers

1. `productRoutes.ts`: delete `parseBulkFilters` and the inline GET parse;
   call the shared parsers. Keep response shapes byte-identical for the
   existing test matrix.
2. `importRoutes.ts` export: replace the manual filtering block with the
   canonical path:

   ```ts
   const filters = parseQueryFilters(query.data);
   let products = repos.products.getAll(1, Number.MAX_SAFE_INTEGER, filters).items;
   ```

   (the same call `resolveBulkIds`'s `scope: 'all'` uses —
   `productRoutes.ts:62`). Keep everything from the `escapeCsv` line onward
   untouched.

3. `csvExportQuerySchema`: add `min_price: z.string().optional()` and
   `max_price: z.string().optional()` (string shape, matching the other
   fields).
4. `web/api/products.ts` `exportCsv`: add `min_price?`/`max_price?` to the
   params type and pass them through; `ProductsPage.tsx` export call: send
   `min_price: minPrice || undefined, max_price: maxPrice || undefined`
   matching whatever the page's list query variables are named.
5. `openapi.ts`: if the export route lists query params, add the two; if it
   is generated from the zod schema, nothing to do — verify.

**Verify**: `npx vitest run test/integration/exportApi.test.ts test/integration/productFilters.test.ts` (cwd `admin/content-manager`) → all pass; fix any test whose expectation encoded the old export-only semantics and say so in the commit message.

### Step 3: The parity test

Extend `exportBulkParity.test.ts` with a table-driven case: for each filter
key set (including `q` matching only a category name, `category` with
different case, `min_price`/`max_price`, `min_discount`, `out_of_stock`,
`archived`, and a combination), assert:

- ids from `GET /products?…&limit=200` (paginate if needed) == ids in the
  CSV export rows for the same query, and
- ids from bulk `scope: 'all'` with the equivalent body filters == the same
  set.

**Verify**: `npx vitest run test/integration/exportBulkParity.test.ts` (cwd
`admin/content-manager`) → all pass with the new cases.

### Step 4: Full gates

**Verify**: `npm run admin:test` → all pass; `npm run admin:typecheck` →
exit 0; `npm run admin:lint` → exit 0; if the OpenAPI document changed,
`npx vitest run test/contract/openapi.test.ts` (cwd `admin/content-manager`)
→ all pass.

## Test plan

- New table-driven parity test (Step 3).
- Keep every existing export test; where an expectation encoded the drift
  (q not searching category; category exact-match), update it and note the
  intentional behavior change in the commit body.
- Pattern: `exportBulkParity.test.ts`, `exportApi.test.ts`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:test` exits 0
- [ ] `npm run admin:typecheck` exits 0 and `npm run admin:lint` exits 0
- [ ] `grep -n "parseBulkFilters" admin/content-manager/src/server/routes/productRoutes.ts` returns nothing
- [ ] `grep -n "loadCatalog().products" admin/content-manager/src/server/routes/importRoutes.ts` returns nothing (export uses the repository path)
- [ ] `grep -n "min_price" admin/content-manager/src/shared/schemas/importExport.ts` matches
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- `repos.products.getAll(1, Number.MAX_SAFE_INTEGER, filters)` returns a
  different set than the previous export for an existing test (report the
  diff — it may reveal drift in the repository predicate instead).
- The export route streams (not buffers) the CSV — then keep its streaming
  shape and apply the shared filters before serialization instead of
  switching to `getAll`.
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- New filter keys must be added to `productFilters.ts` +
  `csvExportQuerySchema` + the parity table in the same commit; the parity
  test is the enforcement.
- Reviewer: confirm the CSV bytes for an unfiltered export are unchanged
  (column order, escaping).
- **Deferred:** `min_stock`/date filters do not exist today; when added,
  they follow the same single-source rule.
