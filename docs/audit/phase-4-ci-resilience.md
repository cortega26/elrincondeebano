# Phase 4 - CI/CD & Automation Resilience Audit

Role: DevOps / CI Reliability Engineer
Scope: CI/CD workflows determinism, resilience, and observability.

## P0 Constraints (from Phase 0/0.5/Phase 2/Phase 3)
- `docs/audit/phase-3-tests.md` not found in repo; test-policy constraints may be incomplete for this audit.
- No unresolved P0 items called out in Phase 0.5 or Phase 2 reports for the current repo state.

## 1. Workflow Inventory
| Workflow | File | Triggers | Concurrency | Permissions | Key steps |
| --- | --- | --- | --- | --- | --- |
| Continuous Integration | `.github/workflows/ci.yml` | push/PR to `main` (ignores `admin/**`) | none | default | checkout, Node 22.x + npm cache, deterministic env, `npm ci`, `check:determinism`, build, deterministic build diff, `npm test`, `check:css-order`, Playwright install + `test:e2e`, Lighthouse audit |
| Deploy static content to Pages | `.github/workflows/static.yml` | push to `main`, manual | `group: pages`, no cancel | `contents: read`, `pages: write`, `id-token: write` | checkout, deterministic env, Node 22.x + npm cache, `npm ci`, build, deploy to Pages |
| Optimize images | `.github/workflows/images.yml` | push `assets/images/originals/**`, manual | none | `contents: write` | checkout, deterministic env, Node 22.x, `npm ci`, images generate/rewrite/lint, commit + push |
| Codacy Security Scan | `.github/workflows/codacy.yml` | push/PR to `main`, cron | none | `contents: read`, `security-events: write`, `actions: read` | Codacy CLI, split SARIF, sanitize via `jq`, upload artifacts, upload SARIF |
| Admin Tools CI | `.github/workflows/admin.yml` | push/PR `admin/**` | none | default | checkout, Python 3.12, pip cache, install deps, pytest |
| Verify catalog build artifacts | `.github/workflows/product-data-guard.yml` | push/PR `data/product_data.json`, `templates/**`, `tools/**` | none | default | checkout, Node 22.x + npm cache, `npm ci`, build, assert clean git status |

## 2. Failure Mode Analysis
P1 - Runner drift undermines determinism
- `ci.yml`, `images.yml`, `codacy.yml`, `admin.yml` use `ubuntu-latest`, which can change Node/Python deps or system libs (notably libvips/Playwright), producing non-reproducible outputs or sudden failures.

P1 - Image workflow push race and silent missed outputs
- `images.yml` commits and pushes directly to `main` without rebasing or PR flow. Concurrent pushes can cause `git push` to fail, leaving optimized assets uncommitted and the workflow red.

P1 - Codacy on forks fails due to missing secret
- `codacy.yml` expects `CODACY_PROJECT_TOKEN`. Fork PRs do not receive secrets, so the job can fail and block PR visibility.

P1 - Flaky UX checks with minimal diagnostics
- `ci.yml` runs Playwright and Lighthouse but does not upload traces, screenshots, or reports. Failures are hard to reproduce and triage.

P1 - Product-data guard lacks deterministic env
- `product-data-guard.yml` does not set `SOURCE_DATE_EPOCH`, `TZ`, or `CFIMG_DISABLE`, so build outputs may drift if defaults change.

P2 - Redundant CI runs and slower feedback
- No concurrency or cancellation for `ci.yml` and other workflows; rapid pushes can create backlogs.

P2 - Missing caching for image pipeline
- `images.yml` omits npm cache, increasing runtime and variability.

P2 - External tool dependencies assumed
- `codacy.yml` assumes `jq` and `python3` are present on runner images; drift could break the workflow.

P2 - No job timeouts
- Long or hung steps can consume CI minutes without bounds.

## 3. Hardening Recommendations
- Pin runner OS to `ubuntu-22.04` (or a chosen LTS) across all workflows for predictable system deps.
- Add `concurrency` to `ci.yml` and `images.yml` (e.g., group by workflow + branch, `cancel-in-progress: true`) to avoid wasted runs.
- Add deterministic env in `product-data-guard.yml` (`TZ`, `LC_ALL`, `LANG`, `CFIMG_DISABLE`, `SOURCE_DATE_EPOCH`).
- Replace direct image pushes with a PR-based automation (e.g., `peter-evans/create-pull-request`) or pull/rebase before push to avoid collisions.
- Add npm cache to `images.yml` and cache Playwright browsers to reduce runtime.
- Guard Codacy job for fork PRs (skip when `CODACY_PROJECT_TOKEN` missing) and keep the scheduled scan on `main`.
- Add job-level `timeout-minutes` for CI stages that can hang (Playwright/Lighthouse).

## 4. Observability & Debuggability
- Upload artifacts on failure:
  - Playwright: `playwright-report/`, `test-results/`, traces.
  - Lighthouse: `reports/lighthouse/*.html` and `*.json`.
  - Determinism checks: `build-a.sha`, `build-b.sha`, and diff output.
- Emit a `GITHUB_STEP_SUMMARY` with key timings and links to artifacts.
- For `images.yml`, upload a diff summary or list of modified assets as an artifact or step summary.
- For `product-data-guard.yml`, log `git status --short` on failure and keep a small build manifest as artifact.

## 5. PR-ready CI Fix Plan
PR 1 - Pin OS + permissions hygiene
- Files: `.github/workflows/ci.yml`, `.github/workflows/images.yml`, `.github/workflows/codacy.yml`, `.github/workflows/admin.yml`.
- Changes: replace `ubuntu-latest` with `ubuntu-22.04`, add explicit minimal `permissions` blocks where missing.
- Acceptance criteria:
  - Workflows run on pinned OS without behavior regressions.
  - Permissions are least-privilege and do not block existing steps.
- Tests:
  - CI run on a sample PR validates unchanged outcomes.

PR 2 - Concurrency and timeouts
- Files: `.github/workflows/ci.yml`, `.github/workflows/images.yml`, `.github/workflows/product-data-guard.yml`.
- Changes: add `concurrency` groups and `timeout-minutes` for long-running jobs.
- Acceptance criteria:
  - New pushes cancel older in-progress runs on the same branch.
  - Jobs terminate within defined bounds on hangs.
- Tests:
  - Two rapid pushes confirm cancellation behavior in Actions UI.

PR 3 - Deterministic env for guard workflow
- Files: `.github/workflows/product-data-guard.yml`.
- Changes: set `TZ`, `LC_ALL`, `LANG`, `CFIMG_DISABLE`, `SOURCE_DATE_EPOCH` (same as CI).
- Acceptance criteria:
  - `npm run build` produces stable outputs across repeated runs on the same commit.
- Tests:
  - Re-run the workflow on a no-op commit and confirm clean tree.

PR 4 - Image workflow robustness + caching
- Files: `.github/workflows/images.yml`.
- Changes: add npm cache; switch to PR-based automation or add a rebase step before push.
- Acceptance criteria:
  - Workflow succeeds under concurrent pushes without leaving the repo in a conflicted state.
  - Runtime decreases with cache hits.
- Tests:
  - Trigger two pushes that touch originals; workflow produces a single clean update.

PR 5 - Observability artifacts for CI diagnostics
- Files: `.github/workflows/ci.yml`, `.github/workflows/codacy.yml`.
- Changes: upload Playwright/Lighthouse outputs on failure; upload determinism hashes on failure; include step summaries.
- Acceptance criteria:
  - Failed runs have artifacts available for triage.
  - Successful runs stay within artifact storage limits.
- Tests:
  - Induce a controlled failure and confirm artifact availability.

PR 6 - Codacy fork-safe gating
- Files: `.github/workflows/codacy.yml`.
- Changes: skip Codacy CLI execution when `CODACY_PROJECT_TOKEN` is not available (fork PRs).
- Acceptance criteria:
  - Fork PRs do not fail due to missing secrets.
  - Scheduled and `main` runs still execute the scan.
- Tests:
  - Simulated fork PR (no secrets) shows job skipped with a clear log message.
