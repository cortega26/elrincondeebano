# Phase 0.5C - Runtime Decoupling Audit

Scope: Admin UI fetch logic and browser runtime product data fetch. Goal: eliminate implicit fallback to production URLs and introduce explicit configuration boundaries.

## 1) Findings - Admin UI fetch logic

### F1) Implicit production fallback in admin panel

- Location: `admin-panel/app.js` (function `fetchProductJson`).
- Behavior:
  - Tries same-origin `/data/product_data.json`, then falls back to `https://elrincondeebano.com/data/product_data.json`.
- Risk:
  - Couples local/admin tooling to production infrastructure.
  - In dev or offline scenarios, silently pulls production data, causing accidental edits against a different catalog snapshot.
  - Breaks reproducibility: results depend on production availability and live data.
- Decoupling requirement:
  - Default fetch must be same-origin only.
  - Any non-local endpoint must be explicitly configured and visible to the user.

## 2) Findings - Browser runtime product data fetch logic

### F2) Runtime fetch is same-origin but lacks explicit boundary controls

- Location: `src/js/script.mjs` (`fetchWithRetry`, `fetchProducts`), `src/js/modules/seo.js` (`loadProductData`), `src/js/csp.js` (`loadProductData`).
- Behavior:
  - Fetches `/data/product_data.json` or `/data/product_data.json?v=...` (same-origin).
  - `fetchWithRetry` enforces same-origin HTTPS.
- Risk:
  - The endpoint is implicit and scattered across modules. If a future change adds a production URL fallback in any module, it will be inconsistent and hard to audit.
  - No single configuration boundary to allow controlled overrides for staging environments.
- Decoupling requirement:
  - Centralize data endpoint configuration in one module or a single global config.
  - Enforce same-origin default and explicit opt-in for any cross-origin fetch (with allowlist).

## 3) Explicit configuration boundaries (required design)

### C1) Single source of truth for data endpoint

- Add a `dataEndpoint` resolver with strict validation:
  - Default: same-origin `/data/product_data.json`.
  - Optional override: `window.__DATA_BASE_URL__` or `<meta name="data-base-url" content="...">`.
  - Validation: allow only same-origin unless `window.__ALLOW_CROSS_ORIGIN_DATA__ === true` and host is in allowlist.

### C2) Admin panel must not auto-fallback to production

- Admin panel should read a config value instead of a hard-coded fallback:
  - Default to same-origin only.
  - Provide a UI prompt or a settings field for manual entry (e.g., `localStorage.adminDataBaseUrl`).
  - Surface the active endpoint in the UI so operators know what dataset they are editing.

## 4) Patch plan (concrete changes)

### P1) Admin panel: remove implicit production fallback

Files:
- `admin-panel/app.js`
- `admin-panel/index.html` (optional UI config)

Changes:
- Replace the hard-coded endpoints list with a deterministic resolver:
  - Default endpoint: `${window.location.origin}/data/product_data.json`.
  - Optional override from `localStorage.adminDataBaseUrl` or a `<meta name="data-base-url">`.
- Add guardrails:
  - If override is cross-origin, require explicit user confirmation in the UI.
  - Display the active endpoint in the page header.

Acceptance criteria:
- Admin panel never contacts `https://elrincondeebano.com` unless explicitly configured.
- Operators can see and change the data endpoint intentionally.

Tests/guards:
- Add a small browser unit test (or script-level test) that asserts `fetchProductJson()` only calls same-origin by default.
- Add a CI grep guard that fails if admin-panel scripts contain `https://elrincondeebano.com`.

### P2) Runtime data endpoint centralization

Files:
- `src/js/utils/` (new `data-endpoint.mjs`)
- `src/js/script.mjs`
- `src/js/modules/seo.js`
- `src/js/csp.js`

Changes:
- Introduce `resolveProductDataUrl({ version })` in a shared utility.
- Enforce same-origin by default; allow explicit override only if `window.__ALLOW_CROSS_ORIGIN_DATA__ === true` and host is in allowlist.
- Replace direct `'/data/product_data.json'` strings in all modules with the resolver.

Acceptance criteria:
- All runtime modules use the same resolver for product data URLs.
- No production URL is present in runtime code.
- Cross-origin fetch is impossible without explicit opt-in.

Tests/guards:
- Extend `test/fetchWithRetry.test.js` to verify the resolver rejects cross-origin unless opt-in flag is set.
- Add a unit test for `resolveProductDataUrl` covering default, versioned URL, and override validation.

### P3) Documentation + operational boundary

Files:
- `README.md`
- `docs/operations/RUNBOOK.md`

Changes:
- Document the configuration boundary: how to set data base URL for admin panel and when to use it.
- Explicitly state: production URLs are not used unless operator opts in.

Acceptance criteria:
- Docs show the default behavior and opt-in steps.
- Runbook notes that production fallback is removed.

## 5) CI guard recommendations

- Add `npm run check:runtime-config`:
  - Fails if any runtime or admin-panel JS contains hard-coded production URLs.
  - Allows a short allowlist file for intentional exceptions.
- Add a lint rule or simple grep in CI (`rg -n "elrincondeebano.com" admin-panel src/js`) to block regressions.

