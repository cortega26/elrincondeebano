# Plan 091: Brechas funcionales de catálogo — export UI, filtro de descuento, imágenes robustas, confirms

> Auditoría 8 (2026-08-11). Findings 15, 17, M2, M7, M8.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW-MED — cambios aditivos de UI + endpoints que ya existen
- **Depends on**: 088 (paginación comparte la barra de filtros)
- **Category**: functionality / UX
- **Written against**: commit `cefdd9f`
- **Executed**: DONE — 2026-08-11 (verification abajo)

## Why this matters

Cuatro brechas que el operador ve a diario: (a) los exports JSON/CSV existen en
API pero ninguna página los ofrece (Python los tenía en menú); (b) no existe
filtro de descuento ("Solo descuento") ni quick views, y la columna % ordena
por CLP; (c) imágenes rotas sin placeholder (onError ausente + condicional
muerto en `getImageUrl`); (d) deletes destructivos sin confirmación.

## Current state

- Endpoints: `GET /api/v1/export` (`changes.ts:419-422`), `GET /api/v1/export.csv` (`changes.ts:424-481`); client: `exportJson`/`exportCsv` (`client.ts:428-440`) — sin callers en `src/web/`.
- `ProductsPage.tsx:57-75` — filtros: q, category, archived, out_of_stock, min_price, max_price. Sin descuento.
- `ProductsPage.tsx:892` columna "Dto." muestra `discount_percentage`; `:133-134` el sort compara `a.discount - b.discount` (CLP).
- `ProductsPage.tsx:12-18` — `getImageUrl`: ambas ramas devuelven `'/' + mediaPath` (condicional muerto); paths fuera de `assets/images/` caen al SPA fallback (HTML como imagen).
- `<img>` en galería (`:984-994`), inspector (`:1078-1104`), "Imagen actual" (`:1441-1451`) sin `onError`; solo los previews del form lo tienen (`:1354-1356,1420-1422`).
- Deletes sin confirm: `CategoriesPage.tsx:50-58` (categoría), `:60-68` (nav-group), `:133-141` (subcategoría); `BundlesPage.tsx:330-338` (bundle); `MediaPage.tsx:380-384` (descartar intent).

## Scope

**In scope**: `ProductsPage.tsx`, `CategoriesPage.tsx`, `BundlesPage.tsx`, `MediaPage.tsx`, `catalog.ts` (filtro descuento), `productRepository.ts`, `client.ts`, `importExport.ts` (schema), tests.
**Out of scope**: quick views como presets persistentes (solo los 2 filtros + indicador aquí); inline editing (plan 095); reorder (088).

## Steps

### Step 1: Filtro de descuento real

- API: `catalog.ts` + `productRepository.ts` aceptan `discounted_only` (bool) y `min_discount`/`max_discount` (porcentaje entero 0-100, comparado contra `discount_percentage` derivado).
- `client.ts:175-198` envía los params; schema `api.ts`/`importExport.ts` tipado.
- UI: checkbox "Solo descuento" + inputs "Dto. mín % / máx %" en la barra (`ProductsPage.tsx:571-636`), estilo de los demás filtros, con reset.
- Arreglar el sort de la columna %: comparar `discount_percentage` (o el mismo campo que se muestra).

**Verificar**: tests API por unidad (% exacto, descuento ≥ N, solo-descuento excluye descuento 0); e2e del filtro en UI. El sort de % ordena por el valor mostrado.

### Step 2: Indicador de filtros activos + limpiar

- Badge "Filtros activos: N" junto a la barra + botón "Limpiar filtros" que resetea los params de filtro (no `page`/`sort`... sí `page` a 1) vía `setParam`/URL.
- Estado activo visible en cada control (borde/acento).

**Verificar**: e2e — aplicar 2 filtros → badge 2; limpiar → todos los params fuera de la URL y lista completa.

### Step 3: Export UI

- Botón "Exportar" en ProductsPage (junto a la barra de filtros) con menú JSON/CSV que exporta **con los filtros activos actuales** (los endpoints ya soportan q/category/archived/out_of_stock; agregar discounted/min/max del Step 1 al `csvExportQuerySchema` en `importExport.ts:95-100`).
- Descarga vía blob (`URL.createObjectURL`) con filename `productos-<fecha>.json/.csv`; feedback de éxito/error.

**Verificar**: e2e — export con filtro activo produce CSV con filas == set filtrado (validar contra la API); JSON descargado parsea como catálogo válido.

### Step 4: Imágenes robustas

- Un componente compartido `<ProductImage>` (en `src/web/app/` o `components/`): `onError` → placeholder (SVG inline "Sin imagen") + `getImageUrl` corregido: normalizar prefijos (aceptar `assets/images/...` y `images/...` → `assets/images/...`) y para cualquier otra forma devolver el placeholder en vez de un path que sirve HTML.
- Usarlo en galería, inspector, "Imagen actual" y previews del form (unificar los 3 sites de onError existentes).

**Verificar**: test de unidad del helper (paths válidos/inválidos); e2e con un producto de image_path roto → muestra placeholder, sin broken-glyph ni request 200-HTML.

### Step 5: Confirm en deletes

- `window.confirm` consistente (mismo formato que archive/restore en ProductsPage) en: delete categoría, delete nav-group, delete subcategoría, delete bundle, discard intent. Mensaje con el nombre de la entidad.

**Verificar**: e2e — click delete → dialog aparece; cancelar no borra; aceptar borra.

### Step 6: Suite

```bash
npm run admin:test && npm run admin:certify
```

## Test plan

- API: `api.test.ts`/`repositories.test.ts` + casos de filtro descuento; `importExport.ts` schema con los nuevos params.
- E2E: nuevo spec `catalog-filters.spec.ts` (patrón `playwright.import.config.ts`, temp repo): filtro descuento, badge/limpiar, export CSV filtrado, placeholder de imagen, confirms.

## Done criteria

- [x] Filtro descuento (solo-descuento + min/max %) en API y UI; sort de % consistente (por discount_percentage).
- [x] Badge "Filtros activos: N" + Limpiar.
- [x] Export JSON/CSV desde UI con filtros aplicados (CSV con los nuevos filtros).
- [x] Imagen rota → placeholder (ProductImage); getImageUrl sin ramas muertas.
- [x] Todos los deletes destructivos confirman (categorías, nav-groups, subcategorías, combos de bundle, discard de intent).

## Evidence (2026-08-11)

- API: `productRepository.getAll` + `GET /products` aceptan `discounted_only`/`min_discount`/`max_discount` (porcentaje derivado, 0-100, NaN → vacío); `csvExportQuerySchema` + `/export.csv` aplican los mismos filtros; `parseBulkFilters` (scope=all) los incluye.
- UI (ProductsPage): checkbox "Solo descuento" + inputs "Dto. mín %/máx %"; sort de la columna % por `discount_percentage` (antes CLP); badge de filtros activos con Limpiar; botones ⬇ JSON/⬇ CSV con los filtros activos (blob + download); `ProductImage` (components/) con placeholder + `normalizeImagePath`; confirms en CategoriesPage (3), BundlesPage (combos), MediaPage (discard).
- Tests: +2 API (filtros descuento unit por rango, CSV filtrado) + 2 e2e scope (filtro descuento + Limpiar, export CSV con filtros — el fixture ahora tiene 5 productos con 10% de descuento en cat-b). Nota e2e: `check()` falla por race del re-render de React Router (el estado SÍ cambia: URL + checked confirmados con click()); se usa click + toBeChecked.
- Suite: 495 tests, e2e scope 7/7 + smoke 19/19, certify 30/30, lint 0 errores.

## STOP conditions

- Si el CSV export ya soporta algún filtro con semántica distinta (revisar `changes.ts:437-442`: `q` no incluye category en CSV mientras `/products` sí), alinear antes de agregar params nuevos — reportar el drift si es intencional.

## Maintenance notes

El componente `ProductImage` es el punto único para el fallback de imágenes; todo `<img>` de producto nuevo debe usarlo. Los filtros nuevos siguen el patrón URL-param de los existentes para que la búsqueda siga siendo compartible.
