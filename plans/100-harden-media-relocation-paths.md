# 100 — Harden media relocation against path traversal via `category`

- **Source**: Auditoría 9, B3 (SEC-01)
- **Status**: TODO · **Priority**: P1 · **Effort**: S
- **Stamped against**: `ccb921f`

## Problem

`admin/content-manager/src/server/services/mediaRelocation.ts` builds the
rename target from the product's `category` field with no containment check:

```ts
// mediaRelocation.ts:36-41
const toRelative = `assets/images/${opts.newCategory}/${fileName}`;
const to = resolve(repoRoot, toRelative);
if (to === from) return relativePath;
if (existsSync(to)) return relativePath;
mkdirSync(dirname(to), { recursive: true });
renameSync(from, to);
```

The only guard is on the file part (`fileName.includes('..')`), and the
category write schema accepts anything ≤ 50 chars:

```ts
// shared/schemas/product.ts:22
category: z.string().max(50).default(''),
```

`category: "../../../../../../tmp/x"` passes validation, and once a product's
image path is set under the old category, the rename moves a real file
(source existence is verified at `mediaRelocation.ts:34-35`) to an arbitrary
writable path outside the repo. Note the source must exist under
`assets/images/<oldCategory>/`, so this is a constrained write primitive —
but still "edit the catalog" escalating to "write the filesystem".

## Scope

**In**: `shared/schemas/product.ts` (and `category.ts` if it has a similar
free-form name field — check), `mediaRelocation.ts`, and the mutation API
tests.

**Out**: image filename validation (already guarded), the storefront.

## Steps

1. In `productSchema` (and the category schema used by category create/update
   if it is equally permissive), restrict `category` to a safe character
   class. Real catalog values include spaces, accents and `&` — verify
   against `data/product_data.json` first (list distinct categories) and
   allow: `^[A-Za-z0-9À-ÿ ._'-&()]+$` (extend only if the data demands it).
2. In `mediaRelocation.ts`, before `mkdirSync`, assert containment:
   ```ts
   const assetsRoot = resolve(repoRoot, 'assets/images');
   if (!to.startsWith(assetsRoot + sep)) return relativePath;
   ```
   (mirror the containment pattern already used elsewhere in the codebase —
   grep for `isContainedWithin`/`startsWith` in `server/`.)
3. Add a regression test: PATCH a product whose category contains
   `../outside` → expect 400 from the schema (and, at the service level, the
   relocation must refuse and leave the file untouched).
4. Pre-flight check before tightening: run
   `node -e "const d=require('./data/product_data.json'); console.log([...new Set(d.products.map(p=>p.category))].join('\n'))"`
   and confirm every value matches the new regex; adjust the class if a
   legitimate value (e.g. `Cafés & Tés`) needs more characters.

## Tests

- `test/integration/mutationApi.test.ts` (the existing media-relocation test
  at ~line 397 is the pattern): add a case asserting category with `../`
  yields 400; add a service-level test that a traversal attempt leaves the
  file in place.
- `test/integration/categoryMutationApi.test.ts`: category names with the
  same class enforcement if the category schema is also tightened.
- Run: `npm run admin:test` + `npm run admin:lint` (pre-commit) green.

## Done criteria

- [ ] `category` schema rejects `../` and path separators (400 on PATCH/PUT).
- [ ] `mediaRelocation` never renames outside `assets/images/` (unit test).
- [ ] All current catalog category values still validate (script output shows 0 rejected).

## Maintenance

The credential gate (`app.ts:229-241`) is the only auth on mutations; input
validation is the second line of defense for a local-first tool that writes
to the repo. Any new field used in filesystem paths needs the same class +
containment treatment.

## Rollback

`git revert <sha>`; tightening the schema may reject pastes of exotic
category names — check `data/product_data.json` first as noted in step 4.
