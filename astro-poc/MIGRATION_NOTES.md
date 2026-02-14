# Astro Migration Notes (POC -> Production)

## Objective

Migrate from the current EJS/HTML/Vanilla stack to Astro incrementally, with no production regressions and no impact on the Python Content Manager.

## Current POC Baseline

- Isolated app: `astro-poc/`
- Static routes implemented:
  - `/`
  - `/c/[category]/`
  - `/p/[sku]/`
- Data source: full catalog copied read-only from `data/product_data.json` to `astro-poc/src/data/products.json`
- Category filtering uses identity key (`category`)
- Product detail uses stable identity route param (`sku` derived deterministically when missing in source)
- Deploy pipeline prepared:
  - CI: `.github/workflows/astro-poc.yml`
  - Manual deploy: `.github/workflows/astro-poc-deploy.yml`

## Migration Strategy (Recommended: Incremental Side-by-Side)

### Phase 0 - Stabilize POC

- Keep POC isolated under `astro-poc/`
- Add independent CI for Astro POC only
- Lock Node and dependencies for deterministic builds
- Define acceptance gates:
  - `npm run build` green
  - Required static outputs exist
  - No changes in root build/deploy behavior

### Phase 1 - Data Contract Hardening

- Formalize product contract between legacy site and Astro:
  - Required keys
  - Optional keys
  - Identity precedence (`sku` -> `id` -> deterministic hash)
- Add tests for category key integrity and route generation consistency
- Keep Content Manager schema unchanged; transformations happen only in Astro read layer

### Phase 2 - UX Parity Expansion

- Expand Astro page coverage category by category
- Reuse existing visual language and semantics
- Compare key UX flows against production:
  - Home browse
  - Category drill-down
  - Product detail discovery
- Validate parity with visual snapshots (POC scope first, then broader)

### Phase 3 - Controlled Exposure

- Deploy Astro under non-production surface:
  - `poc.elrincondeebano.com` or `/elrincondeebano-astro/`
- Keep production routes untouched
- Collect metrics:
  - Build time
  - Transfer size
  - JS payload
  - Core UX flow success

### Phase 4 - Progressive Cutover

- Route-by-route migration behind explicit toggles
- Keep rollback path simple:
  - Revert route mapping/cutover commit
  - Fall back to existing EJS-generated pages
- Maintain dual-run monitoring until stability is proven

## Risk Register

- Identity drift risk:
  - If `sku` is absent and derivation logic changes, product URL stability breaks.
  - Mitigation: freeze deterministic derivation and test it.
- Data drift risk:
  - Legacy JSON shape changes may break Astro pages.
  - Mitigation: contract tests in CI, fail fast on required key changes.
- Style parity risk:
  - Visual mismatch while CSS remains shared but markup evolves.
  - Mitigation: visual regression checks and semantic audits.
- Operational split risk:
  - Two stacks in parallel can diverge in behavior.
  - Mitigation: documented ownership and release checklist per stack.

## Rollback Plan

- Keep legacy production build as source of truth until final cutover.
- For any Astro rollout issue:
  1. Revert route exposure commit.
  2. Verify legacy `npm run build` and smoke checks.
  3. Redeploy stable legacy artifact.

## Definition of Ready for Production Migration

- Astro routes cover required business journeys with parity
- No dependency on runtime SSR for current catalog flows
- Static generation deterministic in CI
- Data contract tests are stable
- Rollback verified in at least one dry run

## Suggested Next Iteration

1. Add contract tests in `astro-poc` for identity and required keys.
2. Add visual parity snapshots between legacy shell and Astro shell for home/category/product.
3. Prepare deployment workflow targeting preview host only.
