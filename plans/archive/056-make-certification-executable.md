# Plan 056: Make Content Manager certification executable and truthful

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before continuing. Do not mark migration
> parity complete from static labels. Update this plan's row in `plans/README.md`
> when done unless a reviewer owns the index.
>
> **Drift check (run first)**:
> `git diff --stat 30dbab7..HEAD -- admin/content-manager/scripts admin/content-manager/test admin/content-manager/vitest.config.ts admin/content-manager/playwright.config.ts package.json .github/workflows`
> If the certification or CI files no longer match the current-state description,
> stop and report the drift before changing them.

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests / dx / migration
- **Planned at**: commit `30dbab7`, 2026-07-16
- **Findings covered**: F06

## Why this matters

`admin:certify` currently reports 21/21 from source literals, even when a workflow
is unimplemented. The real browser is not exercised, the React app is excluded
from coverage, and required root CI omits the TS manager. This plan creates honest,
commit-bound evidence early; readiness may remain red until plans 057–068 land.

## Current state

- `admin/content-manager/scripts/certification-report.ts:16-84` defines rows already
  marked `pass` and derives success from those constants.
- `admin/content-manager/scripts/parity-report.ts:25-64` compares one nine-product
  fixture and skips `field_last_modified`.
- `admin/content-manager/test/e2e/content-manager-smoke.spec.ts:3-8` requests only
  the health endpoint.
- `admin/content-manager/vitest.config.ts:19-28` excludes `src/web/**` and uses only
  55% line / 40% branch aggregate thresholds.
- `admin/content-manager/playwright.config.ts:21-28` starts a server only in CI.
- Root `package.json` has `admin:validate`, but `validate`, `.github/workflows/ci.yml`,
  and `.github/workflows/admin.yml` do not make the TS manager a required gate.

Use existing Vitest integration tests under `admin/content-manager/test/integration/`
as the API-test convention, and Playwright's configured disposable base URL as the
browser convention. Evidence artifacts belong under an ignored `reports/` path,
not beside source fixtures.

## Commands you will need

| Purpose               | Command                       | Expected on success     |
| --------------------- | ----------------------------- | ----------------------- |
| Typecheck             | `npm run admin:typecheck`     | exit 0                  |
| Unit/integration      | `npm run admin:test`          | all tests pass          |
| Coverage              | `npm run admin:test:coverage` | configured floors pass  |
| Build                 | `npm run admin:build`         | exit 0                  |
| Browser               | `npm run admin:test:e2e`      | Chromium workflows pass |
| Storefront regression | `npm run validate`            | exit 0                  |

## Scope

**In scope**:

- `admin/content-manager/scripts/{certification-report,parity-report}.ts`
- `admin/content-manager/test/contract/`, `test/integration/`, `test/e2e/`
- `admin/content-manager/vitest.config.ts`, `playwright.config.ts`, `package.json`
- root `package.json`, `.github/workflows/ci.yml`, `.github/workflows/admin.yml`

**Out of scope**:

- Fixing the product workflows that the new certification exposes as failing.
- Editing production catalogs, assets, or Python behavior.
- Claiming 21/21 until every evidence-producing scenario actually passes.

## Git workflow

- Branch: `test/056-executable-admin-certification`
- Use conventional commits, e.g. `test(admin): make parity certification executable`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Define the evidence contract

Create a Zod-validated, versioned certification artifact containing commit SHA,
timestamp, scenario ID, command/test identity, status, and evidence path. A row is
`pass` only when fresh machine-readable evidence exists for the current SHA. Missing,
stale, skipped, or malformed evidence must fail readiness.

**Verify**: run the focused reporter tests; fixtures for missing/stale/static evidence
must produce non-zero readiness while a complete current-SHA fixture passes.

### Step 2: Replace static parity rows

Make `certification-report.ts` consume generated test/differential results. Make
`parity-report.ts` compare complete canonical records and metadata for the shared
corpus. Preserve explicit manual acceptance rows, but require a separately recorded
operator sign-off rather than auto-passing them.

**Verify**: `npm run admin:certify` must currently report NOT READY and identify
the exact missing/failing scenarios; it must never print 21/21 from literals.

### Step 3: Add real workflow tests

Run Playwright against a disposable repository and cover at minimum: canonical
startup and authenticated write, product create/edit, selected bulk preview/apply,
reorder, import, category mutation, media intent, storefront edit, history/recovery,
and publication preflight without a real push. Remove source-string tests as proof
of browser behavior; they may remain only as lint-like checks.

**Verify**: `npm run admin:test:e2e` starts its own server locally and in CI, passes,
and never reads/writes the real repository catalog.

### Step 4: Enforce layered coverage and CI

Include TSX in executable coverage. Move toward the floors documented by Plan 055
(domain 95/90, repository 90/85, server 85/80, web 80/75, contract 90/85) without
using ignore comments to hide critical paths. Add a Node 24 TS-manager CI job for
typecheck, test, coverage, build, and E2E. Keep readiness certification informational
until all dependent plans land, but make reporter tests and manager validation required.

**Verify**: workflow YAML parses; `npm run admin:validate` and the local equivalent
of the CI job exit 0. `admin:certify` may exit non-zero only for explicitly reported
unfinished parity scenarios.

## Test plan

- Reporter tests: missing evidence, stale SHA, failed command, skipped row, manual
  sign-off absent/present, corrupt JSON, and complete evidence.
- Differential tests: every product field, category registry, storefront experience,
  stable identity, ordering, and unknown-field policy.
- Browser tests: loading/error/empty/success plus persisted result after reload.
- Startup test must execute `src/server/start.ts`, not only `createApp()` directly.

## Done criteria

- [ ] No certification status is hard-coded to `pass`.
- [ ] Current-SHA evidence is mandatory and schema-validated.
- [ ] `npm run admin:test:e2e` manages its own disposable server locally and in CI.
- [ ] React routes are included in executable coverage with enforced floors.
- [ ] Required CI runs TS typecheck, tests, coverage, build, and E2E.
- [ ] `npm run admin:typecheck`, `admin:test`, `admin:build`, and root `validate` pass.
- [ ] Only in-scope files plus `plans/README.md` changed.

## STOP conditions

- A proposed E2E path would touch the developer repository or real remote.
- Raising a coverage floor would require suppressing a real branch instead of testing it.
- CI cannot distinguish “suite infrastructure passed” from “migration readiness complete.”
- The evidence format cannot bind results to the current commit.

## Maintenance notes

Every later parity plan must add or update scenario evidence here. Reviewers should
reject future certification rows backed only by prose, source-file existence, or a
test name that was not executed.
