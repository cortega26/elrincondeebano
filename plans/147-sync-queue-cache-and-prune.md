# 147 — Sync queue: cached reads, pruning of terminal entries

- **Source**: Auditoría 10, PERF-04 · **Status**: TODO · **Priority**: P2 · **Effort**: S-M
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/server/repositories/syncQueueRepository.ts admin/content-manager/src/server/services/syncService.ts admin/content-manager/src/server/routes/conflicts.ts`

## Problem

Every sync-status read pays a full file read + parse + per-entry zod validation, and the queue never prunes terminal entries.

- `syncQueueRepository.ts:54-69` — `load()` reads and `JSON.parse`s the whole queue file and runs `syncQueueEntrySchema.safeParse` on EVERY entry (each carries a full product snapshot). `save()` (`:71-77`) rewrites the whole file on every enqueue (product edits enqueue per edit — `syncService.enqueue` at `syncService.ts:63-88` does `load()` + dedup + `save()`).
- `conflicts.ts:138-171` — `buildSyncStatus()` calls `syncService.getQueue()` → `load()` on every SSE tick (5s) and every `GET /sync/status`; the background loop (`app.ts:123-127`) calls `processOnce`+`pullOnce` every 60s, each of which loads the queue again.
- The current file holds 65 `pending` entries (~83 KB) — all `pending`, re-attempted (network push) every 60s indefinitely; growth is bounded only by the 1000-entry cap (`slice(-1000)`, `:72`); `synced`/`error` entries are never removed.

## Scope

**In**: `admin/content-manager/src/server/repositories/syncQueueRepository.ts`, `admin/content-manager/src/server/routes/conflicts.ts` (only if the counts path needs a lighter accessor), tests `test/contract/` (new syncQueue test) or `test/integration/syncWorkflow.test.ts`.

**Out**: `syncService` enqueue/retry semantics, backoff timing, the SSE payload shape.

## Steps

1. **Prune on save**: in `save()`, drop entries whose status is terminal and no longer needed:
   - `synced` entries: drop on the save that follows their ack (a synced entry is evidence already pushed successfully; the remote has it). Keep the last N=50 synced entries as a short evidence window if the UI shows recent syncs — check what the UI renders (ConflictsPage/sync panel) before choosing N; if it only shows counts + pending, drop all synced.
   - `error` entries: KEEP (they are retryable per plan 064 backoff) but cap the count (e.g. keep the most recent 200) so a stuck remote doesn't grow the file forever.
   - Document the exact choice in the code comment and this plan's test.
2. **Cache reads**: cache the parsed+validated entries keyed on file mtime+size (the pattern `ProductRepository.loadCatalog` uses at `productRepository.ts:51-60`); `load()` returns the cache when mtime/size unchanged. Invalidate on `save()`.
3. If `buildSyncStatus` only needs counts (it does — `conflicts.ts:142-147` filters the full array for counts), leave it on `getQueue()` (now cached) — no payload change.

## Tests

- New contract test for `SyncQueueRepository` (temp dir pattern from `test/contract/`): (a) save with synced entries → they are pruned per the policy; (b) error entries kept within the cap; (c) `load()` twice with no write between → second call is served from cache (assert same array identity or a spy on fs read); (d) existing enqueue flow tests (`syncWorkflow.test.ts`) still green — the queue semantics for pending entries are unchanged.
- Run: `npm run admin:test` green; `npm run admin:typecheck`; `npm run lint` green.

## Done criteria

- [ ] Terminal entries pruned per the documented policy (asserted).
- [ ] `load()` served from cache across unchanged reads (asserted).
- [ ] `npm run admin:test` green (incl. existing syncWorkflow).

## Maintenance

Plan 064's remote-ack semantics are the constraint: prune only what the remote has acknowledged. If remote sync gains a "resend history" feature, the synced-window N becomes load-bearing. A reviewer should confirm no code path re-enqueues from pruned synced entries (dedup logic in `syncService.enqueue`).

## Rollback

`git revert <sha>`.

## STOP conditions

- If the UI renders the synced queue history (not just counts), stop and report — the pruning policy must match what the UI displays.
