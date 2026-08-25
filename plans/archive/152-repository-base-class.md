# 152 — Extract a shared JSON-file repository base (load/validate) + multi-target atomic writer

- **Source**: Auditoría 10, DEBT-01 · **Status**: TODO · **Priority**: P2 · **Effort**: M
- **Stamped against**: `a610ac9a` (2026-08-25, reconciled) · **Drift check**: `git diff --stat a610ac9a..HEAD -- admin/content-manager/src/server/repositories/ admin/content-manager/src/server/services/atomicWriter.ts admin/content-manager/test/contract/ admin/content-manager/test/integration/repositories.test.ts`
- **Reconciled**: 2026-08-25 — `ee20b0f6→a610ac9a` added mtime+size caches to `storefrontRepository.ts` (plan 150), `syncQueueRepository.ts` (plan 147) and `mediaRepository.ts` (plan 148), plus `atomicWriter.ts` journal signature. Write-path divergence (4 variants) and read-pipeline duplication remain; caches are now the convergence target for the base (base should include mtime key + invalidation on own writes, as `ProductRepository` does). Drift is additive, not invalidating.

## Problem

10 repository classes re-implement the same JSON load pipeline (`readFileSync → JSON.parse → zod safeParse → throw-with-joined-issues`), and the write path exists in 4 divergent variants (now 3 of them plus `mediaRepository` have diverged further with per-repo mtime caches added by plans 147/148/150):

- `productRepository.ts` — the ONLY consumer of `AtomicWriter` (journal + backups + idempotency + mtime/size cache `productRepository.ts:30-60`).
- `categoryRepository.ts:100-133` — hand-rolled tmp→rename-to-backup→rename-to-target→`pruneFileBackups`, **no cache yet** (the only repo without one).
- `storefrontRepository.ts:91-152` — same pattern TWICE (experience + bundles) with transactional rollback, now with mtime+size cache `storefrontRepository.ts:34-53` (plan 150, no `structuredClone`).
- `syncQueueRepository.ts:71-77` — third variant, no backups, now with mtime+size cache `syncQueueRepository.ts:47-74` + pruning `syncQueueRepository.ts:95-108` (plan 147).
- `mediaRepository.ts` — fourth large repo, now with directory-walk mtime cache `mediaRepository.ts:21-58` (plan 148, invalidated externally).

Semantics already diverge: `categoryRepository.write` returns `{rev}`, `storefrontRepository.write` has NO revision guard (`storefrontRepository.ts:85-89`). Every write-path bug fix must be re-applied in 4 places, and every cache optimisation is re-implemented per file.

## Scope

**In**: A new base class + shared writer under `admin/content-manager/src/server/repositories/` (or `services/`), the migration of `CategoryRepository` (no cache yet) and optionally `SyncQueueRepository`/`MediaRepository` if their cache+pruning fits the base without behavior change; `StorefrontRepository` only if the two-file transactional write fits the shared writer (else leave it, documented). Tests: existing contract + integration suites are the safety net (`test/contract/atomicWriter*`, `test/integration/repositories.test.ts`, `categoryMutationApi`, `backupRetention`). If a repo already has a cache (syncQueue, storefront, media), the base should subsume that cache pattern (mtime+size key, invalidate on own writes, external edits via stat change) rather than layering a second cache.

**Out**: `ProductRepository` (its cache+idempotency+journal behavior is load-bearing for plans 092/105 — do NOT rebase it in this plan; it is the reference for the cache pattern), the route layer, response shapes.

## Steps

1. Design the base: `JsonFileRepository<T>` with `load(): T` (read → parse → safeParse → throw) including mtime+size-keyed cache (pattern `ProductRepository:30-60` / `StorefrontRepository:34-53` / `SyncQueueRepository:47-74` — key = `${stat.mtimeMs}:${stat.size}`, hit returns same reference or `structuredClone` depending on whether callers mutate in place; CategoryRegistry callers do not mutate, so same-reference is correct) and `save(data)` using a shared `AtomicFileWriter` that does tmp+rename+backup+prune (extract the sequence from `categoryRepository.ts:100-133`, which is the closest to AtomicWriter's semantics minus the journal). Keep the writer free of catalog-specific types (accept a JSON-serializable payload + file path).
2. Migrate `CategoryRepository` to extend the base (its `write` returns `{rev}` — preserve that contract exactly; the base must let subclasses post-process; add the mtime cache now missing). Optionally migrate `SyncQueueRepository`/`MediaRepository` if their existing cache+pruning (syncQueue `slice(-1000)` + error cap 200, media `invalidate()` + productsKey) maps cleanly onto the base; if pruning semantics differ, keep them separate and document. Keep `SyncQueueRepository` lock methods (`acquireLock`/`releaseLock`) untouched regardless.
3. Leave `ProductRepository` and `StorefrontRepository` on their current implementations (storefront's two-file rollback is transactional and already cached — plan 150); add a comment pointing at the base for future writers. Only if `StorefrontRepository`'s two-file rollback maps cleanly onto the writer (it writes two files transactionally), migrate it too — otherwise document why not in a comment and keep its plan-150 cache as-is.
4. Run the full admin suite. Any behavior change fails a test — investigate, don't paper over. Verify `grep -rn "extends JsonFileRepository"` hits the migrated repos.

## Tests

- The existing suites for category/sync-queue (`categoryMutationApi.test.ts`, `syncWorkflow.test.ts`, `test/contract/*`) must pass UNCHANGED after the migration — that is the primary assertion.
- Add one contract test for the base itself: write → load round-trip, backup created + pruned to N, and malformed file → typed throw.
- Run: `npm run admin:test` green; `npm run admin:typecheck`; `npm run lint` green.

## Done criteria

- [ ] `CategoryRepository` and `SyncQueueRepository` extend the shared base (grep `extends`).
- [ ] No behavioral change: full admin suite green with zero production-line edits beyond the two repos + new base files.
- [ ] `npm run admin:test` green.

## Maintenance

This is the write-path convergence plan 078's journaling deliberately deferred for category/storefront ("out of scope for journal wiring", `app.ts:99-102`). When the base is solid, ProductRepository can be rebased in a follow-up — but only with its cache+idempotency preserved. A reviewer should verify `storefrontRepository`'s two-file rollback either migrated cleanly or is documented as intentionally separate.

## Rollback

`git revert <sha>`.

## STOP conditions

- If migrating `CategoryRepository` changes any response/rev semantics (a contract test fails for a non-obvious reason), STOP and report — do not "fix" the test to match a behavior change.
