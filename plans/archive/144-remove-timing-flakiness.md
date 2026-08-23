# 144 — Remove the last flakiness patterns: absolute timing thresholds + real sleeps

- **Source**: Auditoría 10, TEST-06 · **Status**: TODO · **Priority**: P2 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/test/contract/performance.test.ts admin/content-manager/test/contract/jobRunner.test.ts admin/content-manager/test/integration/gitPull.test.ts admin/content-manager/test/integration/syncWorkflow.test.ts`

## Problem

Two flakiness classes remain in the admin suite (plan 109 fixed one earlier instance; these are the rest):

1. **Absolute wall-clock latency budgets.** `test/contract/performance.test.ts:84-86,111-113,140-142,169-171` assert medians like `createApp < 150ms`, `health < 50ms`, `product-list < 200ms`, `filtered search < 100ms` via `performance.now()`. On a loaded CI runner these are inherently flaky — and a red threshold teaches people to distrust the suite or bump budgets arbitrarily.
2. **Real-timer sleeps for async sequencing.** `test/contract/jobRunner.test.ts:77,155` and `test/integration/gitPull.test.ts` use real `setTimeout(resolve, 50-500)` (10 sites) to wait for async jobs; `test/integration/syncWorkflow.test.ts:620` uses a real 3s timeout on a real HTTP connection. The rest of the suite already follows the good pattern: injected clock for `scheduleAt` (`jobRunner.test.ts`), temp dirs per test, promise gates.

## Scope

**In**: The four test files listed in the drift check.

**Out**: Production code (no behavior change); the _structural_ perf assertions in the same file that don't depend on wall-clock (e.g. complexity checks) — keep those.

## Steps

1. `performance.test.ts`: replace absolute-median budgets with CI-tolerant checks that still catch the regression class they guard:
   - Prefer structural assertions (e.g. "product-list response contains no per-product repository reads" — via a spy on the repository, if the test setup allows) OR
   - Keep timing but make it relative: assert `median(t1) <= median(t0) * factor` with a generous factor (e.g. 5×) where a baseline run is measured first in the same test, and skip if the environment is slow (documented env check). Absolute fixed numbers are banned.
2. `jobRunner.test.ts` / `gitPull.test.ts`: replace `setTimeout` sleeps with promise gates — poll for the expected state with `vi.waitFor` (vitest 4 supports it) or await a completion promise the code under test exposes. Where the production code genuinely needs wall-clock (git subprocesses), poll with a short interval and a generous deadline instead of a fixed sleep.
3. `syncWorkflow.test.ts:620`: reduce reliance on a fixed 3s timeout — use `vi.waitFor` on the observable state (or the SSE message arrival) with a deadline.

## Tests

The changes are to the tests themselves; the suite must go green and stay green on repeated runs: run `npm run admin:test` three times locally — all three green.

## Done criteria

- [ ] No `performance.now()`-based absolute threshold remains in `performance.test.ts` (grep).
- [ ] No `setTimeout(resolve, N)` sequencing sleeps remain in the three files (grep).
- [ ] `npm run admin:test` green ×3 consecutive runs.

## Maintenance

This is the last known flakiness class in the admin suite (per the audit). If CI adds a loaded-runner job, review these files first. A reviewer should confirm the perf tests still FAIL on a deliberately slow path (inject a `sleep` in the repository and see the structural check trip) — a test that can't fail is not a test.

## Rollback

`git revert <sha>`.

## STOP conditions

- If a sleep is load-bearing because the production code has no observable completion signal, stop and report that specific site — do not weaken it into a longer sleep.
