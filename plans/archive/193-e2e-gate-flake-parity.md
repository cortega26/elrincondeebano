# Plan 193: Gate the sharded E2E suites; kill timer flakiness; pin export/money parity; set coverage floors

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/playwright.config.ts admin/content-manager/package.json test/e2e-astro/cart-ux.spec.ts test/e2e-astro/storage-contract.spec.ts admin/content-manager/test/e2e/scope.spec.ts admin/content-manager/test/integration/exportApi.test.ts stryker.conf.mjs vitest.config.mts admin/content-manager/vitest.config.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (CI wiring lengthens runs; everything else LOW)
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: tests
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Five test-infrastructure gaps in one execution batch: (1) five admin E2E
suites are sharded out of the default run (`testIgnore`) with no
`test:e2e:*` scripts and no CI/validate wiring — scoped bulk-apply, stale
preview 409s, and media workbench have zero gated end-to-end verification.
(2) Real-timer sleeps survive in cart/storage/scope suites after plan 144
removed them elsewhere — loaded-CI flake seeds. (3) Filter-scoped export can
diverge from filter-scoped bulk-apply (plan 088 contract) with no
integration test (only sharded `scope.spec.ts:176`). (4) The money-math
mutation baseline (55.74%, `storefront-state` 90.91%) has ~44% surviving
mutants and its strongest characterization (`storefront-totals.spec.js`)
arrives via plan 170 — survivors need kill-cases. (5) Coverage gates (root
33/33/25/28, admin 40/25) certify the suite without constraining any risky
module — per-module floors need measurement first.

## Current state

Verified by advisor read/grep:

- `playwright.config.ts:25` ignores `import-export`, `change-set`,
  `media-workbench`, `storefront`, `scope` specs; `package.json:17,23,24`
  exposes only `test:e2e`, `test:e2e:import`, `test:e2e:changes`; neither
  `validate` nor `validate-release.mjs` invokes the isolated configs.
- Sleeps: `cart-ux.spec.ts:24,294,394,406` (120/150ms),
  `storage-contract.spec.ts:267` (200ms), `scope.spec.ts:325` (350ms),
  `notify-when-back.spec.ts:95` (150ms — suite skipped per commit
  `47b6bed9`, touch last or not at all). Positive pattern in-tree:
  `test/parking-reservation-timeout.spec.js:56` fake timers.
- `exportApi.test.ts` — 5 tests (full round-trip, CSV columns, filtered
  CSV); `changes.ts` is now a 27-line re-export shim (plan 158).
- `stryker.conf.mjs:19-22` — mutate scope cart-view/order-submit/
  storefront-state; `order-submit.spec.js:72-104` asserts clamp + formatting;
  `storefront-totals.spec.js` (plan 170) pins forged-price hydration.
- Thresholds: `vitest.config.mts:17-22` (33/25/28/33), admin
  `vitest.config.ts` (lines 40/branches 25, `main.tsx`/ErrorBoundary
  excluded) — suites pass comfortably above while `client.ts` (788 lines)
  and `CategoriesPage.tsx` (944) stay thin.

## Commands you will need

| Purpose  | Command                                                 | Provenance | Expected on success  |
| -------- | ------------------------------------------------------- | ---------- | -------------------- |
| Install  | `npm ci`                                                | declared   | exit 0               |
| Unit     | `npm test`                                              | declared   | all pass             |
| Coverage | `npm run test:coverage` + `npm run admin:test:coverage` | declared   | reports generated    |
| Mutation | `npm run test:mutation` (Stryker, opt-in; scoped)       | declared   | scoped run completes |
| E2E spot | isolated playwright configs one at a time               | declared   | pass                 |

## Scope

**In scope**: E2E script + CI wiring, sleep swaps, export-parity tests,
mutation kill-cases, coverage measurement + proposed floors.

**Out of scope**: fixing production bugs the new tests expose (file them);
E2E parallelization redesign (plan 189/206 own CI shape); raising floors
without the tests to satisfy them (measure → propose; enforce only with
green suites).

## Git workflow

- Branch: `advisor/193-e2e-gate-flake-parity`
- Commit per slice (gate → flakes → parity → mutation → floors).
- Do NOT push or open a PR unless the operator instructed it. (CI proof for
  the gate slice needs a CI run — mark BLOCKED pending CI if untriggerable.)

## Steps

### Step 0: Baseline

Requires plan 170 DONE. `npm test` green. Record one full coverage output
per suite (save for Step 5).

**Verify**: green; otherwise STOP.

### Step 1: Runnable E2E gate for sharded suites

Add `test:e2e:media/scope/storefront` scripts (mirroring the existing
import/changes entries) and either a `test:e2e:all` aggregator or a
scheduled-workflow proposal. Wire into CI the cheapest credible way (nightly
or the existing admin E2E job — check `.github/workflows/admin.yml` capacity
first; if the job cannot take five more suites, propose the schedule file
without enabling, and record that). Do NOT force all six configs into the
default suite (isolation from the real catalog is the point of sharding).

**Verify**: each new script runs its config locally green.

### Step 2: Replace real-timer waits

Swap each `waitForTimeout` for state-based waits (`visible/disabled/text`,
`expect.poll`) or the fake-timer pattern where unit-testable. Leave the
skipped `notify-when-back` suite alone except its sleep (swap only if
trivial; the suite is skipped until stock:false returns — plan 210 owns
that).

**Verify**: suites pass repeatedly (3× runs of the touched files).

### Step 3: Export-vs-bulk scope parity tests

Integration cases mirroring the bulk-scope cases for filtered export (same
filters → same product set), plus one history undo/redo round-trip. Reuse
existing temp-repo fixtures.

**Verify**: `npm run admin:test` green.

### Step 4: Mutation kill-cases

Run Stryker on the three scoped files; for each surviving money mutant add a
kill-case (share-link forgery, over-discount clamp, totals round-trip —
`storefront-totals.spec.js` is the home file). Characterization only — no
pricing logic change.

**Verify**: mutation score improves (record before/after); suite green.

### Step 5: Coverage floors — measure, then propose

From Step-0 outputs, record per-file lines/branches for the eight high-churn
files (ProductsPage, app.ts, client.ts, changes/*, catalog.ts,
storefront.js, CategoriesPage, media.ts). Propose per-module floors in the
commit; enforce (raise thresholds) ONLY for modules already above the
proposed floor with the new tests keeping them there. If enforcement would
go red, propose without enforcing and mark the enforcement follow-up.

**Verify**: suites green under whatever thresholds ship.

## Test plan

- This plan IS tests: new E2E scripts, swapped waits (3× stability),
  parity cases, kill-cases, floor proposal with numbers.
- Verification: `npm test` + isolated E2E configs + coverage outputs.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] New `test:e2e:*` scripts exist and run their configs green locally.
- [ ] No `waitForTimeout` remains in the touched suites (grep clean, except
      the skipped suite if left alone — then documented).
- [ ] Export-parity + undo/redo round-trip tests pass.
- [ ] Mutation before/after recorded; new kill-cases pass.
- [ ] Coverage per-file table recorded; floors raised only where green.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- CI cannot absorb the sharded suites anywhere (record capacity finding;
  ship scripts + nightly proposal only).
- A sleep swap exposes a genuinely slow path (file the perf bug; keep a
  bounded wait with a comment rather than faking green).
- Stryker cannot run in this environment (record; add kill-cases from the
  last known baseline only if one is committed — else defer with note).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- New E2E suites MUST ship with a runnable config + script from day one
  (the sharding lesson) — note the rule where the playwright configs live.
- New sleeps in tests are banned — point at the fake-timer/state-wait
  patterns in review.
- Reviewer: confirm thresholds were raised only where suites already pass
  with margin.
- **Deferred:** CI-time enforcement of proposed-but-red floors (needs the
  tests first); E2E parallelization (plans 189/206).
