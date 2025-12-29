# Phase 7 - Developer Experience & Sustainability Audit

Role: Developer Experience Engineer / Maintainer-in-Chief
Inputs: docs/audit/phase-0-architecture.md, docs/audit/phase-3-tests.md, docs/audit/phase-4-ci-resilience.md, docs/audit/phase-6-security.md
Constraints: None. Prior phases report no unresolved P0 items in the current repo state.

## 1. Onboarding Friction Map

| Stage | Friction | Impact | Evidence/Notes |
| --- | --- | --- | --- |
| Environment setup | Requires Node 22.x and Python 3.12; multiple version managers (.nvmrc, .tool-versions, Volta). | New contributors can drift to mismatched runtimes, causing subtle failures. | README, admin workflow, version files. |
| Install + first build | `npm ci` and full `npm run build` required to get a usable `build/`; build pipeline is long and rebuilds a wiped output dir. | Slow initial feedback and risk of deleting local artifacts in `build/`. | Phase 0 build pipeline details. |
| Local preview vs runtime policy | Default preview is HTTP, but runtime enforces HTTPS and disables SW on localhost unless flags are set. | First local run can look broken or missing offline behavior. | README quick start, RUNBOOK SW notes. |
| Tests | `npm test` runs node:test plus Vitest; E2E is separate (Playwright/Cypress). | No obvious fast path for small changes; time cost is unclear. | package.json scripts, Phase 3. |
| Image pipeline | Multiple scripts (`images:generate`, `images:rewrite`, `images:variants`, `lint:images`) with different entry points. | Contributors are unsure which script is required after asset changes. | tools/ inventory in Phase 0. |
| Admin tooling | Desktop manager and admin panel are optional; admin panel is excluded by default; Python setup is not in quick start. | Unclear path to edit data or run admin tests. | README, admin workflow. |

## 2. Documentation Gaps

- No dedicated onboarding or contributing doc that gives a 30-minute setup path; README is long and mixes product and ops details.
- Local dev flags (SW enable, allow HTTP, include admin panel) live in RUNBOOK but are not linked from the Quick Start.
- `scripts/dev-server.mjs` usage and recommended preview command are not documented.
- Image pipeline usage (when to run `images:*`, canonical paths, expected outputs) is not summarized for contributors.
- Admin tool setup (Python venv, dependencies, pytest) is not described in onboarding docs.
- CI failure reproduction steps and artifact locations are not collected in one place.

## 3. Local Dev Pain Points

- HTTPS-only `fetchWithRetry` blocks `http://localhost` by default; local flags are required for basic data fetches.
- Service worker is disabled on localhost, so offline and cache behavior need manual opt-in.
- Some tests read from `build/`; running `npm test` without a fresh build can mislead results.
- `tools/lighthouse-audit.mjs` depends on a build output and flags like `LH_SKIP_BUILD` or `BUILD_OUTPUT_DIR`, but these are not in contributor docs.
- Playwright and Cypress require heavy downloads; no documented guidance for a unit-only path.
- Image pipeline uses Sharp; install/runtime troubleshooting is not documented for Windows contributors.

## 4. Tooling Ergonomics Review

### What works well

- Deterministic build chain with explicit scripts and SW asset verification reduces surprises.
- Node and npm are pinned via Volta and engines; `npm ci` enforces lockfile determinism.
- Multi-layer testing (node:test, Vitest, Playwright, Cypress, Lighthouse) provides strong coverage.

### Where friction remains

- No standard `npm run preview` or `npm run dev` flow; contributors must assemble build + serve manually.
- `npm test` bundles two frameworks with no dedicated fast or targeted scripts.
- Environment flags and localStorage toggles are scattered across docs and scripts.
- Multiple image tools exist with overlapping responsibilities and no single entry point.
- CI debugging guidance is not consolidated, slowing first-time triage.

## 5. PR-ready DX Improvement Plan

PR 1 - Local Dev Onboarding Guide
- Scope: Add `docs/onboarding/LOCAL_DEV.md` and link it from `README.md`.
- Acceptance criteria:
  - The doc lists required runtimes (Node 22.x, Python 3.12) and the exact first-run commands.
  - The doc includes local flags (`ebano-sw-enable-local`, `ebano-allow-http-local`, `INCLUDE_ADMIN_PANEL`) with examples.
  - README Quick Start links to the new guide.

PR 2 - Preview and Test Slice Scripts
- Scope: Add scripts in `package.json`: `preview`, `test:unit`, `test:vitest`, `test:fast`, `lint`.
- Acceptance criteria:
  - `npm run preview` builds and serves `build/` on a documented port.
  - `npm run test:unit` runs `node test/run-all.js` only; `npm run test:vitest` runs Vitest only.
  - `npm run test:fast` runs unit + Vitest without E2E.

PR 3 - Environment Flags Quick Reference
- Scope: Add `docs/operations/ENV_FLAGS.md` and link it from README and RUNBOOK.
- Acceptance criteria:
  - A table lists build flags (CFIMG_ENABLE, CFIMG_DISABLE, FULL_REGEN, LH_SKIP_BUILD, BUILD_OUTPUT_DIR, INCLUDE_ADMIN_PANEL, PRODUCTS_JSON) and runtime toggles.
  - Each flag has a short example command or usage note.

PR 4 - Preview Server Hints
- Scope: Update `scripts/dev-server.mjs` startup output to include local flag hints for SW and HTTP.
- Acceptance criteria:
  - Startup logs include the `?sw=on` and `?http=on` hints plus localStorage alternatives.
  - No functional behavior changes to the server.

PR 5 - CI Triage Quickstart
- Scope: Add `docs/operations/CI-TRIAGE.md` with reproduction commands and artifact locations.
- Acceptance criteria:
  - Doc lists the minimal command set to reproduce CI failures locally.
  - Doc lists artifact paths (`reports/lighthouse/`, `test-results/`, `reports/snapshots/`) and when they appear.
