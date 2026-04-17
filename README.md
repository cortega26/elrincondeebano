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

Canonical cold-start setup lives in [docs/onboarding/BOOTSTRAP.md](./docs/onboarding/BOOTSTRAP.md).

```bash
npm run bootstrap
```

This installs dependencies for both the root tooling and the Astro storefront (`astro-poc/`). Equivalent to:

```bash
npm ci
(cd astro-poc && npm ci)
```

Node `24.x` is the supported local and CI baseline.

## Canonical Validation

Use the supported validation tiers for storefront work:

```bash
npm run validate
npm run validate:release
```

Validation details:

- `npm run validate` is the fast local baseline: `lint → typecheck → test → build → guardrails:assets`.
- `npm run validate:release` is the canonical ship gate: `validate` plus `test:e2e` and `monitor:share-preview`.
- `npm run typecheck` runs the legacy root JS contract check plus Astro-native `astro check` for the active app.
- `npm run test:e2e` runs `playwright.astro.config.ts` against the canonical Astro suite in [`test/e2e-astro/`](./test/e2e-astro/).
- Shopper-state persistence for the shipped storefront is canonical under the `astro-poc-*` localStorage keys; the legacy `cart` key is read only as a compatibility alias during upgrade.
- Specs under [`test/e2e/`](./test/e2e/) plus the targeted Cypress runner are supplemental/manual coverage and are not the default release gate.
- Supported WhatsApp/social preview routes are `/`, `/<category>/`, and `/p/<sku>/`; legacy `/c/*` and `/pages/*.html` routes stay compatible but are not part of the supported preview contract.
- Social-preview metadata and image versioning are centralized in [`astro-poc/src/lib/seo.ts`](./astro-poc/src/lib/seo.ts), and `npm run monitor:share-preview` is the dedicated live check for public unfurls.

## Build Notes

- Root `data/` and `assets/` remain shared inputs to the Astro storefront.
- `npm run build` runs the shared preflight pipeline and then builds `astro-poc/dist/`.
- `npm run build` and `npm run test:e2e` should be executed sequentially on Windows because they touch the same generated output.

## Engineering Priorities

- Performance, scalability, maintainability, and documentation-quality
  expectations are documented in
  [`docs/architecture/ENGINEERING_PRIORITIES.md`](./docs/architecture/ENGINEERING_PRIORITIES.md).
- For rendering, bundle, navigation, or critical data-fetch changes, attach
  `npm run lighthouse:audit` evidence or equivalent performance notes in the PR.
- For command, topology, or workflow changes, update the relevant docs in the
  same PR so entry-point docs remain trustworthy.

## Key Docs

- [`docs/START_HERE.md`](./docs/START_HERE.md)
- [`docs/architecture/ENGINEERING_PRIORITIES.md`](./docs/architecture/ENGINEERING_PRIORITIES.md)
- [`docs/operations/VALIDATION_MATRIX.md`](./docs/operations/VALIDATION_MATRIX.md)
- [`docs/operations/QUALITY_GUARDRAILS.md`](./docs/operations/QUALITY_GUARDRAILS.md)
- [`docs/operations/DEBUGGING.md`](./docs/operations/DEBUGGING.md)
- [`docs/operations/RUNBOOK.md`](./docs/operations/RUNBOOK.md)
- [`docs/operations/SHARE_PREVIEW.md`](./docs/operations/SHARE_PREVIEW.md)
- [`docs/implementation/ELRINCONDEEBANO_REMEDIATION_PLAN.md`](./docs/implementation/ELRINCONDEEBANO_REMEDIATION_PLAN.md)
- [`docs/implementation/ELRINCONDEEBANO_REMEDIATION_BACKLOG.md`](./docs/implementation/ELRINCONDEEBANO_REMEDIATION_BACKLOG.md)
