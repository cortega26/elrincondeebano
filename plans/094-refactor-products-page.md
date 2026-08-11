# Plan 094: Refactor de ProductsPage — descomposición en hooks y componentes

> Auditoría 8 (2026-08-11). Finding 24 (ARCH-01).

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH — la página más usada; el refactor debe ser incremental con e2e como red
- **Depends on**: 088, 091, 093 (tocan ProductsPage; ejecutar después para no pisarse)
- **Category**: architecture
- **Written against**: commit `cefdd9f`

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

- [ ] ProductsPage < 400 líneas; ProductForm y componentes extraídos con props tipadas.
- [ ] Códigos tipados en servicios; 0 string-matches en rutas; guard wrapper único.
- [ ] Suite completa + coverage floor verdes.

## STOP conditions

- Si un extracto rompe más de un spec e2e a la vez, revertir ese extracto y dividirlo en pasos más chicos — el refactor es incremental por diseño.
- No introducir cambios de comportamiento durante el split: si se detecta un bug (p. ej. los de 088/091 no aplicados), anotarlo y NO corregirlo dentro de este plan — abrir el plan correspondiente.

## Maintenance notes

Los hooks extraídos son el patrón para páginas nuevas (CategoriesPage/BundlesPage pueden adoptarlos luego). El guard wrapper es el único lugar donde rutas y read-only mode interactúan.
