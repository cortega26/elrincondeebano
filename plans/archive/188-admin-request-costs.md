# Plan 188: Trim admin request costs — sync batches, cloned reads, paginated payloads, media cache

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/server/services/syncService.ts admin/content-manager/src/server/repositories/productRepository.ts admin/content-manager/src/server/routes/productRoutes.ts admin/content-manager/src/server/routes/historyRoutes.ts admin/content-manager/src/server/routes/importRoutes.ts admin/content-manager/src/server/routes/media.ts admin/content-manager/src/server/repositories/mediaRepository.ts admin/content-manager/src/web/api/client.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/170-land-working-tree-baseline.md, plans/171-catalog-cache-miss-isolation.md
- **Category**: perf
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Admin request costs scale with catalog size instead of viewport: sync queue
drains at one network RTT per entry with 3 full catalog loads per pull;
every list/detail/revert pays a full `structuredClone` plus up-to-8 stacked
`.filter` passes; single clicks (`scope=all` bulk, history, export/CSV,
`/media` with ~4000 items) materialize megabytes; and `/media` pays a full
dir walk + multi-KB key build even on cache hits (plan 148 gap). Follow-ups
to plans 105 (isolation — do NOT regress it) and 147 (prune policy — not
re-reported). Ship in small contract-preserving slices.

## Current state

Key excerpts (all verified by advisor read):

```ts
// syncService.ts — serial push per entry; pull loads catalog 3× (start, batch, cursor)
for (const entry of entries) { ... await this.adapter.pushChange({...}); }
const catalog = this.repos.products.loadCatalog();   // pull start
const catalog = this.repos.products.loadCatalog();   // batch
return { ..., cursor: this.repos.products.loadCatalog().rev };  // cursor
// enqueue: entries.some(e => JSON.stringify({...}) === signature) — O(n) stringifies
// mergeSnapshotIntoCatalog: catalog.products.find per change
```

```ts
// productRepository.ts getAll (lines ~175-233) — up to 8 chained .filter + per-product toLowerCase, then sort
// getById — loadCatalog() + clone + find for ONE product
// historyRoutes.ts revert — full catalog load for a single-product lookup
// historyRoutes.ts GET /history — builds/sorts/returns rows (20/product cap) with full before/after blobs, no pagination
// productRoutes.ts:61 — scope=all resolves via getAll(1, Number.MAX_SAFE_INTEGER)
// importRoutes.ts — /export whole catalog; /export.csv materializes all rows
// media.ts:93-97 — GET /media full ~4000-item inventory (client.ts:474-502 assumes whole array)
```

```ts
// mediaRepository.ts:89-94 — stamp walk + productsKey BEFORE the cache check at :92; miss walks ~4000 files with per-file statSync
getInventory(products) {
  const productsKey = this.computeProductsKey(products);  // 2× map/sort/join over all products
  const stamp = this.getStamp();                          // ~300-dir walk
  if (stamp && this.cached && ...) return cached;
```

Hard constraint (plan 105 + plan 171): never return shared mutable
references — serve frozen views or per-item copies at the boundary. Tests:
contract/integration suites with temp repos; parity tests pin API shapes
(plan 165 rescope) — pagination changes need client + test updates together.

## Commands you will need

| Purpose   | Command                   | Provenance | Expected on success |
| --------- | ------------------------- | ---------- | ------------------- |
| Install   | `npm ci`                  | declared   | exit 0              |
| Typecheck | `npm run admin:typecheck` | declared   | exit 0              |
| Tests     | `npm run admin:test`      | declared   | all pass            |

## Scope

**In scope**: the files above; new pagination params (additive, default
preserves current behavior during migration); client updates for paginated
surfaces.

**Out of scope**: sync retry/ordering semantics redesign (keep the
single-consumer lock); true cursor pagination infrastructure (limit/offset
or keyset per surface, minimal); removing `structuredClone` isolation
(plan 171 owns the guarantee — this plan optimizes _around_ it).

## Git workflow

- Branch: `advisor/188-admin-request-costs`
- One commit per slice (sync → reads → payloads → media); e.g.
  `perf(admin): hash-once sync dedup; index catalog merges (plan 188)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline

Requires plans 170 + 171 DONE. Green baseline. Record rough timings for:
`/media` cold + warm, `/history`, `scope=all` bulk preview, full-catalog
export (use the bench script pattern `bench-catalog-snapshot.mjs` if it
fits, else `time curl` against a local dev server — document method).

**Verify**: green; numbers recorded; otherwise STOP.

### Step 1: Sync queue — hash dedup, id index, bounded push concurrency

- Enqueue: compute the signature hash ONCE per call (not per entry).
- Merge: build a one-shot `Map<id, product>` per pull batch instead of
  `.find` per change.
- Pull: single `loadCatalog` per `pullOnce` (reuse for cursor + batch;
  re-read only if a write happened mid-pull — document).
- Push: bounded concurrency for independent entries (keep the
  single-consumer lock; document why ordering is preserved — e.g. per-product
  serialization or conflict-free field sets; if ordering cannot be proven,
  keep serial push and record that verdict instead of forcing it).

**Verify**: typecheck + sync/integration tests green.

### Step 2: Cheaper reads — indexed getById, fused filters, no clone for lookups

- `getById`: add an id→product index lookup that copies only the found item
  (no full clone). Revert path in `historyRoutes` uses it.
- `getAll`: fuse the stacked `.filter` passes into a single pass;
  lowercase query/category once outside the loop. Keep sort + pagination
  semantics identical.
- DO NOT return shared references (plan 105/171) — frozen views only if
  provably safe; otherwise per-item copies at the boundary.

**Verify**: typecheck + tests green; list/detail timings recorded.

### Step 3: Paginate history/media/bulk-preview; stream export/CSV

- Add `limit`/`page` (or cursor) to `GET /history` and `GET /media` with
  defaults that preserve current client behavior; update
  `web/api/client.ts` + affected views to page through.
- `scope=all` bulk: resolve ids in pages (or a lightweight id-list query —
  prefer paging through existing `getAll`).
- Stream `/export.csv` (and `/export` if trivially streamable) instead of
  materializing the full body — Fastify reply streaming with the same
  content-type/disposition.

**Verify**: typecheck + tests green; megabyte-click payloads gone (record
sizes).

### Step 4: Media inventory — key on catalog rev, precompute off-request

- Cache `stamp` + `productsKey` keyed on catalog rev (recompute only when
  rev changes), or precompute inventory on catalog write and serve
  stale-while-revalidate on GET. Do NOT weaken the mtime fallback for
  external (out-of-admin) asset edits — document the invalidation rule.

**Verify**: warm `/media` no longer walks; tests green.

## Test plan

- Existing sync/contract/integration/parity tests pin semantics — all must
  stay green; extend with: paginated history/media round-trips, streamed
  CSV byte-equality vs old output, id-index `getById` equivalence, enqueue
  dedup equivalence.
- Verification: full `npm run admin:test` green + before/after timings in
  commits.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:typecheck` exits 0; `npm run admin:test` exits 0.
- [ ] No endpoint in Step 3 materializes unbounded arrays by default
      (assert via test with a large fixture or code review + recorded sizes).
- [ ] Warm `/media` performs no directory walk (assert via test spy or
      recorded timing receiving the documented improvement).
- [ ] Isolation intact: plan 171's `catalog-isolation.test.ts` still passes
      unmodified.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Push concurrency cannot preserve ordering (keep serial; record verdict).
- Pagination breaks a parity/contract test that pins the full-array shape
  (report; the contract may need an owner decision — do not silently version
  the API).
- Frozen/shared views risk the plan-105 leak (fall back to per-item copies).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- New list endpoints MUST be paginated from day one — add that rule to the
  route-authoring notes where `requireWriteMode` (plan 094) is documented.
- Reviewer: verify every pagination default preserves old behavior for
  existing clients, and that streamed CSV bytes equal the old body exactly.
- **Deferred:** true cursor infrastructure; sync push concurrency if Step 1
  verdict is "keep serial."
