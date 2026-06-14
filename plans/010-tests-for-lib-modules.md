# Plan 010: Añadir tests unitarios para catalog.ts, seo.ts, product-identity.ts y logger.ts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.

> **Drift check (run first)**: `git diff --stat 4751633..HEAD -- astro-poc/src/lib/catalog.ts astro-poc/src/lib/seo.ts astro-poc/src/lib/product-identity.ts astro-poc/src/lib/logger.ts`
> Si los archivos cambiaron, compara excerpts contra código vivo; si hay mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plan 007 (consolidación de formatPrice) y plan 004 (caches en catalog.ts) son recomendados pero no bloqueantes
- **Category**: tests
- **Planned at**: commit `4751633`, 2026-06-14

## Why this matters

Varios módulos de la capa de datos y utilidades del storefront activo carecen de tests unitarios:

1. **TC-4 — catalog.ts** (675 líneas, 40+ funciones exportadas): Solo las funciones de image URLs tienen tests (`astro-catalog-image-url.spec.js`). Funciones críticas sin tests: `getProducts`, `getCategoryByKey`, `getCategoryBySlug`, `getNavigationGroups`, `getStorefrontExperience`, `getHomepageCatalogProducts`, `getStorefrontBundles`, `getHomeFeaturedDeals`, `getHomeQuickPicks`.

2. **TC-5 — seo.ts** (292 líneas): Cero tests de comportamiento. Funciones como `absoluteUrl`, `normalizeShareDescription`, `createSharePreviewMetadata` son usadas en todas las páginas para meta tags sociales. Un bug aquí rompe las unfurls de WhatsApp/Facebook/Twitter.

3. **TC-6 — product-identity.ts** (39 líneas): `generateStableSku` y `getProductSku` son usadas en build-time para generar identificadores estables de productos. Cero tests.

4. **TC-6 — logger.ts**: Cero tests (el test `logger.redaction.spec.js` testea el logger legacy). Ver plan 009.

## Current state

### catalog.ts — funciones a testear

Funciones de consulta de productos (puras, leen JSON importado):

- `getProducts()` — retorna todos los productos con SKU
- `getProductsWithSku()` — similar, con cache
- `getCategoryByKey(key)` — búsqueda por key normalizada
- `getCategoryBySlug(slug)` — búsqueda por slug
- `getActiveCategories()` — categorías no archivadas, ordenadas
- `getCategorySlug(key)` — construye slug desde category key
- `getNavigationGroups()` — árbol de navegación completo
- `getHomepageCatalogProducts()` — filtra productos de categorías secundarias
- `getHomepageCatalogInitialProducts(limit)` — prioritized + remaining
- `getHomeFeaturedDeals()` — top 4 por porcentaje de descuento
- `getHomeQuickPicks()` — productos de fallback configurados
- `getStorefrontBundles()` — bundles con precios resueltos
- `getStorefrontCompanionRules()` — reglas de companions
- `getProductByReference(ref)` — lookup por referencia
- `getProductsByReferences(refs)` — batch lookup con dedup
- `normalizeCategoryToken(value)` — normalización de strings
- `resolveCategoryParamToKey(param)` — resolución de parámetros de URL

### seo.ts — funciones a testear

- `absoluteUrl(pathOrUrl)` — construye URLs absolutas
- `publicAssetUrl(pathOrUrl)` — construye paths de assets públicos
- `normalizeShareDescription(value, fallback)` — trunca y limpia descripciones
- `getHomeOgImageUrl(options)` — URL de OG image de home
- `getCategoryOgImageUrl(slug, options)` — URL de OG image de categoría
- `getProductOgImageUrl(imagePath, categorySlug, options)` — cascada de fallback
- `createSharePreviewMetadata(input)` — metadata completo para social sharing

### product-identity.ts — funciones a testear

- `normalizeIdentity(value)` — null para no-strings, trimmed string
- `generateStableSku(product)` — hash determinista de name+category
- `getProductSku(product)` — prioridad sku > id > generated

## Commands

| Purpose   | Command             | Expected on success |
| --------- | ------------------- | ------------------- |
| Typecheck | `npm run typecheck` | exit 0              |
| Tests     | `npm test`          | all pass            |
| Lint      | `npm run lint`      | exit 0              |
| Format    | `npm run format`    | exit 0              |

## Scope

**In scope** (crear/modificar):

- `test/catalog-queries.spec.js` — tests para funciones de consulta de catalog.ts
- `test/seo.spec.js` — tests para funciones de seo.ts
- `test/product-identity.spec.js` — tests para product-identity.ts

**Out of scope**:

- Tests para funciones que requieren file system (OG image manifest, version tokens) — requieren setup de fixtures
- Tests de integración build-time
- `astro-poc/src/lib/logger.ts` — cubierto por plan 009

## Git workflow

- Branch: `advisor/010-tests-for-lib-modules`
- Commit messages: `test: add unit tests for catalog.ts query functions, seo.ts, and product-identity.ts`
- No push/PR sin indicación.

## Steps

### Step 1: Tests para product-identity.ts (más simple, calentamiento)

Crear `test/product-identity.spec.js`:

```javascript
import { describe, it, expect } from 'vitest';
import {
  normalizeIdentity,
  generateStableSku,
  getProductSku,
} from '../astro-poc/src/lib/product-identity.js';
```

Casos de prueba:

1. `normalizeIdentity` con string válido → retorna trimmed
2. `normalizeIdentity` con string vacío → null
3. `normalizeIdentity` con número → null
4. `normalizeIdentity` con null/undefined → null
5. `generateStableSku` es determinista — misma entrada → misma salida
6. `generateStableSku` productos diferentes → SKUs diferentes
7. `generateStableSku` insensible a mayúsculas (el input se lowercases)
8. `getProductSku` usa sku explícito si existe
9. `getProductSku` usa id si no hay sku
10. `getProductSku` genera sku estable si no hay sku ni id

**Verify**: `npx vitest run test/product-identity.spec.js` → all pass

### Step 2: Tests para seo.ts

Crear `test/seo.spec.js`:

Casos de prueba:

1. `absoluteUrl('/pagina')` → `'https://www.elrincondeebano.com/pagina'`
2. `absoluteUrl('https://otro.com/pagina')` → sin cambios (URL absoluta)
3. `absoluteUrl('')` → `'https://www.elrincondeebano.com'`
4. `publicAssetUrl('/assets/img.png')` → `'/assets/img.png'`
5. `publicAssetUrl('https://externo.com/img.png')` → sin cambios
6. `normalizeShareDescription` con string < 180 chars → sin cambios
7. `normalizeShareDescription` con string > 180 chars → truncado con "..."
8. `normalizeShareDescription` con HTML → tags eliminados
9. `normalizeShareDescription` con undefined → usa fallback
10. `normalizeShareDescription` con string vacío → usa fallback
11. `createSharePreviewMetadata` con input mínimo → todos los campos existen
12. `createSharePreviewMetadata` con canonicalUrl explícito → lo usa
13. `createSharePreviewMetadata` con canonicalPath → construye URL absoluta

**Verify**: `npx vitest run test/seo.spec.js` → all pass

### Step 3: Tests para catalog.ts query functions

Crear `test/catalog-queries.spec.js`:

Casos de prueba (selección de los más críticos):

1. `normalizeCategoryToken(' AbarroTes ')` → `'abarrotes'`
2. `normalizeCategoryToken(123)` → `''`
3. `getProducts()` retorna array no vacío
4. `getProductsWithSku()` cada item tiene `.sku` y `.product`
5. `getActiveCategories()` no incluye archivadas
6. `getActiveCategories()` está ordenada por sort_order
7. `getCategoryByKey(key)` encuentra categoría existente
8. `getCategoryBySlug(slug)` encuentra por slug
9. `getCategorySlug(key)` retorna string no vacío
10. `getHomeFeaturedDeals()` retorna ≤ 4 productos con descuento > 0
11. `getHomeFeaturedDeals()` está ordenada por porcentaje de descuento descendente
12. `getHomeQuickPicks()` retorna productos de la config
13. `getStorefrontBundles()` retorna bundles con precio total calculado
14. `getNavigationGroups()` retorna grupos con categorías anidadas
15. `getProductByReference({ category, name })` encuentra producto existente
16. `getProductsByReferences([...])` retorna array sin duplicados
17. `getStorefrontCompanionRules()` retorna array de reglas

**Verify**: `npx vitest run test/catalog-queries.spec.js` → all pass

### Step 4: Validación completa

```bash
npm run typecheck && npm run lint && npm test
```

## Test plan

Seguir el patrón de `test/formatting.spec.js` y `test/storefront-state.spec.js` — imports directos de los módulos, sin DOM:

```javascript
import { describe, it, expect } from 'vitest';
import { absoluteUrl, normalizeShareDescription } from '../astro-poc/src/lib/seo.js';

describe('absoluteUrl', () => {
  it('prepends site origin to relative paths', () => {
    expect(absoluteUrl('/categoria/abarrotes')).toBe(
      'https://www.elrincondeebano.com/categoria/abarrotes'
    );
  });
  // ...
});
```

Total: ~45 tests nuevos entre los 3 archivos.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0
- [ ] `test/product-identity.spec.js` existe con ≥ 8 tests
- [ ] `test/seo.spec.js` existe con ≥ 13 tests
- [ ] `test/catalog-queries.spec.js` existe con ≥ 17 tests
- [ ] No files outside the in-scope list are modified

## STOP conditions

- Si los imports de `catalog.ts` fallan porque el módulo requiere `node:crypto` o `node:fs` (verificar que las funciones seleccionadas no dependen de Node built-ins). Si alguna función usa file system, envolver en mock o excluir del test.
- Si los datos de prueba (productos JSON) no están disponibles en el contexto de Vitest (deberían estarlo — son imports estáticos).
- Si un test falla consistentemente porque la lógica de negocio cambió desde que se escribió este plan.

## Maintenance notes

- Los tests de `catalog.ts` dependen de los datos en `astro-poc/src/data/products.json` y `categories.json`. Si estos archivos cambian, algunos tests pueden necesitar actualización.
- `getHomeFeaturedDeals()` y `getHomeQuickPicks()` dependen de `storefront-experience.json` — verificar que los fixtures de test son consistentes.
- Los tests de `seo.ts` que dependen de file system (`getCategoryOgImageUrl`, `getHomeOgImageUrl`) se excluyen inicialmente; añadir en un plan futuro con fixtures de assets.
