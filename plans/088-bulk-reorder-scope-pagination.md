# Plan 088: Scope real de bulk/reorder + paginación visible

> Auditoría 8 (2026-08-11). Findings 5, 7, 9, 11. Blocker del retiro de Python.

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED — cambia el flujo de bulk/reorder; e2e smoke es la red de seguridad
- **Depends on**: —
- **Category**: data integrity / UX
- **Written against**: commit `cefdd9f`
- **Executed**: DONE — 2026-08-11 (verification abajo)

## Why this matters

El catálogo tiene 184 productos y el servidor devuelve 50 por página sin
paginación UI: el 73 % es inalcanzable sin búsqueda exacta. Peor: bulk y
reorder operan silenciosamente solo sobre la página visible — reorder compacta
los `order` visibles a 0..N (saltando al tope del catálogo y colisionando con
los órdenes de los otros 134), el drag-drop bajo sort no-default mueve la fila
equivocada, el bulk dice "N modificados" aunque skipeó productos, y el undo se
pushea antes de que el apply tenga éxito.

## Current state

- `src/web/api/client.ts:175-198` — `getProducts` sin `page`/`limit` en el caller; servidor default `limit=50` (`src/server/routes/catalog.ts:28`, `productRepository.ts:161-170`).
- `src/web/app/routes/ProductsPage.tsx:64-82` — `load()` no envía página; sin UI de paginación (grep `page=` en `src/web`: 0).
- `ProductsPage.tsx:246-302` — bulk usa `data.items` (la página); `:317-339` undo; `:286-301` push del undo ANTES del await.
- `ProductsPage.tsx:304-315, 341-372` — reorder/drag-drop envían solo los ids visibles a `POST /products/reorder`.
- `src/domain/products/productService.ts:320-352` — `order = orderedIds.indexOf(id)` solo para los ids listados; el resto conserva su order.
- `productService.ts:469-523` — skips (`continue`) por `val > price`, `newPrice <= 0`, categoría vacía, pero responde `changed: products.length` (`:523`).
- `ProductsPage.tsx:355-357` — `handleDrop` splices por índice de `sortedItems` (sort client-side) en `data.items` raw.

## Scope

**In scope**: `ProductsPage.tsx`, `client.ts`, `productService.ts` (respuesta con conteos reales), `catalog.ts` (si hace falta exponer total para paginación — ya devuelve `total`), tests.
**Out of scope**: selección multi-fila (plan 097), reorder global drag-drop (requiere design), undo persistente.

## Steps

### Step 1: Paginación visible

- Estado `page` en `ProductsPage` (URL param `page`, default 1), `limit` fijo 50.
- Controles Prev/Next + "Mostrando X–Y de N" bajo el h1 (N = `total` que ya devuelve la API).
- `load()` envía `page`; al cambiar filtros, reset a página 1.
- Search debounced (250 ms) y guard de respuestas fuera de orden (request id monotónico o AbortController) — el race del finding 10 se arregla aquí.

**Verificar**: con el catálogo real (184) la página 4 muestra productos 151-184; cambiar un filtro vuelve a la página 1; typing rápido no muestra resultados stale (test e2e).

### Step 2: Bulk con scope honesto

- Si `total > items.length` (o hay filtros activos), bulk y reorder piden confirmación explícita: "Aplicar a los N productos visibles de esta página" vs "a todos los que coinciden (M)". Implementar "todos los que coinciden" vía un parámetro `scope=all` que el servidor aplica sobre el set filtrado completo (el repositorio ya filtra; `productService` recibe el catálogo completo — revisar que el bulk pueda recibir el set filtrado sin paginar).
- `changed` real: contar los mutados, no `products.length`; respuesta `{ changed, skipped }`.
- Undo: pushear la entrada SOLO después de `await client.bulkApply(...)` exitoso.

**Verificar**: e2e — bulk sobre página 2 confirma scope; con un producto inválido en el set (descuento > precio), `changed` < total y la UI lo muestra; fallo de apply no deja undo activo.

### Step 3: Reorder seguro

- Rechazar reorder cuando `total > items.length` o hay filtros activos: 409 `REORDER_SCOPE_AMBIGUOUS` en el servidor (productService valida `orderedIds.length === catalog.products.length` o acepta un flag `scope: 'full'`) y deshabilitar/avisar en la UI.
- `handleDrop`: operar sobre el array que SE muestra (usar el índice del item en `data.items`, no el de `sortedItems`); si hay sort activo, deshabilitar drag-drop con hint "Ordenar desactiva arrastrar" o reordenar en el array ordenado y mapear por identidad.
- Reorder por identidad: enviar `ids` completos de la página y hacer que el servicio interpole entre los `order` vecinos si el scope es parcial — si el servidor rechaza scope parcial (recomendado), la UI solo permite reorder sin filtros y sin paginación (página con `limit` grande, p. ej. 1000, cuando no hay filtros).

**Verificar**: e2e — reorder con filtro → bloqueado con mensaje; reorder sin filtros sobre catálogo completo → orden correcto en API; drag-drop bajo sort → bloqueado o fila correcta.

### Step 4: Suite

```bash
npm run admin:test && npm run admin:certify
```

## Test plan

- `test/integration/reorderBulkApi.test.ts`: reorder parcial → 409; reorder completo → ok; bulk con scope=all sobre set filtrado; conteos `changed/skipped`.
- `test/e2e/` (nuevo spec `scope.spec.ts` con playwright config propio, patrón de `playwright.import.config.ts` con temp repo): paginación, confirm de scope, undo post-fallo, reorder bloqueado con filtro.

## Done criteria

- [x] Paginación funcional y visible ("X–Y de N"); filtros resetean a página 1.
- [x] Bulk muestra scope real y confirma antes de aplicar; `changed` cuenta real; undo solo tras éxito.
- [x] Reorder parcial rechazado (409 REORDER_SCOPE_AMBIGUOUS); drag-drop y botón deshabilitados con filtros/paginación/sort.
- [x] Suite completa verde.

## Evidence (2026-08-11)

- UI (ProductsPage): paginación URL `page` con Prev/Next + "Mostrando X–Y de N" + Primera página; debounce 250ms + request-id (race guard); setFilterParam resetea página; ámbito de bulk explícito (Página / Todos los que coinciden) con confirm de scope (total > visible); undo pusheado SOLO tras apply OK (scope=all usa los old_values del server); reorder deshabilitado con filtros activos/paginación/sort no-por-defecto (canReorder); drag-drop guardado.
- Servidor: reorder parcial → 409 `REORDER_SCOPE_AMBIGUOUS` (duplicados → 400); bulk con `scope: all` + `filters` (resolver sobre getAll sin cap); `changed` cuenta mutados reales (no products.length); 422 `NO_MATCHES` si el filtro no casa.
- Cliente: bulkPreview/bulkApply aceptan scope/filters.
- Tests: +4 API (reorder parcial/dupes/full, scope=all+filtros, fail-closed discount>price sin escritura parcial, NO_MATCHES) + e2e aislado nuevo (fixture 80 productos, `playwright.scope.config.ts` :3102, 5 casos: paginación, reset de filtro, bulk accept-all, bulk cancel-page, reorder disabled) + CI admin.yml.
- Bugs reales encontrados durante el e2e: bulkValue stale al cambiar de acción (set_stock con '10' → false silencioso) — reset al cambiar acción; canReorder sin check de filtros activos (filtro con matches ≤ página habilitaba reorder → 409 en server).
- Suite: 481 tests, e2e scope 5/5 + smoke 19/19, certify 30/30, lint 0 errores.

## STOP conditions

- Si "todos los que coinciden" (scope=all) resulta en otro set de cambios de contrato en `productService` (el método bulk hoy recibe `products` ya filtrados desde la ruta), NO duplicar la lógica de filtrado en el servicio: reusar el filtro del repositorio/ruta y reportar.

## Maintenance notes

El `total` de la API ya es correcto (cuenta sobre el catálogo completo); la paginación no debe cambiar el contrato de filtros. El reorder queda intencionalmente restringido a catálogo completo hasta que exista un design de reorder intersticial.
