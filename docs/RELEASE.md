# RELEASE RUNBOOK

## Release Types
- Routine change: content copy, minor layout tweak, non-critical JS, no Service Worker (SW) or checkout path changes.
- Risky change: SW, checkout/WhatsApp flow, product images/sizes, critical CSS, caching, or anything that can alter LCP/CLS.

## Pre-Release Checklist
- Code ready: scope is small, reversible, and matches the PR intent.
- Build artifacts: `npm run build` passes and outputs `dist/`, `pages/`, `sitemap.xml`.
- SW version: cache prefixes updated for SW changes (e.g., `ebano-static-vX`).
- Cache sanity: no unexpected cache names in DevTools on staging.
- Smoke checks (staging/preview):
  - `/index.html` loads, no console errors.
  - One category page (e.g., `/pages/bebidas.html`) loads.
  - Add to cart works, cart opens.
  - Smoke evidence artifact generated (`reports/smoke/*.md`) and attached to release context.
- Stop-the-line criteria:
  - Stale pricing/availability on reload.
  - Checkout blocked with no fallback.
  - Visible layout shift on load.

## Deploy Steps (Provider-Neutral)
1. Ensure main is green (tests/build).
2. Merge PR and trigger deploy.
3. Confirm deploy completed successfully.
4. Complete smoke evidence checklist file (from artifact/template) and record sign-off.

## Immediate Post-Deploy Validation (30-60 min)
Pages to test: `/index.html`, `/pages/bebidas.html`
- Hard reload with SW enabled:
  - Pass: no visible layout jump, content loads, no SW errors.
- Hard reload with SW disabled:
  - Pass: site still loads, same content, no missing assets.
- Product data freshness:
  - Update one product price in source, redeploy, reload within 1-2 minutes.
  - Pass: new price appears; no stale price after hard reload.
- Cart persistence:
  - Add 2 items, reload, open cart.
  - Pass: items persist, totals correct.
- Checkout happy path:
  - Select payment, click "Realizar Pedido".
  - Pass: WhatsApp opens with correct summary.
- Checkout fallback path:
  - Block popups, click checkout.
  - Pass: fallback UI shown; copy/share works.
- Images above the fold:
  - Pass: consistent framing, no crop jumps.

## 72h Monitoring (Lightweight)
- Daily manual check: PLP + category + cart + checkout flow.
- Lighthouse spot-check on 2 pages; compare CLS/LCP trends vs previous report.
- Watch for user reports: "price wrong", "checkout fails", "images broken".
- Track WhatsApp clicks or order confirmations (manual log if no tooling).

## Release Log Template
- Date/time:
- PRs included:
- Risk level: Routine / Risky
- Validation results:
- Rollback plan:
- Notes:

## Definition of Done
- All pre-release checks passed.
- Post-deploy validation completed with pass/fail recorded.
- Monitoring plan started.
- Rollback plan recorded.
