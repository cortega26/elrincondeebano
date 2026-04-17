# ELRINCONDEEBANO Astro 6 Compatibility Checklist

Prepared for Phase 4 / `EB-017` of the remediation plan.

## Target

- Active storefront package: `astro-poc/`
- Current stable Astro major confirmed during implementation: `6`
- Selected upgrade target: `astro@6.1.1`
- Temporary supply-chain closure for Phase 4: `astro-poc` carries a vendored `anymatch@3.1.3` tarball at `astro-poc/vendor/anymatch/anymatch-3.1.3.tgz`, plus a root override, so Astro's `unstorage` chain consumes `picomatch@4.0.4` while upstream catches up.

## Scope Guardrails

- Keep the upgrade isolated to the active Astro storefront and only the docs/backlog needed to keep Phase 4 truthful.
- Preserve the Phase 0 bundled storefront boot path.
- Preserve the Phase 1 validation and OG-image correctness fixes.
- Preserve the Phase 2 CI/CD, dependency-visibility, and canary hardening.
- Preserve the Phase 3 canonical runtime/storage contract and category-route parity.

## Compatibility Review

- Node baseline:
  - Astro 6 requires Node `>=22.12.0`.
  - Repo baseline now targets Node 24.x for local and CI reproducibility.
- Astro adapters:
  - No Astro adapter is configured in `astro-poc/astro.config.mjs`.
  - Static output only, so adapter migration work is out of scope.
- Content collections:
  - No `src/content`, `astro:content`, `getCollection()`, or legacy collections flags are present in `astro-poc/`.
  - Astro 6 collection removals should not apply.
- View transitions/router:
  - No legacy `<ViewTransitions />` usage detected.
- Environment flags:
  - No `import.meta.env` usage detected in `astro-poc/`.
- Legacy route surfaces:
  - The storefront intentionally keeps `astro-poc/src/pages/pages/[slug].html.astro`.
  - Phase 4 validation must explicitly confirm `/pages/*.html` parity still works after the upgrade.
- Runtime/storage contract:
  - Canonical runtime remains `astro-poc/src/scripts/storefront.js`.
  - Canonical storage keys remain the Phase 3 `astro-poc-*` keys with legacy cart compatibility.

## Blocking Validation for Phase 4

- `npm ci`
- `(cd astro-poc && npm ci)`
- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm run test:e2e`

## Targeted Browser/Contract Checks

- Built bundle still reaches `window.__APP_READY__ === true`.
- Deployed-bundle canary path still boots without browser console/page errors.
- Category route variants preserve parity:
  - `/<category>/`
  - `/c/<category>/`
  - `/pages/<slug>.html`
- Persisted cart survives refresh/reload.
- Repeat-order flow preserves the canonical Phase 3 storage contract across reloads.

## Closure Notes

- Validation matrix should remain green on the Node 24.x repo baseline.
- `npm audit --omit=dev --prefix astro-poc` is green after the temporary `anymatch` remediation.
- Built parity still includes:
  - `astro-poc/dist/bebidas/index.html`
  - `astro-poc/dist/c/bebidas/index.html`
  - `astro-poc/dist/pages/bebidas.html`
- Built runtime still exposes the canonical Phase 3 storage/runtime markers (`astro-poc-storefront`, `astro-poc-cart`, `astro-poc-storefront-state`, `astro-poc-order-draft`, `astro-poc-products-version`).
