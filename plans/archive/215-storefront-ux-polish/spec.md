# Plan 215 — Storefront looks, usability & intuitiveness (PC + mobile)

**Status:** IN PROGRESS · **Priority:** P2 · **Effort:** M · **Depends on:** — (UI-only, no catalog/contract changes)
**Direction (operator-locked):** balanced pass · warm neighborhood store (keep teal + cream) ·
keep top navbar + add sticky category chip bar · shoppable product detail.

## 1. Problem

The Astro storefront (`astro-poc/`: Astro 7 static, vanilla JS, Bootstrap partials +
`src/styles/global.css` ~3.4k lines) works but has load-bearing UX gaps:

1. `ProductDetail.astro` is **not shoppable** — only "Volver / Inicio" links, no
   add-to-cart, no breadcrumbs, no related items.
2. **Touch targets below 44px** (skill + Apple HIG bar): strip qty 38px, compact
   add-to-cart 42px, toast/recovery dismiss 32px, strip arrows 40px.
3. Mobile hero **hides all trust context** (`display:none` on eyebrow/meta/service-list
   <767px) exactly where new neighbors need it.
4. Home is one long stack with **no anchor wayfinding**; desktop ≥1024px gets no benefit.
5. Cards look generic-Bootstrap (flat `#fafaf8` media, thin elevation, no pairing scale).
6. Cart drawer: payment-gate hint subtle, note/substitution behind a vague trigger,
   `mobile-cart-shortcut` + `back-to-top` share the thumb zone.
7. Navbar: hamburger + cart + truncating brand crowd ≤360px; dropdowns are click-only,
   no global search reach.

## 2. Non-negotiables

- Bootstrap/`@popperjs` frozen (audits 10/11): override via CSS vars + `global.css` only.
- Static output, vanilla JS, no UI framework. Reuse `storefront.js` delegation
  (`.action-area[data-pid]` auto-syncs — detail page needs markup only).
- **E2E selector contract** (`npm run check:e2e-selectors`): never rename
  `id`/`data-*` hooks (`#product-container`, `#filter-keyword`, `#sort-options`,
  `#filter-discount`, `#catalog-load-more`, `#cart-*`, `[data-strip-scroll]`,
  `#mobile-cart-shortcut`, `.action-area[data-pid]`).
- Existing e2e geometry asserts must stay green (`mobile-home-ux.spec.ts`: footer share
  <0.58, single-column payment at 390px, sticky catalog controls, compact cards,
  shortcut text `Ver pedido · N · $`).
- No catalog/taxonomy/asset changes → `guardrails:assets` not triggered.
- Iterate with `build:fast`; full `build` (preflight) only at gates.

## 3. Work slices

### P0 — Baseline & evidence

Snapshot `dist` + Lighthouse (mobile + desktop, perf/a11y/BP/SEO) before touching UI.
`build:fast` green first.

### P1 — Tokens + touch + contrast

- Centralize warm-store tokens at `global.css:1-26` (surface/ink/muted/line,
  elevation scale, radius scale, focus ring). No new raw hex in components.
- All interactive targets ≥44px: strip qty 38→44, compact add-to-cart 42→44,
  toast/recovery dismiss 32→44, strip arrows 40→44. Keep `touch-action: manipulation`,
  8px+ gaps.
- Contrast sweep to AA: `--text-muted`, `--accent-color`, discount badge,
  `footer-credit`, `cart-payment-hint`.
- Extend `prefers-reduced-motion` to toast/recovery/strip smooth scroll.

### P2 — Home: compressed trust hero + sticky category chip bar

- Mobile hero: replace `display:none` with 2-line meta + 3 compact chips.
- New `CategoryAnchorBar.astro` under hero: scroll-snap chips (Ofertas + primary
  categories + Combos), sticky below fixed header, `aria-current` via
  IntersectionObserver (debounced), `scroll-margin-top` correct under header +
  sticky catalog controls.
- Desktop: same bar as centered row. Tighten section rhythm to 16/24/32 scale.

### P3 — Unified warm-store cards

One card language (12–14px radius, 1px line + soft shadow, hover lift desktop-only),
keep 2-col mobile grid + `producto--compact-mobile` density with aligned row heights.
Strip cards share tokens; keep `min(160px,44vw)` / `min(180px,22vw)` widths and
hover-reveal arrows on desktop / hidden on coarse pointers. `data-product-*` untouched.

### P4 — Catalog controls

≤576px grid: search full-width row 1, sort + ofertas row 2. Surface "Limpiar"
disabled state visually. Empty state gains "Limpiar filtros" action, focused on
zero results.

### P5 — Shoppable product detail

- `ProductDetail.astro`: price/discount block (card pricing classes), quantity
  stepper + Agregar via the **existing** `.action-area[data-pid]` contract (zero new
  cart logic), visible breadcrumbs (`Inicio / Categoría / Producto`), keep
  stock pill + secondary back link.
- `p/[sku].astro`: pass same-category related items (≤12) rendered via `CategoryStrip`.
- Sticky mobile buy bar on detail only (price + Agregar, safe-area padded); never
  co-visible with `mobile-cart-shortcut` (reuse `cart-offcanvas-open` guard pattern).

### P6 — Navbar polish (no restructure)

Bigger group-toggle hit areas, logo 40→32px before brand-text hiding at ≤350px,
cart button keeps count announcement path. Chip bar (P2) is the wayfinding upgrade.

### P7 — Cart drawer clarity + thumb zone

Info order: Resumen → Pago (required, inline `role=alert`) → sticky actions always
visible. Clearer collapsed trigger ("Opciones del pedido · nota, sustitución").
Submit `disabled` reason exposed via `aria-describedby` → payment hint. Shortcut only
when items > 0 and cart closed; safe-area inset; deconflict `back-to-top` stacking
on ≤600px.

### P8 — Footer / trust / microcopy

Footer: hours/response + "Solo residentes de Ébano" + Cómo pedir link; keep
Tooltician credit. Unify verbs: "Agregar" + `aria-label="Agregar {name} al pedido"`,
"Ver pedido", "Enviar pedido por WhatsApp". Service-guide trigger keeps link look
with 44px hit area.

### P9 — Motion + perceived perf

Micro-interactions 150–300ms, transform/opacity only. Skeleton shimmer for
`#product-container` first paint. No new webfonts; verify `font-display: swap`.

## 4. STOP conditions

- Any e2e-selector rename → stop, revert, re-plan.
- Lighthouse a11y regression or CLS ≥ 0.1 attributable to this plan → stop, fix first.
- Catalog/data file touched → stop, run `guardrails:assets`, disclose in plan log.

## 5. Verification

`lint` → `typecheck` → `check:e2e-selectors` → `build:fast` (iterate) → full `build`
(gate) → `npm test` → `PLAYWRIGHT_SKIP_BUILD=1 test:e2e` (close) → `lighthouse:audit`
before/after. Close: README row + `git mv` to `plans/archive/` in the same commit.
Rollback: `git revert <sha>`.
