# Plan 237: Build product breadcrumbs from the category slug map, not the raw key

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- astro-poc/src/pages/p/[sku].astro astro-poc/src/lib/catalog.ts test/catalog-queries.spec.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (latent)
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

The product page builds its breadcrumb URL from the raw category **key**,
while the canonical helpers exist precisely because slug ≠ key is
representable (`getCategorySlug`/`getModernCategoryPath`,
`astro-poc/src/lib/catalog.ts:595-611`) and the operator can set them
independently in the admin (`categoryCrudRoutes`). Today every registry
category happens to have slug === key, so the page works; the first slug
rename (or a new category with a different slug) makes every product page
in that category emit a **404 breadcrumb link** and a `BreadcrumbList` item
pointing at a non-existent URL — a Search Console error class — while the
rest of the page (which already uses the helper via `ProductDetail.astro:23,40,151,157`)
keeps working. Confusing to diagnose.

## Current state

`astro-poc/src/pages/p/[sku].astro:58-62`:

```astro
breadcrumbs={[
  { name: 'Inicio', url: '/' },
  { name: item.product.category, url: `/${item.product.category.toLowerCase()}/` },
  { name: item.product.name, url: canonicalPath },
]}
```

`astro-poc/src/lib/catalog.ts:595-611`:

```ts
export function getCategorySlug(categoryKey: string): string { ... }
export function getModernCategoryPath(categoryKey: string): string {
  const slug = getCategorySlug(categoryKey);
  return `/${slug}/`;
}
```

No test covers breadcrumbs (`grep -rn "BreadcrumbList|breadcrumb" test/` →
zero).

## Commands you will need

| Purpose      | Command                                       | Provenance | Expected on success |
| ------------ | --------------------------------------------- | ---------- | ------------------- |
| Install      | `npm ci`                                      | declared   | exit 0              |
| Focused test | `npx vitest run test/catalog-queries.spec.js` | declared   | all pass            |
| Typecheck    | `npm run typecheck`                           | declared   | exit 0              |
| Build fast   | `npm run build:fast`                          | declared   | exit 0              |

## Scope

**In scope**:

- `astro-poc/src/pages/p/[sku].astro`
- `test/catalog-queries.spec.js` (or the closest existing catalog unit spec)

**Out of scope**:

- `category_strip`/related-items logic (already helper-based).
- The breadcrumb visual markup/`StructuredData` component.

## Git workflow

- Branch: `advisor/237-breadcrumb-slug`
- Commit: `fix(storefront): breadcrumb uses the category slug map (plan 237)`.

## Steps

### Step 0: Baseline

`npm ci` + `npx vitest run test/catalog-queries.spec.js` on the unmodified
checkout. Red → STOP.

### Step 1: Use the helper

In `[sku].astro`, import `getModernCategoryPath` (from
`../../lib/catalog.ts` — match the relative path used by the file's other
imports) and replace the inline URL:

```astro
{ name: item.product.category, url: getModernCategoryPath(item.product.category) },
```

### Step 2: Pin the semantics

In the catalog unit spec, add:

- `getModernCategoryPath('bebidas')` === `/bebidas/`;
- a fixture case proving the mapping uses `slug` when it differs from the
  key (mock `getCategoryByKey` input or use whatever fixture injection the
  spec already has for the registry — follow its existing style);
- the same for a missing category (falls back to the key, as today).

**Verify**: `npx vitest run test/catalog-queries.spec.js` → all pass.

### Step 3: Build smoke

`npm run build:fast` and check one product page's breadcrumb:

```bash
grep -o 'href="/[a-z-]*/"[^>]*> *Inicio\|BreadcrumbList' astro-poc/dist/p/*/index.html | head
```

Simpler: open one built product page HTML and confirm the breadcrumb URL
format is unchanged today (slug === key): `grep -c "BreadcrumbList"
astro-poc/dist/p/<sku>/index.html` > 0 and the category crumb href equals
`/<category>/`.

**Verify**: build exit 0; grep shows the breadcrumb JSON-LD.

## Test plan

- Helper-level unit cases (Step 2) — the only reachable pin until a
  slug≠key category exists. Note in the test file that the page consumes
  this helper (one-line comment).
- Optional: if the e2e `product-detail-content.spec.ts` asserts breadcrumb
  structure, extend it to assert `href="/<category>/"` for the fixture
  product.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "getModernCategoryPath" "astro-poc/src/pages/p/[sku].astro"` matches
- [ ] `grep -n "toLowerCase()}/" "astro-poc/src/pages/p/[sku].astro"` returns nothing
- [ ] `npx vitest run test/catalog-queries.spec.js` exits 0 with the new cases
- [ ] `npm run typecheck` exits 0; `npm run build:fast` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A registry category today has slug ≠ key AND the built page already 404s
  the breadcrumb (that upgrades this from latent to live — report the
  category).
- The page already imports a different helper for this purpose (report;
  use it instead).

## Maintenance notes

- New category-derived URLs in Astro pages must use `getModernCategoryPath`;
  reviewers should grep for `toLowerCase()}/` patterns in pages.
- **Deferred:** none.
