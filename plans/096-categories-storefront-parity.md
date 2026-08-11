# Plan 096: Paridad de categorías y storefront — delete con reasignación, bundle price, nav-groups, picker

> Auditoría 8 (2026-08-11). M9, M10, M13, M14, M15, P16.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — delete con reasignación y OG lifecycle tocan el write path de categorías
- **Depends on**: 088 (categoría delete-check con conteo real), 090 (segment containment para media)
- **Category**: functionality parity
- **Written against**: commit `cefdd9f`

## Why this matters

Python permite retirar una categoría reasignando sus productos a otra en el
mismo diálogo (TS rechaza el delete si está en uso → el operador reasigna
manualmente uno por uno); el bundle price (CLP) que el storefront muestra no
se puede editar desde el TS (el schema y el repo lo soportan); los nav-groups
no tienen edit (solo create/delete con id+nombre); faltan búsqueda/filtro/
expand de categorías; el lifecycle de OG no está atado al CRUD de categorías;
y el picker de productos no filtra por categoría.

## Current state

- `categoryService.ts:111-131` + `catalog.ts:455-489` — delete rechaza si `products.filter(category===id)` no vacío; sin flujo de reasignación. (El check además solo mira 200 productos — lo corrige 088.)
- `storefront.ts:15` — `bundlePrice` en el schema; `storefrontRepository.ts:81-83` lo carga; `BundlesPage.tsx:258-289` no tiene input.
- `CategoriesPage.tsx:224-267` — nav-groups: create (id+display_name) y delete; sin edit/order/description/enabled. Python: `category_gui.py:1093-1195`.
- `CategoriesPage.tsx:213-475` — sin search/status filter/expand-collapse/detail. Python: `category_gui.py:382-426,568-612`.
- OG: solo intents manuales por categoría (`MediaPage.tsx:299-324`); Python ataba ensure/delete al save/delete de categoría + "Reconstruir OG" (`category_gui.py:1048-1087`).
- Picker de bundles: búsqueda por nombre solo (`BundlesPage.tsx:181-183,353-381`). Python filtraba por categoría (`storefront_dialogs.py:54-105`).
- Auto-slug ausente (Python `storefront_dialogs.py:249-252`, `category_gui.py:214-221`) — M11.

## Scope

**In scope**: `catalog.ts`, `categoryService.ts`, `CategoriesPage.tsx`, `BundlesPage.tsx`, `storefront.ts` (route + schema), `client.ts`, tests.
**Out of scope**: OG como paso de publicación (ya decidido: media intents; plan 089 arregla su apply), reorder de categorías por UI (existe API).

## Steps

### Step 1: Delete con reasignación

- API: `DELETE /categories/:id` acepta `{ reassign_to: categoryId }` opcional. Si `reassign_to` dado → reasigna todos los productos de la categoría (scan completo, sin límite de 200 — hereda el fix de 088) y borra; si no y está en uso → 409 `CATEGORY_IN_USE` con conteo.
- UI: diálogo de delete (componente de 093) con select "Reasignar productos a:" (precargado con categorías activas) o "No usar (bloquear si en uso)".
- **Verificar**: test — delete con reassign mueve N productos y borra; sin reassign y en uso → 409 con conteo; categoría vacía → delete directo.

### Step 2: Bundle price

- Input "Precio del bundle (CLP)" en `BundlesPage.tsx` (form tipado), validado ≥ 0 (invariantes de `storefrontValidation.ts`), guardado vía el PUT existente (schema ya lo incluye).
- **Verificar**: test — create/edit bundle con price persiste y sobrevive reload; price negativo → 422.

### Step 3: Nav-groups editables

- `client.ts:250-269` + `catalog.ts` — PATCH/PUT de nav-group con label, order, description, enabled (validado con zod).
- UI en `CategoriesPage`: expandir el form existente a todos los campos + reorder (↑/↓) dentro del grupo.
- **Verificar**: test API + e2e — renombrar/reordenar nav-group persiste en `category_registry.json` y el storefront build no se rompe (`npm run build` local).

### Step 4: Categorías navegables

- Search (por title/slug/key), filtro activo/inactivo, expand/collapse all, panel de detalle (productos de la categoría con conteo real, usando el fix de 088).
- **Verificar**: e2e — filtrar por búsqueda y estado; expand all muestra subcategorías.

### Step 5: OG lifecycle + auto-slug

- Al guardar/borrar categoría: crear intent `og` (o `og-delete`) automáticamente si el entorno lo permite (depende del plan 089 para que apply funcione). Botón "Reconstruir OG" por categoría → intent.
- Auto-slug: al escribir el título de categoría/bundle, pre-llenar `slug`/`key`/`id` (slugify: minúsculas, sin acentos, `-`) editable.
- **Verificar**: test — crear categoría genera slug sugerido; intent OG encolado al delete (si 089 ya está: apply ok).

### Step 6: Picker con filtro de categoría

- Select de categoría en el picker de productos (bundles/featured) + búsqueda combinada.
- **Verificar**: e2e — picker con 100+ productos filtra por categoría.

### Step 7: Suite

```bash
npm run admin:test && npm run admin:certify && npx playwright test -c playwright.config.ts
```

## Test plan

- `categoryMutationApi.test.ts` (+ reasignación, conteo sin límite), `subcategoryBundles.test.ts` (+ bundle price), `storefrontCuration.test.ts` (price negativo).
- E2E aislado: diálogo de delete con reassign, bundle price, nav-group edit, picker filtrado.

## Done criteria

- [ ] Delete con reasignación funcional (API + UI + conteo real).
- [ ] Bundle price editable y persistente.
- [ ] Nav-groups editables (label/order/desc/enabled).
- [ ] Search/filtro/expand de categorías.
- [ ] OG lifecycle encolado al CRUD (aplicable tras 089); auto-slug en categorías/bundles.
- [ ] Picker con filtro de categoría.

## STOP conditions

- Si la reasignación rompe el invariante "refs a productos reales" del storefront validation, validar el `reassign_to` contra categorías activas antes de escribir.
- Los intents OG automáticos solo se encolan si 089 está DONE; si no, el step se limita al auto-slug y se deja TODO anotado.

## Maintenance notes

La reasignación es el patrón para cualquier borrado futuro con dependencias. El slugify debe ser idéntico al del storefront (`astro-poc/src/lib/` si existe un slug helper — verificar y reusar, no duplicar).
