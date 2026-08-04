# Plan 074: Enforce the discount ≤ price invariant at every write boundary and align the schemas

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 30dbab7..HEAD -- admin/content-manager/src astro-poc/src/lib astro-poc/src/data`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: MED
- **Depends on**: plans/070-commit-canonical-content-manager.md
- **Category**: correctness
- **Planned at**: commit `30dbab7`, 2026-08-03

## Why this matters

The canonical catalog can be written with `discount > price` through two
normal UI flows, corrupting downstream consumers:

1. **Price edit**: `productService.edit` checks `discount > price` only when
   the _discount_ changes (`productService.ts:181-190`); lowering a price
   below an existing discount passes.
2. **Bulk percent discount**: `bulkApply`'s `set_discount_percent` branch
   computes `Math.round(price * pct/100)` with no bound (`:373-374`) — 150 %
   persists a discount larger than the price. (The `set_discount_fixed`
   branch has the guard at `:378-379`.)

The invariant is enforced in three imperative validators across the repo
(Python `models.py:141`, JS `productStore.js:129-131`, TS `productService`),
but absent from **both** zod schemas — and the two schemas contradict each
other: the content-manager schema allows `category: ""` while Astro requires
`min(1)`, so a CM-written product can break the storefront build.

After this plan: every write boundary rejects `discount > price` with a 422,
the percent branch clamps, both zod schemas carry the invariant (enforced at
write, lenient at read), and the category requiredness contradiction is
resolved.

## Current state

Verified code (read directly):

- `admin/content-manager/src/domain/products/productService.ts:181-190`:
  ```ts
  if (params.changes.discount !== undefined && params.changes.discount !== product.discount) {
    if (params.changes.discount > product.price) {
      return { ok: false, error: `Discount (...) cannot exceed price (...)`, statusCode: 422 };
    }
    product.discount = params.changes.discount;
  }
  ```
  Note the price-change branch above it (`:165-178`) has no
  `newPrice < product.discount` check.
- `productService.ts:370-374`:
  ```ts
  case "set_discount_percent":
    product.discount = Math.round(product.price * ((operation.value as number) / 100));
    break;
  ```
- `admin/content-manager/src/shared/schemas/product.ts:14-16`:
  `discount: z.number().int().nonnegative()` (no cross-field check);
  `category: z.string().max(50).default("")`.
- `astro-poc/src/lib/data-schemas.ts:16-22`: `discount: z.number().nonnegative().optional()`,
  `category: z.string().min(1)` — contradicts the CM schema.
- `admin/content-manager/src/server/repositories/productRepository.ts:164-200`
  — `validate()` flags `discount > price` as a post-commit issue
  (`:184-192`); that path stays as a safety net, but must not be the only gate.
- The catalog is loaded through `productCatalogSchema.safeParse` on every
  read (`productRepository.ts:53-57`) — **any superRefine added to the schema
  must not fail on existing legacy files at read time** (see Step 2).

Repo conventions: zod 4.4.3 in both workspaces; the CM domain tests live in
`test/contract/productService.test.ts` and `test/contract/discountMutation.test.ts`
(existing discount tests — extend them). Astro schemas are used by
`astro-poc/scripts/validate-data-schemas.mjs` in the build chain.

## Commands you will need

| Purpose     | Command                   | Expected on success        |
| ----------- | ------------------------- | -------------------------- |
| Typecheck   | `npm run admin:typecheck` | exit 0                     |
| CM tests    | `npm run admin:test`      | exit 0                     |
| Root tests  | `npm test`                | exit 0 (Astro-side change) |
| Astro check | `npm run typecheck:astro` | exit 0                     |

## Scope

**In scope**:

- `admin/content-manager/src/shared/schemas/product.ts`
- `admin/content-manager/src/domain/products/productService.ts`
- `admin/content-manager/test/contract/discountMutation.test.ts` (+ maybe
  `productService.test.ts`)
- `astro-poc/src/lib/data-schemas.ts` — the invariant only (do NOT loosen the
  Astro category rule; see Step 3)
- `astro-poc/scripts/validate-data-schemas.mjs` — only if the read-lenient
  strategy requires it (verify first; likely untouched)

**Out of scope**:

- Unifying the five identity schemes (plan 065 / direction item).
- Changing `productSchema` field requiredness beyond `category`.
- The Python fallback's invariant (already correct at `models.py:141`).

## Git workflow

- Branch: `advisor/074-enforce-discount-invariant`.
- Commit per step, conventional style (`fix(admin): enforce discount <= price on all write paths`), `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Guard the price-edit and bulk-percent paths

In `productService.ts`:

- In `edit`, after the price-change branch, add: if
  `newPrice < product.discount` → 422 (mirror the existing discount message).
- In `bulkApply`'s `set_discount_percent` branch, clamp:
  `product.discount = Math.min(product.price, Math.round(product.price * (value / 100)))`
  — and the same in `bulkPreview` if it has the percent branch.

**Verify**: extend `test/contract/discountMutation.test.ts` (follow its
existing pattern): edit price below discount → 422; bulk percent 150 → clamps
to price; preview percent 150 → clamped. `npm run admin:test` exit 0.

### Step 2: Add the invariant to the CM schema — write-strict, read-lenient

In `product.ts`, add a `superRefine` to `productSchema` that fails when
`discount > price`, and **do not** run it on the read path: the repository's
`loadCatalog` uses `productCatalogSchema.safeParse` — so add the refine to
the _write_ schema (`productSchema`) and keep `productCatalogSchema` (or a
read variant) lenient. Concretely:

- `productSchema` = the strict write schema (with superRefine).
- `productCatalogSchema` = lenient (products array of a read variant without
  the cross-field refine), used by `loadCatalog` and `validate()` — the
  `validate()` function already reports discount issues explicitly.

Follow the existing schema-file structure (exported consts; see
`product.ts` lines 1-30 for naming conventions).

**Verify**: `npm run admin:typecheck` exit 0; add a contract test in
`test/contract/schemas.test.ts`: strict schema rejects `{price: 100, discount: 150}`,
read variant accepts it; a legacy-style file with `discount > price` still
loads via `loadCatalog` (integration: write such a file in a temp repo,
`app.inject` GET /products → 200).

### Step 3: Align the category contradiction (CM side)

Make the CM schema's `category` required with `min(1)` — matching Astro's
rule — OR normalize `""` → a valid value at the write boundary. Choose by
checking what the product form sends (grep `category` in
`src/web/app/routes/ProductsPage.tsx`); if the form can send `""` for a
new product, the form default must change in the same commit. Do NOT loosen
the Astro schema.

**Verify**: `npm run admin:test` exit 0; `npm test` exit 0 (root suite still
passes with the Astro schema untouched).

### Step 4: Regression check on the live catalog

Run the doctor/validation path against the real catalog:

```bash
node --import tsx admin/content-manager/scripts/doctor.ts   # or npm run admin:doctor
```

**Verify**: no `discount_exceeds_price` issues reported for the current
`data/product_data.json`. If there are any, report them — do not silently
repair data in this plan (data repair is a separate decision).

## Test plan

- `test/contract/discountMutation.test.ts` — extend: price-below-discount
  edit → 422; percent clamp; preview clamp (Step 1).
- `test/contract/schemas.test.ts` — strict vs lenient schema behavior
  (Step 2).
- Integration (temp repo): legacy file with `discount > price` still loads;
  write attempt via products PATCH that would create the state → 422.
- **Verify**: `npm run admin:test` exit 0 with the new tests; `npm test`
  exit 0.

## Done criteria

- [ ] Edit price below discount → 422 (test proves it)
- [ ] Bulk percent discount clamps to price (test proves it)
- [ ] Strict write schema rejects `discount > price`; read path stays lenient
      (tests prove both)
- [ ] CM `category` no longer contradicts Astro's `min(1)` (either required
      in CM or normalized at write)
- [ ] `npm run admin:typecheck`, `npm run admin:test`, `npm test` exit 0
- [ ] `npm run admin:doctor` reports no `discount_exceeds_price` on the real catalog
- [ ] `plans/README.md` status row 074 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The live catalog already contains products with `discount > price` — do not
  fix the data, report it.
- Making `category` required in the CM breaks the product form in a way that
  needs a UX decision (report the form behavior you found).
- The read-lenient strategy conflicts with an existing schema consumer you
  find (e.g. `changeSetSchema` reusing `productSchema`) — map the consumers
  first, then choose.

## Maintenance notes

- The invariant now lives in four places (two schemas + two imperative
  guards). When plan 065 lands the single canonical contract, the schema is
  the right home — the imperative guards become defense-in-depth.
- `validate()` (`productRepository.ts:164-200`) remains the offline auditor —
  keep it in sync with the schema's message wording.
- Reviewer focus: the read/write schema split must not silently drop the
  `discount > price` error from any write path — grep for
  `productSchema.safeParse` usage sites after the change and confirm each is
  write-side.
