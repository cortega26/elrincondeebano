# 115 — Unify admin data fetching through ContentManagerClient

- **Source**: Auditoría 9, TDA-02
- **Status**: TODO · **Priority**: P2 · **Effort**: M
- **Stamped against**: `b3805e1`

## Problem

`admin/content-manager/src/web/` uses three parallel fetch mechanisms:

1. `ContentManagerClient` (`src/web/api/client.ts`) — used by ProductsPage,
   CategoriesPage.
2. `fetchWithCredential` (`src/web/app/components/credentialStore.ts:24-38`)
   — used by BundlesPage:84, ImportPage:72, MediaPage:134.
3. Raw `fetch` — BundlesPage:55-58, ProductsPage:81, FilterBar:156,
   MediaPage:83.

The credential-header injection is duplicated verbatim (`client.ts:155-162`
and `credentialStore.ts:27-36`). Nine client methods have **zero callers**:
`bootstrap` (183), `reorderCategories` (267), `reorderSubcategories` (336),
`updateBundles` (347), `getMedia` (354), `getBundles` (375), `getFeatured`
(379), `importPreview` (453), `importApply` (460). BundlesPage re-implements
those exact endpoints with raw fetch plus locally re-declared
`Bundle`/`FeaturedData`/`ProductRef` types (BundlesPage.tsx:6-20)
duplicating `BundlesResponse`/`FeaturedResponse` (client.ts:64-74).

Impact: a change to auth or endpoint shape must be made in 3 places; the
typed client is half-orphaned, so the type safety it exists for is bypassed
on bundles/media/import screens.

## Scope

**In**: `src/web/app/routes/BundlesPage.tsx`, `ImportPage.tsx`,
`MediaPage.tsx`, `FilterBar.tsx` (only if its fetch is a client-able read),
`src/web/api/client.ts` (add missing methods / delete the 9 dead ones),
`credentialStore.ts` (drop the duplicated header logic if the client covers
it).

**Out**: server routes, tests that assert endpoint behavior.

## Steps

1. Inventory: for each raw/`fetchWithCredential` call in the four files,
   find the matching client method (or the endpoint it must become). If a
   needed method is missing (e.g. MediaPage's workbench endpoints), add it
   to the client following the existing pattern (`client.ts` methods use the
   same base URL + credential header).
2. Port BundlesPage to the client: replace the local `Bundle`/
   `FeaturedData` types with the client's exported types; delete
   `updateBundles`/`getBundles`/`getFeatured` from "dead" once used (keep
   them if BundlesPage now calls them).
3. Port MediaPage + ImportPage the same way; then delete every client method
   with zero callers (grep `client.<method>(` across `src/web/`).
4. Collapse `credentialStore.ts`'s duplicated header injection if all
   remaining usages go through the client; keep the module only if other
   callers remain.
5. No endpoint or payload change — behavior must be byte-identical (the
   client uses the same URLs/headers).

## Tests

- Admin e2e configs are the safety net: `playwright.config.ts` (operator),
  `.scope`, `.storefront`, `.media`, `.import`, `.changes` — run all six
  locally; CI (`admin.yml`) must stay green.
- `npm run admin:test` + `npm run admin:typecheck` green.
- Grep gate: `grep -rn "fetchWithCredential\|fetch(" src/web/app/` — zero
  hits outside `client.ts` (or an explicit documented exception).

## Done criteria

- [ ] All web data access goes through `ContentManagerClient`.
- [ ] Zero dead client methods (grep each former name — no callers).
- [ ] All six admin e2e configs green; CI green.

## Maintenance

The client is the single data-access seam: new endpoints get a method there,
never a raw fetch. This removes the third copy of the credential logic.

## Rollback

`git revert <sha>`.
