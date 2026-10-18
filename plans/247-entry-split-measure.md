# Plan 247: Content-page JS/CSS budget — measure first, split only what the measurement justifies

> **Executor instructions**: This is a measure-then-decide plan. Follow it
> step by step. If the measurement gate says "not shaded", your deliverable
> is the recorded decision in `plans/README.md` (REJECTED with numbers) and
> in the deferrals register (plan 250) — not an implementation. Do not
> improvise a split that the gate rejected. When done, update the status
> row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- astro-poc/src/layouts/BaseLayout.astro astro-poc/src/scripts/storefront.js astro-poc/src/components/Navbar.astro plans/archive/187-storefront-runtime-perf.md`
> If any changed, re-read before measuring; unexplained divergence is a
> STOP condition.

## Status

- **Priority**: P3 (gated — may resolve to a recorded rejection)
- **Effort**: S (measurement) / M+ (implementation, only if gated in)
- **Risk**: MED if implemented (entry touches every page)
- **Depends on**: none; must respect plan 187's recorded deferral
- **Category**: perf
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

`BaseLayout.astro:184-190` imports the full storefront entry on **every**
page; the built `/impresiones/` page (the new printing landing) loads
`BaseLayout.*.js` ≈ 102 KB raw / 32 KB gzip plus `BaseLayout.*.css` ≈
214 KB raw / 32 KB gzip, while the page's own script/style are ~4 KB gzip.
Plan 187 closed with "entry-split deferido con evidencia" and a STOP
condition covering exactly this; the audit re-opened it **only against the
new surface (printing/content pages)** — this plan re-measures with the
current bundle and decides honestly:

- The shared Navbar contains the cart offcanvas, so cart-runtime _behavior_
  is needed on all pages; the realistic saving is parse/execute of the
  catalog slice on pages without `#product-container` (and possibly CSS
  splitting), not "remove the entry".
- Threshold to implement: **≥ 10 KB gzip total reduction on `/impresiones/`
  first-load JS+CSS** with no Lighthouse regression vs the last recorded
  numbers (plan 216: mobile 71/100/100/100). Below the threshold → record
  REJECTED with measurements and stop.

## Commands you will need

| Purpose           | Command                                                                                                                       | Provenance | Expected on success |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install           | `npm ci`                                                                                                                      | declared   | exit 0              |
| Build             | `npm run build`                                                                                                               | declared   | exit 0              |
| Sizes             | `ls -la astro-poc/dist/_astro/` + gzip sizes                                                                                  | declared   | recorded            |
| Per-page coverage | Playwright/CDP coverage run on `/impresiones/` and `/bebidas/` (write a throwaway script under `/tmp/opencode`, not the repo) | declared   | module list         |
| Lighthouse        | `npm run lighthouse:audit`                                                                                                    | declared   | compare to recorded |
| E2E               | `npm run test:e2e`                                                                                                            | declared   | green               |

## Scope

**In scope (only if the gate passes)**:

- `astro-poc/src/scripts/storefront.js` (entry bootstrap restructure or a
  new thin bootstrap module)
- `astro-poc/src/layouts/BaseLayout.astro` (script tags only)
- `astro-poc/src/scripts/storefront/*` (dynamic-import boundary only)

**Out of scope**:

- Redesigning the cart/offcanvas availability contract (all pages keep it).
- Plan 187's settled hot-path maps; `check:e2e-selectors` and the
  View-Transitions re-init (`astro:after-swap`) must keep working —
  STOP if they break.

## Steps

### Step 1: Measure (read-only)

1. Fresh `npm run build`; record gzip sizes of every `_astro/*.js|css`
   loaded by `/impresiones/` and `/bebidas/` (parse the HTML for
   `<script>`/`<link>` and `wc -c` after `gzip -9`).
2. Run a CDP coverage session against `127.0.0.1` serving `dist` on both
   pages; record which storefront modules execute (coverage JSON).
3. Record `npm run lighthouse:audit` mobile numbers for `/impresiones/`.

### Step 2: Compute the candidate saving

The candidate: split the catalog-only slice (catalog view + filter logic +
its deps) behind a dynamic import while keeping cart/nav/bootstrap eager
(that is what a no-product-container page does not need at parse time).
Estimate the saving from the coverage data (sum of the catalog modules'
transferred bytes) — not from raw module sizes. Compare against the 10 KB
gzip gate.

**If below gate** → write the numbers into the plan's completion note +
`plans/README.md` row (REJECTED, "measured X KB < 10 KB gate; entry stays
unified — see plan 187"), add it to the deferrals register (plan 250), and
STOP. Done.

### Step 3: Implement (only if gated in)

Minimal, reversible shape:

- Make `initStorefront` fetch the catalog slice via `import()` **only when
  `document.getElementById('product-container')` exists** (content pages
  skip it); keep cart/offcanvas/order controllers eager (Navbar contract).
- Keep the `__APP_READY__` flag semantics for every page (e2e depends on
  it — see `deploy-canary.spec.ts:20`).
- Preserve the `astro:after-swap` re-init path (View Transitions) — find its
  listener and route it through the same lazy loader.

### Step 4: Verify (implementation path)

`npm run test:e2e` green (all specs); `npm run lighthouse:audit` — no
regression vs Step 1's baseline; re-measure `/impresiones/` savings ≥ gate.

### Step 5: Close

Update the README row (DONE with measured numbers) or (REJECTED with
numbers). Either is a valid completion — honesty over motion.

## Done criteria

Machine-checkable. EITHER:

- [ ] Completion note contains recorded before/after gzip numbers for
      `/impresiones/` AND a Lighthouse comparison, and the README row is
      DONE/REJECTED accordingly; or
- [ ] (implementation only) `npm run test:e2e` green and the gate shows
      ≥ 10 KB gzip reduction.

- [ ] `plans/README.md` status row updated (DONE with numbers or REJECTED
      with rationale)

## STOP conditions

Stop and report back (do not improvise) if:

- The gate passes but the implementation breaks `check:e2e-selectors`, the
  `__APP_READY__` contract, or the View-Transitions re-init (report; a
  smaller LSP-style split is acceptable only if e2e stays green).
- Coverage tooling cannot be run in this environment after a reasonable
  attempt (fall back to static import-graph analysis, state the limitation,
  keep the gate).

## Maintenance notes

- If REJECTED: this plan's numbers supersede the 187 estimate for future
  re-openings; the deferrals register holds the reopen condition ("revisit
  if /impresiones/ becomes a primary landing or the entry grows > X KB").
- **Deferred:** CSS split (the 214 KB base CSS is shared with every page's
  needed components; splitting it is a separate, harder problem).
