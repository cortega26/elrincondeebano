# El Rincón de Ébano

Static storefront for `https://www.elrincondeebano.com/`, built from the active Astro app in [`astro-poc/`](./astro-poc/) and shared root-level data/assets.

## Current Runtime Truth

- Production storefront: [`astro-poc/`](./astro-poc/)
- Canonical browser runtime entry: [`astro-poc/src/scripts/storefront.js`](./astro-poc/src/scripts/storefront.js)
- Phase 3 runtime modules: [`astro-poc/src/scripts/storefront/`](./astro-poc/src/scripts/storefront/)
- Canonical production build: `npm run build`
- Canonical browser suite: `npm run test:e2e`
- Canonical type validation: `npm run typecheck`
- Legacy Node + EJS storefront: archived reference only in [`docs/archive/LEGACY_STOREFRONT.md`](./docs/archive/LEGACY_STOREFRONT.md)

`preview.html` remains a local/demo artifact and is not part of the deploy contract.

## Setup

```bash
npm ci
npm ci --prefix astro-poc
```

Node `22.x` is the supported local and CI baseline.

## Canonical Validation

Run these commands for storefront work:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Validation details:

- `npm run typecheck` runs the legacy root JS contract check plus Astro-native `astro check` for the active app.
- `npm run test:e2e` runs `playwright.astro.config.ts` against the canonical Astro suite in [`test/e2e-astro/`](./test/e2e-astro/).
- Shopper-state persistence for the shipped storefront is canonical under the `astro-poc-*` localStorage keys; the legacy `cart` key is read only as a compatibility alias during upgrade.
- Specs under [`test/e2e/`](./test/e2e/) plus the targeted Cypress runner are supplemental/manual coverage and are not the default release gate.
- Product-detail pages now fall back to compatible category JPG OG assets when catalog media is WebP-only, preserving the WhatsApp/social preview contract.

## Build Notes

- Root `data/` and `assets/` remain shared inputs to the Astro storefront.
- `npm run build` runs the shared preflight pipeline and then builds `astro-poc/dist/`.
- `npm run build` and `npm run test:e2e` should be executed sequentially on Windows because they touch the same generated output.

## Key Docs

- [`docs/operations/QUALITY_GUARDRAILS.md`](./docs/operations/QUALITY_GUARDRAILS.md)
- [`docs/operations/DEBUGGING.md`](./docs/operations/DEBUGGING.md)
- [`docs/operations/RUNBOOK.md`](./docs/operations/RUNBOOK.md)
- [`docs/implementation/ELRINCONDEEBANO_REMEDIATION_PLAN.md`](./docs/implementation/ELRINCONDEEBANO_REMEDIATION_PLAN.md)
- [`docs/implementation/ELRINCONDEEBANO_REMEDIATION_BACKLOG.md`](./docs/implementation/ELRINCONDEEBANO_REMEDIATION_BACKLOG.md)
