# MIGRATION_DONE

Date: 2026-02-19  
Scope: Astro migration closeout after legacy root-route regression recovery and rollback hardening.

## Final Recovery Snapshot (2026-02-19)

- Incident: production HTTP contract regression on legacy root routes (`/bebidas.html`, `/vinos.html`, `/e.html`, `/offline.html`) after Astro cutover.
- Root cause: Astro postbuild flattened `/pages/*.html` but did not generate required legacy root compatibility pages in `astro-poc/dist/`.
- Fix PR: https://github.com/cortega26/elrincondeebano/pull/224
  - Fix commit: `e60f494c338677ba18ddd4e8802483487f53a073`
  - Main merge SHA: `90ccf2aa65f14ce8c768f6fdced4085350340451`
- Recovery deploy (aligned to merge SHA): https://github.com/cortega26/elrincondeebano/actions/runs/22196521633
- Post-deploy canary evidence: https://github.com/cortega26/elrincondeebano/actions/runs/22196555559

## Prevention Measures Added (Permanent)

1. Legacy root compatibility pages generated explicitly during Astro postbuild.
2. Dedicated HTTP contract validation added (`astro-poc/scripts/validate-http-contract.mjs`).
3. Astro build chain now enforces HTTP contract:
   - `npm --prefix astro-poc run contract:http`
4. CI now includes an explicit Astro HTTP contract validation step.
5. Rollback hardening:
   - `static.yml` now accepts `workflow_dispatch` input `deploy_ref` (manual SHA deploy support).
   - New workflow `.github/workflows/rollback.yml` deploys arbitrary SHA with deterministic build + explicit confirmation gate.

## Canonical Closeout Record

Full audit-grade closeout report:

`docs/migration/ASTRO_MIGRATION_CLOSEOUT_2026-02-19.md`

## What Changed

1. Added migration operations runbook:
   - `RUNBOOK_MIGRATION_ASTRO.md`
2. Added explicit contract inventory:
   - `CONTRACTS.md`
3. Hardened post-deploy canary workflow to avoid false negatives from GitHub-runner network blocks:
   - `.github/workflows/post-deploy-canary.yml`
   - `tools/post-deploy-canary.mjs`
4. Added artifact contract validator and integrated it into Astro build:
   - `astro-poc/scripts/validate-artifact-contract.mjs`
   - `astro-poc/package.json`
5. Added daily live contract monitor + issue escalation:
   - `.github/workflows/live-contract-monitor.yml`
   - `tools/live-contract-monitor.mjs`
6. Added a single migration certification gate command:
   - `package.json` -> `npm run certify:migration`
   - wired into:
     - `.github/workflows/ci.yml`
     - `.github/workflows/product-data-guard.yml`
7. Clarified generated-asset policy:
   - `astro-poc/README.md` (`astro-poc/public/assets/` is generated-only)
8. Marked authoritative production deploy path:
   - `.github/workflows/static.yml`

## Evidence (Existing Baseline + Cutover)

- PR hotfix that restored `/assets/**` contract:
  - https://github.com/cortega26/elrincondeebano/pull/217
- PR CI on hotfix head (`9a4ac19...`): success
  - https://github.com/cortega26/elrincondeebano/actions/runs/22023191600
- PR product-data-guard on hotfix head (`9a4ac19...`): success
  - https://github.com/cortega26/elrincondeebano/actions/runs/22023191579
- Main CI after merge commit (`c83441c...`): success
  - https://github.com/cortega26/elrincondeebano/actions/runs/22023227863
- Main product-data-guard after merge commit (`c83441c...`): success
  - https://github.com/cortega26/elrincondeebano/actions/runs/22023227852
- Main deploy to GitHub Pages (`c83441c...`): success
  - https://github.com/cortega26/elrincondeebano/actions/runs/22023253597
- Runner-based live canary false-negative (`403`):
  - https://github.com/cortega26/elrincondeebano/actions/runs/22023267213

## Remaining Known Risks

1. Live probes from GitHub-hosted runners can be blocked by edge security (`403`), causing false negatives.
2. Live probe path now requires an allowed self-hosted runner for deterministic signal.
3. Legacy pre-cutover rollback (`20e771a...`) remains disaster-recovery only and is not the fast rollback path.

## Rollback

Primary fast rollback target:

- `c83441cff38fd700157138fac700e4e35c4c8bb2`

Supported rollback paths:

1. `Rollback Pages Deploy` workflow (`rollback.yml`) with:
   - `rollback_ref=<sha_or_ref>`
   - `confirm_rollback=ROLLBACK`
2. `Deploy static content to Pages` (`static.yml`) manual dispatch with:
   - `deploy_ref=<sha_or_ref>`

See full procedure in `RUNBOOK_MIGRATION_ASTRO.md`.
