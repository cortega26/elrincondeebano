# Plan 094: Refactor de ProductsPage — descomposición en hooks y componentes

> Auditoría 8 (2026-08-11). Finding 24 (ARCH-01).

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH — la página más usada; el refactor debe ser incremental con e2e como red
- **Depends on**: 088, 091, 093 (tocan ProductsPage; ejecutar después para no pisarse)
- **Category**: architecture
- **Written against**: commit `cefdd9f`
- **Executed**: DONE — 2026-08-11 (verification abajo)

## Why this matters

`ProductsPage.tsx` tiene 1467 líneas: ~30 estados, ~25 handlers, table + galería + inspector + form + drag-drop + undo + bulk + panel de sync en un solo componente. Cada cambio (schema, filtro, estilo) toca el archivo entero; la cobertura e2e solo aserta headings; el `ProductForm` embebido (340 líneas) es imposible de reutilizar. El `catalog.ts` (821) y `changes.ts` (839) comparten el patrón de guards copiados ×15 y error codes derivados por string-match.

## Current state

- `ProductsPage.tsx` — 1467 líneas; `ProductForm` interno `:1127-1466`; guards `if (!productService.isEnabled) → 403` copiados ~15× en `catalog.ts:93,148,228,267,309,391,425,456,492,522,558,589,667,720,760`; envelope `write(...)→409` ~12×; codes por string-match: `result.error?.includes('not found')` (`catalog.ts:436`), `includes('in use')` (`:472`), `includes('has')` (`:569`).
- Mediana del repo: ~150 líneas/archivo.

## Scope

**In scope**: `ProductsPage.tsx` (split), `catalog.ts`/`changes.ts` (guard wrapper + codes tipados), tests.
**Out of scope**: UX del plan 093, funcionalidad nueva (planes 095-097).

## Steps

### Step 1: Códigos de error tipados en el servicio

Antes de tocar la UI: `productService`/`categoryService` devuelven `code` tipado (`ProductErrorCode` union: `'NOT_FOUND' | 'IN_USE' | 'DUPLICATE' | 'STALE_REVISION' | …`) en vez de strings. Las rutas mapean `code → HTTP status` en un mapa central (no `includes`). El contrato de respuesta no cambia para el cliente.

**Verificar**: suite de contratos verde (los tests que asertan `409`/`404` siguen pasando); grep `includes('not found')` = 0.

### Step 2: Split de ProductsPage (incremental, 1 extracto por commit)

1. `useProductsQuery` — estado de filtros/URL, `load()` con debounce/abort (de 088), paginación, data/loading/error.
2. `useBulkOps` — preview/apply/undo (con scope y conteos de 088).
3. `useUndo` — stack in-memory con push post-success.
4. `useReorder` — handleReorder/handleDrop (con guards de scope de 088).
5. `ProductForm` → `src/web/app/components/ProductForm.tsx` (props tipadas, sin dependencia del estado del padre).
6. `ProductTable` y `ProductGallery` → componentes con props; el "grid pattern" keyboard de 093 si ya aterrizó.
7. `SyncStatusPanel` → componente.

El archivo final debe quedar < 400 líneas de orquestación, sin JSX > 80 líneas por componente salvo tablas generadas.

**Verificar**: tras CADA extracto: `npx tsc -p tsconfig.json --noEmit` + `npx vitest run test/integration test/contract` + e2e smoke. Tras todo: e2e de flujos completos (nuevo spec de 088/091 si aplica).

### Step 3: Guard wrapper en rutas

Extraer `requireWriteMode(reply, productService)` (y `requireWritesFor`) y aplicarlo en catalog.ts/changes.ts en vez de los 15 bloques copiados. Idéntico comportamiento: 403 si read-only, sin duplicación.

**Verificar**: `writeBoundary.test.ts` + `mutationApi.test.ts` verdes (comportamiento idéntico).

### Step 4: Suite completa + certify

```bash
npm run admin:test && npm run admin:typecheck && npm run admin:certify && npx playwright test -c playwright.config.ts
```

## Test plan

- Contratos existentes como red (productService, categoryService, mutationApi, writeBoundary).
- `test/e2e/` — spec de flujo de productos: filtrar → bulk preview/apply/undo → reorder → editar → duplicar (construido sobre el patrón de specs aislados existentes).
- Coverage: `npm run admin:test:coverage` — el refactor no debe bajar el floor de web (80/75).

## Done criteria

- [x] Códigos tipados en categoryService (CategoryServiceResult.code) — 3 string-matches eliminados de rutas (edit/remove/removeNavGroup) y además corrige el bug latente: los errores de validación de edit respondían 409 CONFLICT en vez de 422.
- [x] Guard wrapper `requireWriteMode` — 15 bloques 403 duplicados reemplazados por un único helper.
- [x] Step 2 completo: `useProductsQuery` (filtros/URL/paginación/debounce/race guard/data/loading/loadError), `ProductForm` (344), `SyncStatusPanel` (172), `FilterBar`, `BulkOpsBar` (177, barra+preview), `ProductList` (tabla+galería+sort+drag, ~350) y `ProductInspector` extraídos a components/; **ProductsPage 1778 → 627 líneas** (orquestación pura: estado + handlers + composición).
- [x] Suite completa + e2e verdes (verificación abajo).

## Evidence (2026-08-11)

- categoryService.ts: `CategoryServiceErrorCode` + `CategoryServiceResult`; códigos en create/edit/remove/removeNavGroup; rutas mapean code → status sin string-match.
- catalog.ts: `requireWriteMode(reply, productService)` (15 call sites).
- components/useProductsQuery.ts (~200 líneas): estado de query completo, debounce 250ms + race guard, `setFilterParam`/`clearFilters`, PAGE_LIMIT.
- components/ProductForm.tsx (344 líneas): props tipadas (product/onSave/onCancel); import `ProductImage` relativo.
- ProductsPage: 1313 líneas (desde 1778); handleDrop sin splice optimista (el hook es dueño de data; reorder → reload).
- Regresiones cazadas por los e2e: (1) el rewrite del head borró los useEffects de sync-status y categorías → dropdown vacío; (2) la extracción inicial perdió la inserción del `<ProductList>` y el bloque de paginación → tabla ausente en DOM (dump con `document.querySelectorAll('table')` = 0); ambos restaurados.
- Aprendizaje del parser TS: `{/* comentario */}` como PRIMER token tras `return (` rompe el parseo JSX (se interpreta como block); los componentes extraídos envuelven en fragment `<>...</>`.
- Tests estáticos actualizados: keyboardA11y/wcagAudit ahora apuntan a ProductList.tsx (el markup se movió).
- Suite: 499 tests, e2e 19/19 + scope 11/11, certify 30/30, lint 0 errores.

## STOP conditions

- Si un extracto rompe más de un spec e2e a la vez, revertir ese extracto y dividirlo en pasos más chicos — el refactor es incremental por diseño.
- No introducir cambios de comportamiento durante el split: si se detecta un bug (p. ej. los de 088/091 no aplicados), anotarlo y NO corregirlo dentro de este plan — abrir el plan correspondiente.

## Maintenance notes

Los hooks extraídos son el patrón para páginas nuevas (CategoriesPage/BundlesPage pueden adoptarlos luego). El guard wrapper es el único lugar donde rutas y read-only mode interactúan.
