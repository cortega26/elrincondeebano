# CI_COMPAT.md

## Phase 4 Scope
Validate that GitHub Actions continuity is preserved for Astro cutover and that required workflows are green on a PR.

## Validation Commands and Hosted Evidence

| Check | Result | Evidence |
|---|---|---|
| `npm test` | ✅ PASS | Phase A fix (`vitest.config.mts`) removed Playwright discovery conflict. |
| `npm run test:e2e:astro` | ✅ PASS | 4/4 Playwright parity checks passed. |
| `npm --prefix astro-poc run build` | ✅ PASS | Build emits legacy-compatible routes/artifacts and sitemap postbuild steps. |
| `node --test test/post-deploy-canary.test.js` | ✅ PASS | 5/5 canary contract tests passed. |
| Hosted `Continuous Integration` (`ci.yml`) on PR | ✅ PASS | https://github.com/cortega26/elrincondeebano/actions/runs/22019902823 |
| Hosted `Verify catalog build artifacts` (`product-data-guard.yml`) on PR | ✅ PASS | https://github.com/cortega26/elrincondeebano/actions/runs/22019902849 |
| Hosted `Post-Deploy Canary` (`post-deploy-canary.yml`) on PR | ✅ PASS | https://github.com/cortega26/elrincondeebano/actions/runs/22019902830 |
| Hosted `Deploy static content to Pages` (`static.yml`) manual run on PR branch | ✅ PASS | https://github.com/cortega26/elrincondeebano/actions/runs/22019931534 |

## Workflow Continuity Matrix (Current)

| Workflow | Status | What changed | Evidence |
|---|---|---|---|
| `.github/workflows/ci.yml` | ✅ | Astro build + Astro E2E (`test:e2e:astro`) are part of required CI path. | `ci.yml:59`, `ci.yml:112`; run `22019902823`. |
| `.github/workflows/product-data-guard.yml` | ✅ | Guard now rebuilds/inspects `astro-poc/dist` and enforces clean tree. | `product-data-guard.yml`; run `22019902849`. |
| `.github/workflows/static.yml` | ✅ | Added branch-safe `verify-dispatch` for non-main; protected deploy path remains for main only. | `static.yml:27`, `static.yml:62`; run `22019931534` artifact `astro-dist-verification`. |
| `.github/workflows/post-deploy-canary.yml` | ✅ | Added `canary-pr-verify` for PR contract checks; live probe job remains for deploy/manual paths. | `post-deploy-canary.yml:51`, `post-deploy-canary.yml:72`; run `22019902830`. |
| `.github/workflows/images.yml` | ✅ | No Astro-specific migration changes required. | unchanged behavior. |
| `.github/workflows/codacy.yml` | ✅ | No Astro-specific migration changes required. | unchanged behavior. |
| `.github/workflows/secret-scan.yml` | ✅ | No Astro-specific migration changes required. | PR runs green. |
| `.github/workflows/dependency-review.yml` | ✅ | No Astro-specific migration changes required. | PR runs green. |
| `.github/workflows/admin.yml` | ✅ | Admin tooling CI is independent of storefront runtime. | unchanged behavior. |
| `.github/workflows/astro-poc.yml` | ⚠️ | Optional/duplicate pipeline vs main CI; consolidation decision still pending. | file exists; not required for cutover gate. |
| `.github/workflows/astro-poc-deploy.yml` | ⚠️ | Alternative deploy target (Cloudflare). Decide one production deploy path. | file exists; not part of required gate. |

## Fixes Applied During Phase B

1. `static.yml` protection-aware behavior:
- Non-main `workflow_dispatch` now runs build verification and uploads artifact.
- Pages deploy step is gated to main/protected path.

2. `post-deploy-canary.yml` split paths:
- PR: deterministic canary contract tests (`node --test test/post-deploy-canary.test.js`).
- Deploy/manual: live HTTP synthetic probes with optional rollback.

## Remaining CI Risks

| Risk | Status | Notes |
|---|---|---|
| Live production probe can return `403` from GitHub runner network path | ⚠️ | Observed in earlier failed live probe run; PR contract path now isolates this and keeps CI deterministic. |
| Dual deploy workflows (Pages vs Cloudflare) can cause operational ambiguity | ⚠️ | Choose one production path before final cutover freeze. |

## Phase 4 Verdict

**Required workflow continuity for Astro cutover is VERIFIED on hosted PR runs.**

- ✅ `ci.yml` green
- ✅ `product-data-guard.yml` green
- ✅ `post-deploy-canary.yml` green (PR contract path)
- ✅ `static.yml` green (verification path on PR branch)

Production deploy + live canary remain merge/main-stage gates by design.
