# 130 — Clear the publication recovery journal on handled failure or cancellation

- **Source**: Auditoría 10, CORR-03 · **Status**: TODO · **Priority**: P1 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/server/routes/publication.ts admin/content-manager/src/server/services/publicationRecovery.ts admin/content-manager/src/server/services/jobRunner.ts`

## Problem

A failed or cancelled publication leaves `publication-recovery.json` populated forever. `recovery.clear()` runs only on the success path (`admin/content-manager/src/server/routes/publication.ts:248`); every handled failure (`:182` preflight, `:208` stage, `:217` commit, `:242` push) and every cancellation (`checkCancel` throws at `:172,206,215,221,239`) skips it:

```ts
jobRunner.updateProgress(jobId, 100);
recovery.clear();

return { commit: commitSha, pushed: push };
```

`publicationRecovery.ts:47-50` reports pending recovery whenever the journal exists:

```ts
hasPendingRecovery(): boolean {
  const state = this.load();
  return state !== null && state.current_job_id !== undefined;
}
```

The job is marked `failed`/`cancelled` in `jobRunner.ts:154-160`, but the journal is never touched on those paths. Result: `GET /api/v1/publications/recovery` reports `pending_recovery: true` indefinitely after any failed/cancelled publication — a false crash signal that survives restarts and has no clearing API. The rollback-drill contract (`test/integration/rollbackDrill.test.ts:84-95`) treats this state as meaningful.

## Scope

**In**: `admin/content-manager/src/server/routes/publication.ts` (job body), `test/integration/publication.test.ts` and/or `test/integration/publicationAdvanced.test.ts`.

**Out**: `publicationRecovery.ts` semantics for real crashes — a crash mid-stage (process death) must still leave the journal for manual recovery. The journal is the crash-resume mechanism (plan 058); only HANDLED failures/cancels clear it.

## Steps

1. In the publication job body (`publication.ts:166-251`), wrap the body so that on a **handled** error or cancellation the journal is cleared before the error propagates:
   - Recommended shape: extract the current body into the `try` of a `try/catch`; in `catch (err)`, if the failure came from a known handled path (any throw inside the body, or `job.cancelRequested`), call `recovery.clear()` (guarded try/catch — `clear()` already ignores errors) and rethrow.
   - Do NOT clear on process crash — that path never reaches the catch, which is exactly what keeps the crash-resume contract intact.
2. Leave `hasPendingRecovery()` as-is.

## Tests

- Integration test (model after `test/integration/publication.test.ts` or `rollbackDrill.test.ts`): (a) trigger a publication that fails preflight/validation → `GET /publications/recovery` returns `pending_recovery: false`; (b) schedule a publication and cancel it before it runs → `pending_recovery: false`; (c) keep an existing test proving a mid-run simulated crash still reports `pending_recovery: true` (regression guard for the crash path — if no such test exists, add one).
- Run: `npm run admin:test` green; `npm run admin:typecheck`; `npm run lint` green.

## Done criteria

- [ ] Handled failure → journal cleared (asserted).
- [ ] Cancellation → journal cleared (asserted).
- [ ] Crash simulation still leaves `pending_recovery: true` (asserted).
- [ ] `npm run admin:test` green.

## Maintenance

The crash-vs-handled boundary is the invariant: any future code that converts a crash into a handled error (e.g. a retry wrapper) must not run before the journal write that marks the crash state. A reviewer should check that no new `throw` in the job body bypasses the clear.

## Rollback

`git revert <sha>`.

## STOP conditions

- If `jobFn` is called in more than one place (scheduled vs immediate path differ structurally), stop and report — the plan assumes one body.
