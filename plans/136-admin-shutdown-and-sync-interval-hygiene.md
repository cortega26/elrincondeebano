# 136 — Admin shutdown hygiene: clear job timers + catch sync-interval rejections

- **Source**: Auditoría 10, CORR-06 + CORR-07 · **Status**: TODO · **Priority**: P2 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/server/services/jobRunner.ts admin/content-manager/src/server/app.ts admin/content-manager/src/server/start.ts`

## Problem

Two process-lifecycle gaps in the admin server:

**1. Scheduled-job timers are never cleared on shutdown.** `JobRunner.shutdown()` (`admin/content-manager/src/server/services/jobRunner.ts:172-183`) marks pending jobs cancelled but does not clear `this.timers`:

```ts
async shutdown(): Promise<void> {
  this.shutdownRequested = true;
  for (const [, job] of this.jobs) {
    if (job.status === 'pending') {
      job.status = 'cancelled';
      ...
```

`scheduleAt` (`:78-89`) keeps a real `setTimeout` per scheduled job in `this.timers`; a cancelled-while-waiting job's timer still fires (its callback checks `cancelRequested` at `:81`, but the timer itself keeps the event loop alive until then). `app.ts` registers an `onClose` hook only for the sync interval (`app.ts:128-130`); `start.ts:96-100` masks the issue today by calling `process.exit(0)` — but any embedding (tests, a future graceful stop) hangs.

**2. Sync interval fires unawaited promises.** `app.ts:123-127`:

```ts
const syncTimer = setInterval(() => {
  if (syncService.isPaused() || !syncAdapter.isConfigured) return;
  void syncService.processOnce();
  void syncService.pullOnce();
}, 60_000);
```

`syncService` wraps processing in try/**finally** only (`syncService.ts` `releaseLock`); `loadCatalog`/`writeCatalog`/`queue.save` can throw (fs errors, corrupted catalog JSON → `productRepository.ts:75,90`). On Node 24 (`--unhandled-rejections=throw` default), a rejection from `void processOnce()` crashes the admin process.

## Scope

**In**: `admin/content-manager/src/server/services/jobRunner.ts` (shutdown clears timers), `admin/content-manager/src/server/app.ts` (onClose calls `jobRunner.shutdown()`; interval body try/catch), tests `test/contract/jobRunner.test.ts`, `test/integration/observability.test.ts` or a new sync-interval test.

**Out**: `start.ts` process-exit behavior, sync retry/backoff semantics.

## Steps

1. `JobRunner.shutdown()`: iterate `this.timers`, call `this.clock.clear(handle)` for each, and clear the map — in addition to the existing pending/running marking. Idempotent; pending jobs already get `cancelled`.
2. `app.ts`: in the existing `onClose` hook (`:128-130`), also `await jobRunner.shutdown()` (create the `jobRunner` before the hook is registered, or move the hook — keep declaration order correct).
3. `app.ts` interval body: wrap both calls in `try { await processOnce(); await pullOnce(); } catch (err) { app.log.error({ err }, 'sync interval failed'); }` — sequential awaits inside the interval are fine (they already run one per tick; keep the pausing check first).

## Tests

- `jobRunner.test.ts` (injected clock pattern already exists for `scheduleAt`): schedule a job with the fake clock, call `shutdown()`, advance the clock past the due time → assert the callback never ran and the fake clock's `clear` was called.
- Interval test (model after `test/integration/syncWorkflow.test.ts`): build the app with a `SyncService` stub whose `processOnce` rejects → assert the server stays up (subsequent request succeeds) and the error is logged, no unhandled rejection. If the app builder makes injection awkward, test the interval body as an extracted function.
- Run: `npm run admin:test` green; `npm run admin:typecheck`; `npm run lint` green.

## Done criteria

- [ ] `shutdown()` clears scheduled timers (asserted with the fake clock).
- [ ] A rejecting `processOnce` does not crash the app (asserted).
- [ ] `npm run admin:test` green.

## Maintenance

The `process.exit(0)` in `start.ts` currently masks both issues; if graceful shutdown is ever implemented for real, these fixes are what make it safe. A reviewer should check that no new `void <promise>` is added to the interval without a catch.

## Rollback

`git revert <sha>`.

## STOP conditions

- If `app.ts` creates `jobRunner` after the `onClose` hook is registered (order-dependent), stop and report — the fix must preserve declaration order.
