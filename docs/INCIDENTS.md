# INCIDENT RESPONSE PLAYBOOK

## Panic Checklist (1 screen)
- Check first: Is the issue reproducible on `/index.html` and one category page?
- Do NOT touch: product data source unless confirmed stale; avoid large refactors.
- Rollback immediately if: stale prices, checkout dead-end, or visible CLS regression.
- SW incidents: bump cache prefixes and/or disable SW registration.

## Decision Tree
1) Stale prices/inventory
- Symptoms: prices revert after reload; availability mismatches.
- Verify (2-5 min): hard reload; compare product data source vs UI.
- Suspected areas/files: `service-worker.js`, product data JSON.
- Immediate mitigation:
  - Bump SW cache prefixes.
  - Force network-first for product data.
- Rollback:
  - Revert SW PR and redeploy.
  - Clear caches in DevTools for confirmation.
- Log: time, affected products, cache prefix version.

2) Checkout / WhatsApp failures
- Symptoms: button does nothing, popup blocked with no fallback, orders not sent.
- Verify (2-5 min): try checkout with popups allowed/blocked.
- Suspected areas/files: `src/js/modules/checkout.mjs`, `templates/partials/navbar.ejs`.
- Immediate mitigation:
  - Enable fallback UI if hidden.
  - Add temporary user guidance text.
- Rollback:
  - Revert checkout PR.
- Log: browser, popup behavior, repro steps.

3) Visible layout shift (CLS)
- Symptoms: navbar/hero/images jump on load.
- Verify (2-5 min): hard reload, observe top of page and first product row.
- Suspected areas/files: `assets/css/critical.css`, `assets/css/style.css`.
- Immediate mitigation:
  - Align critical CSS with main CSS for affected selectors.
- Rollback:
  - Revert CSS PR.
- Log: which elements shift, which pages.

4) Broken images / LCP regression
- Symptoms: blank images, blurred, slow first render.
- Verify (2-5 min): check network for 404s, inspect `srcset`/`sizes`.
- Suspected areas/files: `tools/utils/product-mapper.js`, `src/js/modules/ui-components.mjs`, templates.
- Immediate mitigation:
  - Revert image sizing changes or fall back to fixed sizes.
- Rollback:
  - Revert image sizing PR.
- Log: affected pages, image URLs, error codes.

## Mandatory SW Note
- For SW incidents: always bump cache prefixes to invalidate old caches.

## Incident Log

### 2026-02-19 - Legacy Root Route 404 After Astro Cutover
- Impact: production 404s on legacy root routes (`/bebidas.html`, `/vinos.html`, `/e.html`, `/offline.html`).
- Detection: production HTTP contract sweep failed while `/pages/*.html` remained available.
- Root cause: postbuild only flattened `/pages/*.html` and did not copy required legacy pages to `astro-poc/dist/` root.
- Fix: PR #224 (`e60f494c338677ba18ddd4e8802483487f53a073`) generated root compatibility pages and enforced contract validation.
- Recovery SHA: `90ccf2aa65f14ce8c768f6fdced4085350340451` (deployed via `static.yml`).
- Preventive controls:
  - Build-time HTTP contract script (`astro-poc/scripts/validate-http-contract.mjs`).
  - CI step to validate Astro HTTP contract explicitly.
  - Dedicated rollback workflow for arbitrary SHA deploy (`.github/workflows/rollback.yml`).
