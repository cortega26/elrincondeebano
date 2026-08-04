# Plan 035: Reuse validated build evidence across CI without weakening determinism

> **Executor instructions**: Preserve deploy SHA, CFIMG mode and determinism guarantees. Update `plans/README.md` when complete.
>
> **Drift check (run first)**: `git diff --stat 877f179..HEAD -- .github/workflows/ci.yml .github/workflows/product-data-guard.yml .github/workflows/static.yml .github/actions/setup-node-and-deps/action.yml test/static-deploy-workflow.test.js`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `877f179`, 2026-07-14

## Why this matters

Astro changes trigger two builds for CI determinism plus another product-data build; a main push builds again for deployment. Catalog, image and OG work scales with every copy. The repository can consolidate duplicated validation while retaining one intentional second build for determinism and a deploy artifact tied to the exact SHA/configuration.

## Current state

- `.github/workflows/ci.yml:98-108` builds twice for determinism.
- `.github/workflows/product-data-guard.yml:3-43` overlaps every `astro-poc/**` change and builds again with `PREFLIGHT_SKIP_OG=1`.
- `.github/workflows/static.yml:64-97` independently builds the deployment SHA with `CFIMG_ENABLE=1` and runs a browser canary.
- Existing workflow contract tests include `test/static-deploy-workflow.test.js` and related workflow tests in `test/`.

## Commands you will need

| Purpose           | Command                                                | Expected                   |
| ----------------- | ------------------------------------------------------ | -------------------------- |
| Contracts         | `node test/static-deploy-workflow.test.js && npm test` | pass                       |
| Lint              | `npm run lint`                                         | exit 0                     |
| Local determinism | `npm run certify:migration:prepare && npm run build`   | exit 0; clean tracked tree |

## Scope

**In scope**: drift-check files and focused workflow contract tests.

**Out of scope**: reducing the two builds needed for determinism to one; deploying an artifact built for a different SHA/CFIMG mode; changing production deploy approval or canary.

## Git workflow

- Branch: `advisor/035-consolidate-ci-builds`
- Commit: `ci: consolidate duplicate storefront builds`

## Steps

### Step 1: Write the build-mode matrix before changing workflows

Document inputs/outputs for normal CI, `PREFLIGHT_SKIP_OG=1`, `CFIMG_ENABLE=1`, determinism and deploy. Identify which outputs are byte-identical and which intentionally differ. If deploy output differs from CI output, it must still build separately.

**Verify**: add/extend a contract test that asserts build modes and artifact SHA metadata rather than relying on comments alone.

### Step 2: Merge product-data cleanliness into canonical CI

Move the clean-tree check into the canonical build job or replace product guard's build with the minimum deterministic sync/dry-run commands that prove generated source files are committed. Remove only the redundant overlapping build/job.

**Verify**: workflow tests confirm Astro/data path changes still gate on dirty generated files and Dependabot behavior remains explicit.

### Step 3: Reuse artifacts only when contracts match

Upload the validated artifact with SHA and build-mode metadata. Reuse it downstream only if deploy expects identical `CFIMG`/environment output; otherwise keep deploy build and use the CI artifact solely for tests. Never accept artifacts from an untrusted or different SHA.

**Verify**: workflow test rejects mismatched SHA/mode and retains blocking browser canary on the shipped artifact.

### Step 4: Baseline

**Verify**: lint/tests pass and a representative Astro PR runs one fewer full build without losing determinism/product-data/deploy gates.

## Test plan

Add source-level workflow contract assertions for path triggers, SHA binding, CFIMG mode, dirty-tree check and browser canary ordering.

## Done criteria

- [ ] At least one redundant full build is removed.
- [ ] Determinism still compares two independently generated artifacts.
- [ ] Deploy tests exactly the artifact it ships.
- [ ] Dirty generated catalog/assets still fail CI.

## STOP conditions

- Build modes produce different output but reuse would hide the difference.
- GitHub event security would allow an untrusted artifact into deployment.
- Dependabot auto-sync behavior cannot be preserved safely.

## Maintenance notes

Treat artifact SHA and build mode as part of the deploy contract. Re-evaluate consolidation whenever preflight or Cloudflare image behavior changes.
