# Plan 187: Trim storefront runtime — scoped entry, payload caps, hot-path maps

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- astro-poc/src/layouts/BaseLayout.astro astro-poc/astro.config.mjs astro-poc/src/scripts/storefront.js astro-poc/src/pages/index.astro astro-poc/src/components/CategoryCatalogPage.astro astro-poc/src/scripts/storefront/storefront-state.ts astro-poc/src/scripts/storefront/storage-contract.ts astro-poc/src/scripts/storefront/personalization.js astro-poc/src/scripts/storefront/cart-view.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: perf
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Every page — including content-only 404/estacionamiento/product-detail —
loads the full interactive bundle (`storefront.js`: Bootstrap collapse,
dropdown, alert, offcanvas + catalog + cart + order + personalization) via a
module script in `BaseLayout`, with `prefetchAll: hover` speculative storms
on link-dense pages. Each qty click pays O(cards) DOM scans (while a cached
`getProductCardMap` already exists), 3–4 full cart re-validations, a full-DOM
action-area sweep, a `localStorage` probe write, and a full rewrite of all
product signals. Individually small; stacked on every click on 184-card
pages they compound into jank. All fixes are local and behavior-preserving.

## Current state

Relevant files (all excerpts verified by advisor read):

```astro
<!-- BaseLayout.astro ~163-165 — module script on EVERY page (deferred, but full bundle parsed) -->
<script> import '../scripts/storefront.js'; </script>
```

```js
// astro.config.mjs prefetch — everything on hover
prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
```

```js
// storefront.js:395-399 vs 403-415 — linear scan beside a cached Map
function getProductCardById(id) {
  return Array.from(document.querySelectorAll('.producto')).find(...);
}
let productCardCache = null;
function getProductCardMap() { ...cached Map... }
```

```js
// storefront.js:1206-1212 getQty/setQty cart.find/findIndex per click;
// storefront.js:1213-1261 setQty calls getCartState 3-4× (prev, next, badge, cart);
// storefront.js:505-512 syncAllActionAreas sweeps ALL .action-area[data-pid]
```

```ts
// storefront-state.ts:64-73 — getCartState sanitizes the whole cart per call
export function getCartState(cart: unknown): CartState {
  const normalizedCart = sanitizeCart(cart); ...
```

```ts
// storage-contract.ts:44-57,89-124 — canUseStorage probe (setItem+removeItem) per loadJson/saveJson
```

```js
// personalization.js:13-25 — trackProductSignal parses+rewrites ALL signals per add;
// storefront.js:1266-1268 calls it on every quantity increase
```

```astro
<!-- index.astro:179-184 full storefrontExperience inlined; CategoryCatalogPage.astro:44-53 full structuredProducts JSON-LD per category page -->
```

Conventions: vanilla JS + the extracted `storefront/` modules (plan 116);
`getProductCardMap` invalidation rules must be preserved (find where the
cache is reset and keep it); E2E `test/e2e-astro/cart-ux.spec.ts` pins cart
behavior — run it (or justify skipping per AGENTS配偶). Mutation baseline:
`storefront-state.ts` 90.91% — keep semantics identical.

## Commands you will need

| Purpose         | Command                                                          | Provenance | Expected on success       |
| --------------- | ---------------------------------------------------------------- | ---------- | ------------------------- |
| Install         | `npm ci`                                                         | declared   | exit 0                    |
| Tests           | `npx vitest run test/`                                           | declared   | all pass                  |
| Build           | `npm run build:fast`                                             | declared   | exit 0                    |
| E2E (closing)   | `npm run test:e2e` or `PLAYWRIGHT_SKIP_BUILD=1 npm run test:e2e` | declared   | pass (cart-ux at minimum) |
| Audit (closing) | `npm run lighthouse:audit`                                       | declared   | no regression vs before   |

## Scope

**In scope**: the files above (entry scoping, prefetch narrowing, payload
trimming, map routing, single-compute state, scoped action sync, probe cache,
signal debounce).

**Out of scope**: visual changes; Bootstrap deep-import changes (plan 118
done — do not relitigate); catalog-view sort keys (plan 120/149, done);
breaking the bundle into async chunks beyond guarded dynamic `import()`.

## Git workflow

- Branch: `advisor/187-storefront-runtime-perf`
- Commit per step (entry → payload → hot paths → storage/signals).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline (correctness + perf evidence)

Requires plan 170 DONE. `npx vitest run test/` green; `npm run build:fast`
green; record a `lighthouse:audit` (or simple bundle-size + click-handler
timing note) as the before-number.

**Verify**: green; numbers recorded; otherwise STOP.

### Step 1: Scope the entry point; narrow prefetch

- Gate catalog/cart/personalization controller init on DOM-root presence
  (only run each controller where its root exists; keep header/badge/cart
  globals working on all pages — content pages keep a minimal core).
  Prefer guarded `import()` at the existing init sites over restructuring.
- Narrow prefetch: catalog links only (or `viewport` strategy) instead of
  `prefetchAll: hover`. Verify no page depends on prefetched non-catalog
  targets for correctness (prefetch is speculative — it shouldn't, but check
  the parking/estacionamiento flows).

**Verify**: vitest green; `build:fast` green; cart-ux E2E green.

### Step 2: Cap inline payloads

- Inline only `companionRules` (+ minimal bundle IDs) instead of the full
  `storefrontExperience` object for client use (keep server-rendered HTML
  unchanged).
- Cap/truncate JSON-LD item lists per category page with a documented limit
  (record the number in a comment; SEO plan compatibility — run the SEO
  specs).

**Verify**: SEO specs + build-contract tests green; HTML payload smaller
(record bytes for home + one category page before/after).

### Step 3: Hot-path maps + single-compute state + scoped sync

- Route all `getProductCardById` callers (`addBundleItems`,
  `updateQtyByDelta`, etc.) through `getProductCardMap().get(id)`,
  preserving invalidation.
- `setQty`: compute `getCartState` ONCE per mutation; pass prev/next into
  badge/cart/companion sync. Keep a `Map<id,index>` alongside `cart` for
  `getQty`/updates instead of repeated `find`/`findIndex` (invalidate on
  splice/push — or rebuild per mutation; document the choice).
- Scope action-area sync to `[data-pid="<id>"]` for the changed item (keep
  full `syncAllActionAreas` for full renders, e.g. initial load).

**Verify**: vitest green; cart-ux E2E green.

### Step 4: Probe once; debounce signals

- Cache `canUseStorage` result per page session (first probe wins; storage
  availability does not change mid-page in practice — document the
  assumption).
- Debounce/coalesce `saveProductSignals` behind a short flush (e.g. 500 ms
  trailing + `visibilitychange`/`pagehide` flush so no signal is lost).

**Verify**: vitest green; full `npm test` (root) green.

## Test plan

- Existing cart/storage/personalization specs + cart-ux E2E are the pins
  (behavior must not change — this plan is timing-only).
- Add: a unit test asserting `getCartState` call count per `setQty` is 1
  (spy), and a storage-probe count test (probe runs once per session).
- Closing: `npm run test:e2e` (cart-ux minimum) + lighthouse no-regression.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx vitest run test/` exits 0 (incl. 2 new perf-pin tests).
- [ ] Cart-ux E2E green; lighthouse no regression vs Step-0 numbers.
- [ ] Home + category HTML payload smaller (record bytes in commit).
- [ ] `grep -n "getProductCardById" astro-poc/src/scripts/storefront.js` shows only the definition + Map-backed implementation (no linear callers).
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Any page functionally needs the full monolith at init (report which DOM
  roots the controllers actually require — then narrow the plan to
  prefetch + hot paths only).
- JSON-LD truncation breaks an SEO contract test (restore full lists for
  that surface; report).
- `getProductCardMap` invalidation cannot cover a routed caller (leave that
  caller on the scan + report).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- New controllers MUST self-gate on DOM presence (add to the file's header
  comment as the rule) or content pages regress to monolith loading.
- Reviewer: scrutinize the debounce flush paths (unload loss) and the probe
  caching assumption.
- **Deferred:** deeper code-splitting (route-level chunks) — only if this
  plan's numbers show the bundle still dominates.
