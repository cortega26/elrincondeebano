# 152 — Extract a shared JSON-file repository base (load/validate) + multi-target atomic writer

- **Source**: Auditoría 10, DEBT-01 · **Status**: TODO · **Priority**: P2 · **Effort**: M
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/server/repositories/ admin/content-manager/src/server/services/atomicWriter.ts admin/content-manager/test/contract/ admin/content-manager/test/integration/repositories.test.ts`

## Problem

10 repository classes re-implement the same JSON load pipeline (`readFileSync → JSON.parse → zod safeParse → throw-with-joined-issues`), and the write path exists in 4 divergent variants:

- `productRepository.ts` — the ONLY consumer of `AtomicWriter` (journal + backups + idempotency + mtime/size cache).
- `categoryRepository.ts:100-133` — hand-rolled tmp→rename-to-backup→rename-to-target→`pruneFileBackups`.
- `storefrontRepository.ts:91-152` — same pattern TWICE (experience + bundles) with transactional rollback.
- `syncQueueRepository.ts:71-77` — third variant, no backups.

Semantics already diverge: `categoryRepository.write` returns `{rev}`, `storefrontRepository.write` has NO revision guard (`storefrontRepository.ts:85-89`). Every write-path bug fix must be re-applied in 4 places.

## Scope

**In**: A new base class + shared writer under `admin/content-manager/src/server/repositories/` (or `services/`), the migration of `CategoryRepository` and `SyncQueueRepository` (the safest two — plain JSON, single target), and `StorefrontRepository` only if the two-file transactional write fits the shared writer (else leave it, documented). Tests: existing contract + integration suites are the safety net (`test/contract/atomicWriter*`, `test/integration/repositories.test.ts`, `categoryMutationApi`, `backupRetention`).

**Out**: `ProductRepository` (its cache+idempotency+journal behavior is load-bearing for plans 092/105 — do NOT rebase it in this plan), the route layer, response shapes.

## Steps

1. Design the base: `JsonFileRepository<T>` with `load(): T` (read → parse → safeParse → throw), `save(data)` using a shared `AtomicFileWriter` that does tmp+rename+backup+prune (extract the sequence from `categoryRepository.ts:100-133`, which is the closest to AtomicWriter's semantics minus the journal). Keep the writer free of catalog-specific types (accept a JSON-serializable payload + file path).
2. Migrate `CategoryRepository` to extend the base (its `write` returns `{rev}` — preserve that contract exactly; the base must let subclasses post-process). Migrate `SyncQueueRepository` similarly (keep its `slice(-1000)` cap and lock methods untouched).
3. Leave `ProductRepository` and `StorefrontRepository` on their current implementations; add a comment pointing at the base for future writers. Only if `StorefrontRepository`'s two-file rollback maps cleanly onto the writer (it writes two files transactionally), migrate it too — otherwise document why not in a comment.
4. Run the full admin suite. Any behavior change fails a test — investigate, don't paper over.

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
