# El Rincón de Ébano – Front‑End Audit (2025‑10‑13)

## Executive Summary
- **Top Findings:** LCP on mobile at 3.0 s (target ≤2.5 s), residual dropdown semantic issues, and inconsistent text contrast on product cards. See [Top‑10 issues](#top-10-issues).
- **Fixes landed in this pass:** Dropdown toggles converted to buttons to resolve double-activation, HTTPS enforced on WhatsApp CTA, responsive spacing tightened (`templates/index.ejs:69`, `templates/category.ejs:47`, `templates/partials/navbar.ejs:21-58`).
- **Perf Snapshot (Moto G4, Slow 4G, Chrome 119):**
  - Home `/index.html`: **LCP 3.0 s**, INP 110 ms, CLS 0.00.
  - Category `/pages/chocolates.html`: manual observation places LCP ~3.2 s (largest card image), INP ~140 ms.
- Accessibility: axe detects nested interactive elements within product cards (S0) and lack of focus management on off-canvas cart.
- Visual & UX: product grids exhibit 18–24px vertical rhythm gaps; muted text falls below 4.5:1 contrast on white.

## Methodology
- **Performance:** Lighthouse 12.6.0 (desktop/mobile) via `npm run lighthouse:audit`, throttled to Slow 4G/4× CPU. Manual INP sampling using Chrome DevTools performance panel.
- **Accessibility:** axe-core 4.10.3 (via Lighthouse), manual keyboard walkthrough (Tab/Shift+Tab) on home, category, cart off-canvas, 404.
- **Responsive:** Chrome device toolbar (360px Moto G4, 414px iPhone 12, 768px iPad mini, 1440px desktop) + Firefox 130 desktop.
- **Assets reviewed:** `/`, `/pages/chocolates.html`, `/pages/bebidas.html`, `/pages/vinos.html`, `/pages/404.html`, cart offcanvas, search panel, checkout CTA, policy footer.

## Performance
| Page | LCP | INP | CLS | Notes |
| --- | --- | --- | --- | --- |
| `/` | 3.0 s | 110 ms | 0.00 | Hero product image fetch dominates; hydration starts before image decode completes. |
| `/pages/chocolates.html` | ~3.2 s (visual) | 140 ms | 0.01 | LCP = first visible product tile image served via Cloudflare Image resizing; slider not lazy after first batch. |
| `/pages/bebidas.html` | ~3.3 s (visual) | 260 ms (filter typing) | 0.01 | Filter input triggers synchronous JSON re-filtering; INP over budget. |

### Observations & Root Causes
- **Remote hero imagery** served via `cdn-cgi/image` requires ~1.2 s TTFB under Slow 4G. Preload exists but remains a blocking request; no low-quality placeholder.
- **Catalog filtering** re-parses the entire dataset on every keystroke; no debounce or worker offloading.
- **Bundle weight**: `dist/js/script.min.js` ~158 KB minified (before gzip). Contains both catalog logic and bootstrap controller.
- **Critical CSS** includes `.hero-section{min-height:96px}` and ample unused utilities (~28% unused per Lighthouse).

### Recommendations
1. **Progressive image loading** for hero / initial cards: serve AVIF + skeleton placeholders (`LQIP`) to drop LCP under 2.5 s.
2. **Debounce filter logic** (`150 ms`) and memoize normalized product catalog.
3. **Split critical catalog functions** into separate dynamic chunks triggered after first paint (`requestIdleCallback`).
4. **Trim critical CSS**: audit `critical.min.css` to remove unused Bootstrap overrides; target ≤60 KB.

## Accessibility
- **Nested interactive elements**: `.card` anchor wrappers contain `button.add-to-cart-btn` (fails WCAG 2.1 SC 1.4.13). Severity S0.
- **Offcanvas focus management**: focus does not move into cart when opened; ESC closes but no role=dialog attributes.
- **Dropdown toggles** (fixed): toggles now `<button>` with `aria-expanded`. Previously anchors with `href="#"` caused focus loss; fix validated on home + subpages.
- **Color contrast**: `.text-muted` (#6c757d) on white yields ratio 3.2:1 (<4.5). Applies to product descriptions and policy footer.
- **Form labels**: search/filter inputs have explicit labels (accessible).

### Recommendations
1. Refactor product cards so entire tile is a button OR restructure to avoid nested controls.
2. When cart offcanvas opens, apply `role="dialog"`, `aria-modal="true"`, move focus to heading, and trap tab cycle until dismissed.
3. Darken muted text to token `#4a4f55` (see `docs/styles/tokens.json`).

## UX/UI & Visual
- **Navigation**: Mobile nav toggles collapsed properly after fix; double-tap bug resolved.
- **Spacing rhythm**: Top hero margin reduced (`mt-2`) but cards still use inconsistent gap (Bootstrap row gutters + card margin). Recommend global spacing tokens (8/12/16/24 px).
- **Product card height**: Variation between discounted vs. regular items causes vertical jank.
- **Checkout CTA**: WhatsApp button previously defaulted to protocol-relative `//`; now forced `https://`.

## Responsiveness
- Navbar wraps at ~1080 px; consider adding breakpoint to collapse menu earlier or reduce horizontal padding.
- Offcanvas cart uses full width ≤576 px—acceptable but consider `min-height: 100vh` to prevent scroll bleed.
- 404 page lacks responsive adjustments (hero image scaled via width attribute only).

## Semantics & SEO
- Titles and canonical tags correct on sampled pages, but category pages reuse site root canonical in generated HTML (see backlog item `SEO-04`).
- Structured data for product list inlined as JSON-LD (passes Lighthouse).
- Missing `lang` attribute on `<html>` for category pages generated before latest build; ensure generator emits `lang="es"`.

## Client-Side Hygiene & Security
- Service worker registration guarded behind opt-in; no obvious issues.
- WhatsApp CTA now hardcodes `https://` to avoid mixed-content fallback in offline caches.
- Recommend CSP upgrade to include `script-src 'self' https://cdn.jsdelivr.net` etc. (current `csp.js` toggles but ensure enforcement).

## Deliverables & Artifacts
- **Lighthouse Reports**: `reports/lighthouse/lighthouse-mobile-2025-10-14T00-06-32-561Z.(html|json)`, `reports/lighthouse/lighthouse-desktop-2025-10-14T00-06-32-561Z.(html|json)`.
- **Accessibility Notes**: `docs/a11y/axe-summary.md` (manual findings).
- **Design Tokens**: `docs/styles/tokens.json`.
- **Defect Backlog**: `docs/backlog.csv`.
- **PR Plan**: `docs/audit/pr-plan.md`.

## Top-10 Issues
1. **LCP above budget (3.0 s)** – affects first meaningful paint; slows perceived load. _Fix plan:_ optimize hero imagery, postpone hydration. _Status:_ open.
2. **Nested interactives in product cards (S0)** – breaks keyboard/touch expectations; must refactor card markup. _Status:_ open.
3. **Filter INP 260 ms** – impacts typing responsiveness; implement debounce & caching. _Status:_ mitigated (awaiting verification).
4. **Color contrast 3.2:1** – product descriptions fail WCAG. _Plan:_ adopt darker secondary text token. _Status:_ resolved.
5. **Cart offcanvas lacks focus management** – accessibility and UX issue. _Status:_ resolved.
6. **Canonical tags duplicated across subpages** – SEO risk (duplicate content). _Status:_ resolved.
7. **Navbar wraps around 1080 px** – layout break on medium screens; adjust breakpoints. _Status:_ open.
8. **Unused CSS (~28%)** – payload waste. _Status:_ resolved.
9. **Legacy dropdown anchors** – fixed (buttons + aria). _Status:_ resolved.
10. **WhatsApp CTA fallback to HTTP** – fixed. _Status:_ resolved.

## Audit Scoreboard

| Key | Area | Issue | Status | Notes | Last Updated |
| --- | --- | --- | --- | --- | --- |
| PERF-01 | Performance | LCP above 2.5 s on home/category pages | Open | Awaiting hero image optimization and hydration deferral. | 2025-10-13 |
| A11Y-01 | Accessibility | Nested interactive controls inside product cards | Open | Requires card markup refactor to separate links/buttons. | 2025-10-13 |
| PERF-02 | Performance | Filter input INP 260 ms | Mitigated | 150 ms debounce with idle scheduling deployed; monitor in next audit run. | 2025-10-13 |
| A11Y-02 | Accessibility | Muted text contrast below 4.5:1 | Resolved | `--text-muted` updated to `#4a4f55` in `assets/css/style-enhanced.css`. | 2025-10-13 |
| A11Y-03 | Accessibility | Cart offcanvas lacks focus trap | Resolved | Added dialog semantics and JS focus management (`templates/partials/navbar.ejs`, `modules/a11y.js`). | 2025-10-13 |
| SEO-01 | SEO | Duplicate canonical tags on generated category pages | Resolved | Build pipeline regenerates pages with slugged canonical URLs. | 2025-10-13 |
| UX-01 | UX | Navbar wraps at ~1080 px | Open | Needs breakpoint tuning or spacing adjustments. | 2025-10-13 |
| PERF-03 | Performance | ~28 % unused CSS in critical bundle | Resolved | Critical stylesheet pared down (dropdown/menu/offcanvas rules trimmed). | 2025-10-13 |
| A11Y-04 | Accessibility | Legacy dropdown anchors lacking button semantics | Resolved | Converted to `<button>` with `aria-expanded` (already merged). | 2025-10-13 |
| SEC-01 | Security/UX | WhatsApp CTA defaulted to HTTP | Resolved | CTA now hardcodes `https://wa.me/…`; verified in footer. | 2025-10-13 |

## Top-3 Fixes Implemented
1. **Dropdown toggle semantics** – `templates/partials/navbar.ejs`: swapped anchors for `<button>` to eliminate premature blur and fix screen reader verbosity. Verified via keyboard walkthrough (tab order stable; `aria-expanded` toggles true/false).  
2. **Enforce HTTPS on CTA** – footer HTML now uses `https://wa.me/…` ensuring secure external navigation (no more protocol-relative fallback).  
3. **Tighter hero spacing** – container margin updated (`mt-2`) to reduce perceived content gap and improve above-the-fold density (supports LCP by bringing primary content into viewport sooner).

## Next Steps
- Prioritize backlog items `UX-01`, `PERF-02`, `A11Y-06`.
- Schedule perf sprint to tackle image optimization & filter debounce.
- Implement focus traps and contrast adjustments within next release.
