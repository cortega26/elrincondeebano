# Plan 037: Align runtime, runner and bootstrap documentation with executable truth

> **Executor instructions**: Treat scripts/workflows/imports as authority, preserve historical docs as history, and update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 877f179..HEAD -- README.md CONTRIBUTING.md docs/START_HERE.md docs/architecture/CODEBASE_MAP.md docs/repo/STRUCTURE.md docs/repo/ACTIVE_SURFACES.json docs/operations/OBSERVABILITY.md docs/operations/RUNBOOK.md docs/onboarding/BOOTSTRAP.md docs/adr/0004-github-pages-cloudflare.md package.json .github/workflows/live-contract-monitor.yml .github/workflows/post-deploy-canary.yml`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `877f179`, 2026-07-14 (reconciled against `0eebd57`, 2026-07-15)

## Why this matters

Active docs route storefront work to legacy `src/js`, list legacy modules as browser entrypoints, describe deleted observability wiring, require self-hosted live runners after migration to GitHub-hosted, and disagree about npm workspace installation. These contradictions cause agents and responders to change or debug the wrong surface.

## Current state (reconciled against `0eebd57`, 2026-07-15)

**Still active (3 items):**

- `docs/repo/ACTIVE_SURFACES.json` lines 4-8 still lists two legacy `src/js` browser entrypoints (`app-bootstrap.mjs`, `product-data-manager.mjs`) alongside the correct `storefront.js`.
- `docs/operations/OBSERVABILITY.md` lines 26-40 still references deleted `src/js/modules/observability.mjs` (zero matches on disk). Should instead describe `astro-poc/src/scripts/storefront/observability.js`.
- CODEBASE_MAP (lines 104, 111), RUNBOOK (lines 36, 209-210) and ADR-0004 (line 29) all still mandate self-hosted runners. Every workflow already uses `ubuntu-24.04`.

**Already fixed by drift (3 items — skip):**

- `README.md` already names only `astro-poc/src/scripts/storefront.js` as canonical browser entrypoint.
- `docs/onboarding/BOOTSTRAP.md` already documents root workspace `npm ci` and warns against a second install inside `astro-poc/`.
- Plan 010 is already marked DONE in `plans/README.md` (master table row + reconciliation section).

## Commands you will need

| Purpose   | Command                                                                                 | Expected |
| --------- | --------------------------------------------------------------------------------------- | -------- |
| Contracts | `node test/active-surfaces.contract.test.js`                                            | pass     |
| Markdown  | `npx markdownlint-cli2 'docs/**/*.md' '*.md' '#node_modules' '#astro-poc/node_modules'` | exit 0   |
| Baseline  | `npm test`                                                                              | pass     |

## Scope

**In scope**: drift-check docs/manifest and focused contract tests; `plans/README.md` reconciliation for plan 010.

**Out of scope**: editing archived historical reports except adding a clear historical banner; deleting `src/js`; test-runner migration (plan 024); workflow behavior changes.

## Git workflow

- Branch: `advisor/037-runtime-doc-truth`
- Commit: `docs: align active surfaces and operations`

## Steps

### Step 1: Remove legacy entrypoints from ACTIVE_SURFACES.json

Remove `src/js/modules/app-bootstrap.mjs` and `src/js/modules/product-data-manager.mjs` from the `browser_entrypoints` array in `docs/repo/ACTIVE_SURFACES.json`. Keep only `astro-poc/src/scripts/storefront.js`. Verify active-surfaces contract test still passes. If the contract test is checking for those legacy entries, update it to only require the shipped Astro entry.

**Verify**: `node test/active-surfaces.contract.test.js` passes. Visual check: `docs/repo/ACTIVE_SURFACES.json` browser_entrypoints = `["astro-poc/src/scripts/storefront.js"]`.

### Step 2: Rewrite observability documentation

Replace the legacy observability section (lines ~26-40) in `docs/operations/OBSERVABILITY.md` with a description of `astro-poc/src/scripts/storefront/observability.js` — its initialization in `storefront.js`, what metrics it collects, and any known limitations. Do NOT reference the deleted `src/js/modules/observability.mjs`. Do NOT claim product-data fetch integration unless the active code proves it.

**Verify**: `grep -r "observability.mjs" docs/operations/OBSERVABILITY.md` returns no legacy path. Every referenced path exists on disk.

### Step 3: Replace self-hosted runner references with GitHub-hosted

In `docs/architecture/CODEBASE_MAP.md` (lines 104, 111), `docs/operations/RUNBOOK.md` (lines 36, 209-210), and `docs/adr/0004-github-pages-cloudflare.md` (line 29): replace all claims that live probes / canary / contract monitors require a self-hosted runner. Document that they now use `ubuntu-24.04` GitHub-hosted runners. In ADR-0004, add a superseding note documenting the migration date and rationale. In RUNBOOK, update the probe instructions accordingly.

**Verify**: `grep -rn "self-hosted" docs/architecture/CODEBASE_MAP.md docs/operations/RUNBOOK.md docs/adr/0004-github-pages-cloudflare.md` returns zero matches (or only historical mentions clearly marked as superseded). Workflow `runs-on: ubuntu-24.04` values match docs.

### Step 4: Docs gate

**Verify**: markdown lint (`npx markdownlint-cli2 'docs/**/*.md' '*.md' '#node_modules' '#astro-poc/node_modules'`) and `npm test` pass.

## Test plan

Extend active-surface and workflow source-contract tests only where they assert durable ownership, not incidental line formatting.

## Done criteria

- [ ] Active surface manifest lists only the shipped `storefront.js` entrypoint (zero legacy `src/js` entries).
- [ ] OBSERVABILITY.md describes the active `storefront/observability.js`, not the deleted `src/js/modules/observability.mjs`.
- [ ] CODEBASE_MAP, RUNBOOK, and ADR-0004 no longer claim self-hosted runners are required; they document `ubuntu-24.04` GitHub-hosted.
- [ ] All gates pass: active-surfaces contract, markdown lint, `npm test`.

## STOP conditions

- Root `npm ci` in a clean environment does not install the Astro workspace correctly.
- A supposedly legacy `src/js` file is imported into shipped Astro output (verify with codegraph before removing from manifest).
- Live runner migration is temporary and lacks maintainer approval; document current state without rewriting the durable ADR decision.
- The active-surfaces contract test has logic that cannot be updated without breaking build/test infrastructure.

## Maintenance notes

Behavior, command, ownership and runner changes must update these docs in the same PR per `ENGINEERING_PRIORITIES.md`.
