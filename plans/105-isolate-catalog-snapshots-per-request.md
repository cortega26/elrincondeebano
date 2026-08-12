# 105 — Isolate catalog snapshots per request (kill false 409s from concurrent edits)

- **Source**: Auditoría 9, B8 (CORRECTNESS-03)
- **Status**: TODO · **Priority**: P1 · **Effort**: M
- **Stamped against**: `ccb921f`

## Problem

`admin/content-manager/src/server/repositories/productRepository.ts` hands
out the **same mutable catalog object** on every cache hit:

```ts
// productRepository.ts:42-77
loadCatalog() returns this.cache.catalog  // same reference on mtime/size cache hit
writeCatalog() nulls the cache, then re-checks current.rev !== baseRevision inside the lock
```

`productService.edit` mutates the passed catalog in place and bumps
`catalog.rev` (`domain/products/productService.ts:319`). Two concurrent
`PATCH /products/:id` requests (`routes/catalog.ts:238-358`) both call
`loadCatalog()` (same object), both mutate it (rev N→N+1→N+2), then serialize
through the `MutationLock`: the first write persists **both** mutations and
the second gets a 409 "Stale catalog revision" — but its edit is already on
disk, attributed to the first request's `command_id`.

Result: one operator sees a conflict error for a change that actually went
through; history/audit attributes the merged write to the wrong command; a
retry hits a product-rev 409 and forces a manual reload. GET handlers can
also observe in-memory mutations never written.

## Scope

**In**: `admin/content-manager/src/server/repositories/productRepository.ts`
(`loadCatalog`), the mutation routes that call it
(`routes/catalog.ts`, `routes/storefront.ts` if it loads the catalog),
`test/integration/mutationApi.test.ts` (add a concurrency case).

**Out**: `writeCatalog`/lock semantics (keep the rev check — it is correct),
read-only GET paths (they tolerate snapshots; no change needed).

## Steps

1. Make mutation routes operate on a private copy: add
   `loadCatalogFresh()` (or a `clone` flag to `loadCatalog`) that returns a
   `structuredClone` of the cached catalog on cache hit, and use it in the
   mutation handlers (edit/update, category ops that mutate products, bulk).
   Reads (`GET /products`) may keep the shared reference.
2. Keep the existing mtime/size cache for the expensive disk read; only the
   clone step is added per mutation request. For a ~184-product catalog this
   is microseconds; measure with the existing perf tooling if in doubt.
3. Verify the rev guard still works: with snapshots, the second writer's
   `writeCatalog` re-check (`current.rev !== baseRevision`) fires correctly
   because the clone carries the same base rev as the first writer.

## Tests

- Integration (Fastify `app.inject`): fire two concurrent PATCHes at the
  same product (or two products in the same catalog) via `Promise.all` →
  assert exactly one succeeds and the other gets 409, AND the losing edit
  is NOT present in the persisted catalog (read back from disk / fresh
  GET). This test fails on `ccb921f` (both edits persisted, wrong command
  attribution).
- Assert GET handlers never observe uncommitted mutations (concurrent
  edit + GET race).
- Run: `npm run admin:test` green.

## Done criteria

- [ ] Concurrent mutation test: loser's edit absent from disk; winner's
      command_id is the only one recorded.
- [ ] All existing mutation/integration tests still pass (no behavior change
      for serial requests).
- [ ] `npm run admin:test` + `npm run lint` + `npm run typecheck` green.

## Maintenance

This is the correctness foundation for any future concurrency work
(plan 121 batch-undo, plan 099 undo failure paths). If the catalog grows an
order of magnitude, revisit the clone cost (copy-on-write or per-session
catalog).

## Rollback

`git revert <sha>` — clone path is additive; serial behavior unchanged.
