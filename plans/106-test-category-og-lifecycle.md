# 106 — Add tests for category OG lifecycle (zero coverage on the newest side effect)

- **Source**: Auditoría 9, T1 (TEST-01)
- **Status**: TODO · **Priority**: P1 · **Effort**: M
- **Stamped against**: `ccb921f`

## Problem

`admin/content-manager/src/server/services/categoryOgLifecycle.ts` (86
lines, shipped in `ff277fe`) is the newest catalog-mutation side effect and
has **zero test coverage**. Its wiring:

```ts
// routes/catalog.ts:529 (on category save/delete)
void ensureCategoryOgAssets(repoRoot, slug, operation);
```

- It writes durable `MediaIntent` records (`categoryOgLifecycle.ts:38`).
- It spawns `python3` via `services/mediaJobs.ts:4` (external process).
- It has a failed/applied state machine with a "verify canonical state then
  mark applied" contract (categoryOgLifecycle.ts:59-75).
- `test/integration/categoryMutationApi.test.ts` (504 lines) contains no
  og/intent assertions.

A regression in intent status transitions, or in the "never blocks the
category operation" contract, ships undetected; only the manual workbench
e2e touches `runCategoryOgJob`.

## Scope

**In**: `admin/content-manager/src/server/services/categoryOgLifecycle.ts`
(no behavior change — tests only), a new contract test file under
`test/contract/` (follow the existing `test/contract/*.test.ts` pattern,
e.g. `undo.test.ts` or `atomicWriter.test.ts`), and
`test/integration/categoryMutationApi.test.ts` (one assertion).

**Out**: `mediaJobs.ts`, the Python OG generator itself.

## Steps

1. Contract tests for `ensureCategoryOgAssets` against a **temp repoRoot**
   with a stubbed job runner (inject the runner the way the service already
   allows, or refactor minimally to accept one):
   - generate-ok → intent reaches the applied/failed terminal state per the
     service's own contract;
   - generate-missing-file / job failure → intent `failed`, error recorded;
   - delete-with-file-present → intent `failed` (or the documented
     skip/failure behavior);
   - the never-blocks-category-operation contract: the category save/delete
     route returns 2xx even when the OG job will fail.
2. Add one integration assertion in `categoryMutationApi.test.ts`: a category
   PATCH creates a `running` (or `queued`) intent in the media intents store
   (read it back from the temp repo's `data/media_intents/`).
3. Follow the existing test conventions: Fastify `app.inject`, temp repo
   fixtures (see `categoryMutationApi.test.ts` setup), no real python3
   spawns — stub `runCategoryOgJob`.

## Tests

- The contract + integration tests ARE the deliverable; run
  `npm run admin:test` green.
- `npm run admin:certify` green (certification gate).

## Done criteria

- [ ] Every branch of the intent state machine in `categoryOgLifecycle.ts`
      has a test (grep the file for branches; each maps to a test).
- [ ] Integration assertion proves category PATCH → intent created.
- [ ] `npm run admin:test` + `npm run lint` green.

## Maintenance

This service is the model for any future "generate asset after mutation"
feature — the tests document the two invariants that matter: durability of
the intent and non-blocking of the primary operation.

## Rollback

N/A (tests only; revert if they prove the behavior wrong, then fix the
service under the same plan).
