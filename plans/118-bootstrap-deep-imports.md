# 118 — Replace the full Bootstrap import with deep module imports

- **Source**: Auditoría 9, PERF-01
- **Status**: TODO · **Priority**: P2 · **Effort**: M
- **Stamped against**: `b3805e1`

## Problem

`astro-poc/src/scripts/storefront.js:5-6` imports the full Bootstrap barrel:

```js
import 'bootstrap';
import { Offcanvas } from 'bootstrap';
```

The shipped bundle (`dist/_astro/BaseLayout...js`, ~126 KB raw / ~37.5 KB
gzip) contains component-only strings for components the site never uses:
`data-bs-slide-to`/`data-bs-ride` (Carousel), `data-bs-spy` (ScrollSpy),
`data-bs-original-title` (Tooltip), `modal-backdrop` (Modal), plus Popper.
The markup actually uses only collapse/dropdown/offcanvas/alert data APIs
(`Navbar.astro:41,71,98,196`; no carousel/spy anywhere in `src`).

Plan 031 removed the `globalThis.bootstrap` exposure and the barrel
namespace, but kept the monolith import — the unused components cannot be
tree-shaken because a bare `import 'bootstrap'` is a side-effect import.
This bundle is on **every page** of the static site.

## Scope

**In**: `astro-poc/src/scripts/storefront.js` (imports),
`astro-poc/src/scripts/storefront/*.js` if any import bootstrap directly
(grep first), and the bundle-size evidence in the PR.

**Out**: markup (data-API attributes stay), other bootstrap consumers.

## Steps

1. Grep all bootstrap imports: `grep -rn "from 'bootstrap'\|import 'bootstrap'" astro-poc/src/`.
2. Replace with deep imports that register only the used data APIs:
   ```js
   import 'bootstrap/js/dist/collapse.js';
   import 'bootstrap/js/dist/dropdown.js';
   import 'bootstrap/js/dist/alert.js';
   import { Offcanvas } from 'bootstrap/js/dist/offcanvas.js';
   ```
   (Bootstrap's dist modules auto-register their data API on import, and
   `offcanvas.js` pulls its own deps — verify `offcanvas.js` imports
   `util/scrollbar` etc. as relative imports; they must resolve in the Vite
   build.)
3. Confirm Popper is still included (dropdown/offcanvas depend on it —
   deep imports keep the dependency chain; only the unused components
   disappear).
4. Build and measure: record `dist/_astro/BaseLayout*.js` raw/gzip before
   and after (expect ~8-12 KB gzip saved). Do not touch `astro.config.mjs`
   inlining rules (inlineStylesheets: 'never' is unrelated).

## Tests

- Full storefront e2e suite (44 tests) — collapse (navbar toggle),
  dropdown (nav groups), offcanvas (cart), alert (dismissible banner) are
  all covered by existing tests (`ver-combos-nav`, `cart-ux`, navbar
  specs).
- `npm run build` + artifact contract green; `npm run lint` green.
- Bundle evidence: gzip size delta in the commit message.

## Done criteria

- [ ] No bare `import 'bootstrap'` remains.
- [ ] Bundle contains no carousel/scrollspy/tooltip/modal markers
      (`grep -c "data-bs-spy\|data-bs-slide\|data-bs-original-title\|modal-backdrop" dist/_astro/*.js` → 0).
- [ ] 44/44 storefront e2e green.
- [ ] Gzip delta documented (≥ 8 KB expected).

## Maintenance

When adding a new Bootstrap component, add its deep import deliberately —
this plan's grep gate (`data-bs-*` markers not in bundle) catches accidental
monolith imports. The plan-031 comment block at storefront.js:1-4 must be
updated to describe the deep-import state.

## Rollback

`git revert <sha>` — import-only change; revert restores the monolith bundle.
