# 103 — Harden media intent runner against unhandled rejections and stuck state

- **Source**: Auditoría 9, B6 (CORRECTNESS-06)
- **Status**: TODO · **Priority**: P2 · **Effort**: S
- **Stamped against**: `ccb921f`

## Problem

`admin/content-manager/src/server/routes/media.ts` runs media jobs in a
fire-and-forget IIFE with no catch:

```ts
// media.ts:262-298
void (async () => {
  // ... runs the job, then update(patch) persists intent state via intents.save
})();
```

The route handler (media.ts:237-255) already saved `status: 'running'` and
returned `{ status: 'started' }`. If `intents.save` throws (fs error, disk
full, permissions on `data/media_intents/`), the promise rejects unhandled —
with Node's default behavior the admin process crashes — and on restart the
intent is still `running`, which permanently blocks `run` (409
`ALREADY_RUNNING` at media.ts:245) and `discard` (media.ts:336 blocks
`running`); `cancel` still works but the intent stays in an unrecoverable
state until someone hand-edits the intent file.

The job functions themselves (`mediaJobs.ts:47-147`) catch their own errors,
so the only unguarded throw source inside the IIFE is the state-persistence
path.

## Scope

**In**: `admin/content-manager/src/server/routes/media.ts` (the intent
runner IIFE), `test/integration/mediaWorkbench.test.ts` or the media intent
tests.

**Out**: the job implementations (`mediaJobs.ts`), `cancel`/`discard`
semantics.

## Steps

1. Wrap the IIFE body in try/catch; on throw, persist the failure:
   ```ts
   try {
     // existing job body
   } catch (err) {
     await update({ status: 'failed', errors: [String(err)] }).catch(() => {});
   }
   ```
   (the inner `.catch` guards against the failure-path itself failing — do
   not reintroduce an unhandled rejection while handling one).
2. Also `void promise.catch(...)` at the call site as belt-and-braces so an
   unexpected rejection never reaches Node's unhandled-rejection handler.
3. Verify `update` with `status: 'failed'` is not blocked by the route's
   state machine (check `media.ts` `run`/`cancel`/`discard` guards allow
   transitioning `running → failed` from this internal path).

## Tests

- Integration: simulate `intents.save` failure (inject a failing fs or mock
  the store in the test harness the way `failureInjection.test.ts` does) →
  assert the intent ends `failed` with the error recorded, and that a
  subsequent `run` on that intent is allowed (not stuck `running`).
- Run: `npm run admin:test` green.

## Done criteria

- [ ] No path inside the intent IIFE can produce an unhandled rejection.
- [ ] A persistence failure marks the intent `failed` (test proves it).
- [ ] `npm run admin:test` green; `npm run lint` green.

## Maintenance

The intent state machine (running → applied/failed) is the contract for the
media workbench; any new job must keep the "never block the route on job
failure" property that this fix restores for the persistence path.

## Rollback

`git revert <sha>`.
