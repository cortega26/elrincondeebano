# Plan 177: Fix admin filter badge, sync-form clobbering, and export/share feedback

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/web/app/components/useProductsQuery.ts admin/content-manager/src/web/app/components/FilterBar.tsx admin/content-manager/src/web/app/routes/ProductsPage.tsx admin/content-manager/src/web/app/components/SyncStatusPanel.tsx astro-poc/src/scripts/storefront/cart-view.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: bug
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Three operator/shopper-facing feedback defects, all display/state logic,
all one-line-class fixes: (1) the filter badge permanently shows "Filtros
activos: 1" because the implicit `archived='false'` baseline is counted, so
Limpiar never clears it — eroding trust in the filter/reorder gating
signals that guard plans 088/101. (2) Every 30s poll and every SSE message
resets the sync config form mid-typing (and a malformed SSE frame throws
inside the listener with no signal). (3) JSON export has no `.catch` (CSV
does) and the share-cart button claims success before the clipboard promise
settles. None touches server semantics.

## Current state

Relevant files:

- `admin/content-manager/src/web/app/components/useProductsQuery.ts` —
  `archived` defaults to `'false'` (line ~47), `activeFilterCount` counts
  every non-`''` (lines 72–82).
- `admin/content-manager/src/web/app/components/FilterBar.tsx` — badge
  renders when `> 0` (lines 168–185).
- `admin/content-manager/src/web/app/routes/ProductsPage.tsx` —
  `filtersActive` correctly excludes the baseline (lines 204–219); poll/SSE
  `setSyncConfig` (lines 100–158); JSON export without catch (lines 234–245)
  vs CSV with catch (lines 247–268).
- `admin/content-manager/src/web/app/components/SyncStatusPanel.tsx` —
  controlled inputs (lines 119–125).
- `astro-poc/src/scripts/storefront/cart-view.js` — share label set
  synchronously (lines 219–225), empty `.catch`.

Excerpts (verified by advisor read):

```ts
// useProductsQuery.ts — baseline counted as a filter
const archived = searchParams.get('archived') ?? 'false';
const activeFilterCount = [
  q,
  category,
  archived,
  outOfStock,
  minPrice,
  maxPrice,
  discountedOnly,
  minDiscount,
  maxDiscount,
].filter((v) => v !== '').length;
```

```tsx
// ProductsPage.tsx — poll + SSE both reset the form; SSE parse unguarded
setSyncConfig({ enabled: s.enabled, api_base: s.api_base ?? '', api_token: '' });
// ...
source.addEventListener('message', (event) => {
  const d = JSON.parse(event.data) as { ... };  // throws on malformed frame
```

```tsx
// ProductsPage.tsx — JSON export: no .catch (CSV branch has one)
void client.exportJson().then((catalog) => { ... setFeedback('Export JSON descargado ✓'); });
```

```js
// cart-view.js — success claimed before the promise settles
shareBtn.addEventListener('click', function () {
  shareCart(cart);
  shareBtn.textContent = '¡Enlace copiado!';   // sync; writeText still pending
```

Conventions: operator feedback via `setFeedback`/`setOpError`; UI text in
Spanish; web tests use the mocked `harness.tsx` (`productsPage.test.tsx`).

## Commands you will need

| Purpose          | Command                                             | Provenance | Expected on success |
| ---------------- | --------------------------------------------------- | ---------- | ------------------- |
| Install          | `npm ci`                                            | declared   | exit 0              |
| Typecheck        | `npm run admin:typecheck`                           | declared   | exit 0              |
| Tests            | `npm run admin:test`                                | declared   | all pass            |
| Storefront tests | `npm test` (root vitest only needs cart-view specs) | declared   | pass                |

## Scope

**In scope**:

- The five files above (UI logic only).
- `admin/content-manager/test/web/productsFeedback.test.tsx` (create)

**Out of scope**:

- Server sync, export endpoints, clipboard API behavior (untouched).
- Bulk empty-field UX guard (belongs with plan 172's server `skipped`
  reporting — wire the display of `skipped` here ONLY if trivial; otherwise
  report as follow-up).
- Any styling/design changes beyond the existing badge/label patterns.

## Git workflow

- Branch: `advisor/177-admin-feedback-papercuts`
- Commit per fix; e.g. `fix(admin): exclude archived baseline from filter count (plan 177)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Requires plan 170 DONE. Install + typechecks + relevant tests unmodified.

**Verify**: green; otherwise STOP.

### Step 1: Exclude the archived baseline from the count

In `useProductsQuery.ts`, count `archived` only when it differs from the
implicit baseline (`'false'`): i.e. count it when `archived === 'true'` (or
any explicit non-default view the UI adds later — implement as
`archived !== 'false' && archived !== ''`... note default IS `'false'`, so
count only `archived === 'true'`). This must agree with `filtersActive` in
`ProductsPage.tsx` (which already treats `'false'` as baseline).

**Verify**: `npm run admin:typecheck` → exit 0.

### Step 2: Stop clobbering the sync form; guard the SSE parse

- Skip `setSyncConfig` from poll/SSE while the config panel is open
  (`showSyncConfig` true) or while its fields are dirty (whichever the code
  already tracks — inspect; minimal change: gate on the panel-open flag).
  Status (`setSyncStatus`) keeps updating always.
- Wrap the SSE `JSON.parse` in try/catch; on malformed frame, ignore the
  frame (and optionally surface a one-time `setOpError` — prefer silent
  ignore to avoid error spam; document the choice in the commit).

**Verify**: `npm run admin:typecheck` → exit 0.

### Step 3: Honest export/share feedback

- JSON export: mirror the CSV branch — append `.catch((err) =>
setOpError(...))`.
- Share button: move `shareBtn.textContent = '¡Enlace copiado!'` inside the
  clipboard promise's `.then`, with a failure label (e.g. `No se pudo
copiar`) in `.catch`. Inspect `shareCart` first: if it does not return the
  clipboard promise, thread it through (minimal change, same file only).

**Verify**: typechecks (admin + root) pass.

### Step 4: Add web tests

Create `admin/content-manager/test/web/productsFeedback.test.tsx`:

1. Default view (`archived='false'`) → badge absent; setting a real filter
   → badge `1`; Limpiar → badge absent.
2. Sync poll while config panel open → form inputs keep typed values.
3. JSON export rejection → `setOpError` path (mock `exportJson` rejected).
4. Share click with denied clipboard → failure label, not success label.

**Verify**: `npm run admin:test` + root vitest cart specs → pass.

## Test plan

- New web test file, 4 cases above (harness pattern).
- Existing `productsPage.test.tsx` and cart-view specs unchanged and green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:typecheck` exits 0; root typecheck unaffected.
- [ ] `npm run admin:test` exits 0 with the 4 new feedback tests passing.
- [ ] `grep -n "archived" admin/content-manager/src/web/app/components/useProductsQuery.ts` shows the count excludes the `'false'` baseline.
- [ ] `grep -n "JSON.parse(event.data)" admin/content-manager/src/web/app/routes/ProductsPage.tsx` is inside try/catch.
- [ ] `grep -n "exportJson().then" admin/content-manager/src/web/app/routes/ProductsPage.tsx` is followed by a `.catch` within 30 lines.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Excerpts do not match (drift).
- `shareCart` lives outside `cart-view.js` or cannot return the promise
  without a wider refactor (report; do the label move only if local).
- The sync panel state shape differs (no `showSyncConfig` flag and no dirty
  tracking — report the actual shape instead of inventing one).

## Maintenance notes

- The badge count and `filtersActive` must stay consistent — future filters
  update BOTH in the same commit (leave a code comment pointing at the twin).
- Reviewer: confirm the silent-ignore choice for malformed SSE frames.
- **Deferred:** displaying plan 172's `skipped` count in bulk feedback (file
  separately if not trivial here).
