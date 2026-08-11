# Plan 083 — Todo

Spec: `plans/083-characterize-category-mutation-boundary.md`. Notas de drift
(2026-08-11): 080 ya aterrizó (revisión guard en rutas, `categoryConcurrency.test.ts`
cubre GET/PATCH/reorder/subcategories/stale-409); `ensureDiscountToggle` NO es un
export del módulo (clausura de `createCatalogManager`) — se testea vía
`bindFilterEvents` (superficie pública), sin tocar `src/`.

- [x] Drift check + re-leer rutas/servicio actuales (080 landed)
- [x] Confirmar gaps reales: sin contract tests (0 %), sin route tests de
      create/edit/delete-in-use/nav-groups, sin 401 de categorías, copy-test
- [ ] Step 1: `test/contract/categoryService.test.ts` (create/edit/remove/reorder/nav-groups)
- [ ] Step 2: `test/integration/categoryMutationApi.test.ts` (rutas + 401 + delete-in-use)
- [ ] Step 3: `test/ensureDiscountToggle.test.js` → testea el módulo real vía `bindFilterEvents`
- [ ] Verificar: vitest del workspace (foco + suite), `npm run admin:typecheck`
- [ ] Verificar: `npm test` root exit 0; coverage `domain/categories` > 0
- [ ] Commit por archivo (rama `advisor/083-*`)
- [ ] `plans/README.md`: fila 083 → DONE + `git mv` a `archive/`
