# 148 — Cache the media inventory (mtime-keyed)

- **Source**: Auditoría 10, PERF-05 · **Status**: TODO · **Priority**: P2 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/server/repositories/mediaRepository.ts admin/content-manager/src/server/routes/media.ts`

## Problem

Every `GET /media` re-walks the entire assets tree — currently 4,014 files under `assets/images/` — with a `statSync` per file and no caching.

`admin/content-manager/src/server/repositories/mediaRepository.ts:47-93`:

```ts
this.walkDir(this.assetsPath, (relPath) => {
  diskPaths.add(relPath);
  const absPath = resolve(this.assetsPath, relPath);
  let size = 0;
  try { size = statSync(absPath).size; } catch { /* ignore */ }
  ...
  items.push({ path: relPath, name: relPath.split('/').pop() ?? relPath, size, ext, ... });
});
```

…plus four extra `.filter()` passes for the summary (`:86-93`). The route (`media.ts:60-64`) calls it per request with zero HTTP or in-memory caching. The repo already has the exact pattern to copy: `ProductRepository.loadCatalog` caches keyed on file mtime/size (`productRepository.ts:51-60`, plan 092).

## Scope

**In**: `admin/content-manager/src/server/repositories/mediaRepository.ts` (cache + single-pass summary), tests `test/contract/media.test.ts` and/or `test/integration/mediaWorkbench.test.ts` (existing media suites are the pattern).

**Out**: The route layer, the inventory response shape, the mutation flows (they must invalidate the cache).

## Steps

1. Add an mtime-keyed cache to `MediaRepository.getInventory`: cache the computed `items` + `summary` alongside the assets-tree mtime + size (compute the tree stamp in the same walk or via the root dir mtime — use a cheap deterministic stamp: root dir mtime + size of the top-level listing, matching the ProductRepository pattern). On unchanged stamp, return the cached arrays.
2. Compute the summary in ONE pass over `items` (a single loop incrementing counters) instead of four `.filter()`s.
3. Invalidate: the mutations that change the tree (media intent apply/rollback, uploads staging → canonical) must clear the cache. Find where `getInventory`-relevant writes happen in `media.ts` and add `invalidate()` calls at those points; if a write path goes through a repository method, put the invalidation inside the repository (preferred).

## Tests

- `media.test.ts` pattern: (a) two consecutive `getInventory` calls with no tree change return the cached result (assert same array identity `toBe`); (b) after a mutation that adds a file, the next call reflects it (cache invalidated); (c) summary counts still correct after the single-pass rewrite.
- Run: `npm run admin:test` green; `npm run admin:typecheck`; `npm run lint` green.

## Done criteria

- [ ] Unchanged tree → cached inventory (asserted identity).
- [ ] Post-mutation → fresh inventory (asserted).
- [ ] Summary correct in single pass (asserted).
- [ ] `npm run admin:test` green.

## Maintenance

The cache must be invalidated on every canonical write path; when a new media mutation route lands, invalidate there too. A reviewer should grep `getInventory(` call sites and confirm none bypass the cache intentionally (e.g. a "force refresh" UI — if one exists, add a `force` parameter instead of skipping the cache).

## Rollback

`git revert <sha>`.

## STOP conditions

- If the walk needs to detect changes inside nested dirs and a root-dir stamp proves unreliable in tests, stop and report — use a recursive stamp (walk + collect dir mtimes) instead of guessing.
