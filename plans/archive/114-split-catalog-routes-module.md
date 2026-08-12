# 114 — Split the catalog.ts god route module

- **Source**: Auditoría 9, TDA-03
- **Status**: TODO · **Priority**: P2 · **Effort**: M
- **Stamped against**: `b3805e1`

## Problem

`admin/content-manager/src/server/routes/catalog.ts` is a 1028-line god
module holding two ~500-line route factories:

- `productRoutes` spans lines 33–516 (~484 lines, 10+ endpoints),
- `categoryRoutes` spans lines 517–1028 (~511 lines, 10+ endpoints).

Both repeat the same shape (write-mode guard, base-revision read,
error-object replies) with local helper closures (`parseBulkFilters`
57–91, `readBaseRevision` 529–532). It is ~4× the repo's route-file median
and everything route-related touches it.

## Scope

**In**: `admin/content-manager/src/server/routes/` (split + a new
`routes/helpers.ts`), `src/server/app.ts` (imports at :5/:140/:147).

**Out**: any behavior, endpoint paths, schemas, tests.

## Steps

1. Create `routes/helpers.ts` and move the shared pieces: the exported
   `requireWriteMode` (catalog.ts:17 — already exported), `parseBulkFilters`
   if used by both factories (check callers first), the reply-error helper
   pattern (extract one function if the duplication is literal).
2. Create `routes/productRoutes.ts` with lines 33–516 content and
   `routes/categoryRoutes.ts` with lines 517–1028; adjust imports to use
   `helpers.ts`.
3. Update `app.ts` imports; keep the exported factory names and signatures
   identical (`productRoutes(fastify, ...)`, `categoryRoutes(fastify, ...)`).
4. Mechanical move only: `git diff` of the split files vs the original must
   show only import-line changes (use `git diff --stat` + spot-check, or
   `diff` the extracted bodies after stripping headers).

## Tests

- Full admin suite is the safety net: `npm run admin:test` (vitest: 506
  tests incl. route-level `app.inject` integration) green.
- `npm run admin:typecheck` and `npm run lint` green.
- Spot: the mutation/category integration tests still exercise the same
  routes through `createApp` (no test file changes expected).

## Done criteria

- [ ] `catalog.ts` no longer exists; both new files are ≤ 520 lines.
- [ ] Zero test changes; full admin suite green.
- [ ] `npm run admin:typecheck` green.

## Maintenance

Route families can now drift separately; keep `helpers.ts` as the only home
for shared route plumbing so the split doesn't breed a new duplication.

## Rollback

`git revert <sha>` (pure file move — revert restores the monolith exactly).
