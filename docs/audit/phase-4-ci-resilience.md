# Phase 4 - CI/CD & Automation Resilience Audit

Role: DevOps / CI Reliability Engineer
Scope: CI/CD workflow determinism, resilience, and observability.

## P0 Constraints (from Phase 0/0.5/Phase 2/Phase 3)
- None. Phase 2 and Phase 3 report no unresolved P0 items for the current repo state.

## 1. Workflow Inventory
| Workflow | File | Triggers | Concurrency | Permissions | Key steps |
| --- | --- | --- | --- | --- | --- |
| Continuous Integration | `.github/workflows/ci.yml` | push/PR to `main` (ignores `admin/**`) | none | default | checkout, Node 22.x + npm cache, deterministic env (TZ/LC_ALL/LANG/CFIMG_DISABLE/SOURCE_DATE_EPOCH), `npm ci`, `npm run check:determinism`, build, deterministic build diff, `npm test`, `check:css-order`, Playwright install + `test:e2e`, upload Playwright artifacts on failure, Lighthouse audit (`LH_SKIP_BUILD=1`) + upload reports on failure |
| Deploy static content to Pages | `.github/workflows/static.yml` | push to `main`, manual | `group: pages`, no cancel | `contents: read`, `pages: write`, `id-token: write` | checkout, deterministic env (CFIMG_ENABLE), Node 22.x + npm cache, `npm ci`, build, upload `build/`, deploy Pages |
| Optimize images | `.github/workflows/images.yml` | push `assets/images/originals/**`, manual | none | `contents: write` | checkout, deterministic env, Node 22.x, `npm ci`, `images:generate`, `images:rewrite`, `lint:images`, commit + push |
| Codacy Security Scan | `.github/workflows/codacy.yml` | push/PR to `main`, weekly cron | none | `contents: read` (+ job `security-events: write`) | checkout, Codacy CLI -> `results.sarif`, split per run (jq), sanitize, list via python, upload SARIF artifacts, matrix upload |
| Admin Tools CI | `.github/workflows/admin.yml` | push/PR `admin/**` | none | default | checkout, Python 3.12 + pip cache, install deps, pytest |
| Verify catalog build artifacts | `.github/workflows/product-data-guard.yml` | push/PR `data/product_data.json`, `templates/**`, `tools/**` | none | default | checkout, deterministic env, Node 22.x + npm cache, `npm ci`, build, list build, verify clean git status |

## 2. Failure Mode Analysis
P1 - Codacy fork PRs can fail due to missing `CODACY_PROJECT_TOKEN`; job is not gated for forks, so PRs can be blocked or scans skipped.
P1 - Codacy can report success without SARIF output: the split step exits 0 when no runs exist, so a misconfigured scan can pass silently with no security signal.
P1 - Image optimization can race: direct push to `main` with no concurrency or rebase can fail on non-fast-forward or overwrite concurrent changes, leaving optimized assets out of sync.

P2 - No concurrency cancellation for ci/admin/product-data-guard/codacy; rapid pushes create backlogs and slow feedback loops.
P2 - No job timeouts; Playwright or Lighthouse hangs can consume minutes and delay CI.
P2 - Playwright browsers are re-downloaded each run; variability in downloads and `apt` deps increases runtime and flakiness risk.
P2 - `images.yml` lacks npm cache; longer runtime increases odds of timeouts and queueing.

## 3. Hardening Recommendations
- Add concurrency groups with cancel-in-progress for CI-like workflows (ci, images, admin, product-data-guard, codacy) to prevent backlog and avoid conflicting image pushes.
- Add job-level `timeout-minutes` (e.g., CI 60, images 30, codacy 20, admin 20, product-data-guard 20) to bound hangs.
- Gate Codacy scans on `CODACY_PROJECT_TOKEN` (skip fork PRs) and add a required SARIF presence check when the token is available.
- Make the images workflow push-safe: switch to PR-based automation (create-pull-request) or rebase before push plus concurrency to avoid non-fast-forward failures.
- Add caching: `cache: npm` in `images.yml`; Playwright browser cache in `ci.yml` via actions/cache and `PLAYWRIGHT_BROWSERS_PATH`.
- Capture determinism diff artifacts and add `GITHUB_STEP_SUMMARY` entries for build hashes, scan counts, and artifact links.

## 4. Observability & Debuggability
- Already present: Playwright and Lighthouse artifacts are uploaded on CI failure; Codacy SARIF files are uploaded and then published to Code Scanning.
- Add deterministic build diff artifacts (`build-a.sha`, `build-b.sha`, and diff) on failure to make non-determinism actionable.
- Add step summaries for CI and images workflows: record Node version, SOURCE_DATE_EPOCH, cache hits, and changed assets.
- For `images.yml`, upload a manifest of modified files (e.g., `git diff --name-only`) to support quick review.
- For `product-data-guard.yml`, upload a short build manifest or `build/asset-manifest.json` on failure for triage.

## 5. PR-ready CI Fix Plan
PR 1 - Concurrency and timeouts
- Files: `.github/workflows/ci.yml`, `.github/workflows/images.yml`, `.github/workflows/codacy.yml`, `.github/workflows/admin.yml`, `.github/workflows/product-data-guard.yml`.
- Changes: add concurrency groups (e.g., `${{ github.workflow }}-${{ github.ref }}`) with cancel-in-progress for non-deploy workflows and set job-level `timeout-minutes`.
- Acceptance criteria:
  - A second push to the same branch cancels the in-progress run.
  - Jobs terminate within the configured timeout bounds.
- Tests:
  - Push two commits quickly and confirm cancellation in the Actions UI.
  - Trigger a run with a deliberate long-running step on a temporary branch to confirm timeout behavior.

PR 2 - Codacy fork-safe gating and SARIF assertion
- Files: `.github/workflows/codacy.yml`.
- Changes: skip the scan when `CODACY_PROJECT_TOKEN` is unavailable (fork PRs) and add a step that fails the job if no SARIF files are produced when the token is present.
- Acceptance criteria:
  - Fork PRs show a skipped Codacy job with a clear log message.
  - `main` and scheduled runs upload SARIF artifacts and publish Code Scanning results.
  - Empty SARIF output causes a controlled failure with an explicit error.
- Tests:
  - Open a fork PR and verify the Codacy job is skipped.
  - Run on `main` and verify SARIF artifacts exist and are uploaded.

PR 3 - Images workflow robustness and caching
- Files: `.github/workflows/images.yml`.
- Changes: add npm cache, add concurrency, and replace direct pushes with PR-based automation or a rebase-before-push flow.
- Acceptance criteria:
  - Concurrent image updates produce a single clean update without non-fast-forward failures.
  - Workflow logs show npm cache hits on repeat runs.
- Tests:
  - Push two changes to `assets/images/originals/**` quickly and confirm a single update path.
  - Re-run the workflow and confirm npm cache hits in logs.

PR 4 - CI cache and determinism artifacts
- Files: `.github/workflows/ci.yml`.
- Changes: cache Playwright browsers (`~/.cache/ms-playwright`) and upload determinism hash artifacts on failure; add a short step summary.
- Acceptance criteria:
  - Second CI runs show Playwright cache hits and reduced install time.
  - Determinism failures publish `build-a.sha` and `build-b.sha` artifacts for diffing.
- Tests:
  - Re-run CI twice to confirm cache hits.
  - Force a determinism mismatch on a temporary branch and verify artifacts are uploaded.

PR 5 - Product-data-guard diagnostics
- Files: `.github/workflows/product-data-guard.yml`.
- Changes: upload `build/asset-manifest.json` and a `git status --short` snapshot on failure; add a step summary with the build output root.
- Acceptance criteria:
  - Failures provide artifacts and summaries that identify drift quickly.
- Tests:
  - Introduce a controlled change in templates that alters tracked output and verify artifacts appear on failure.
