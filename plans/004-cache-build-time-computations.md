# Plan 004: Cachear funciones de build-time en catalog.ts y dividir JSON de storefront

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.

> **Drift check (run first)**: `git diff --stat 4751633..HEAD -- astro-poc/src/lib/catalog.ts astro-poc/src/layouts/BaseLayout.astro astro-poc/src/pages/index.astro`
> Si los archivos cambiaron, compara excerpts contra código vivo; si hay mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `4751633`, 2026-06-14

## Why this matters

Tres optimizaciones de build-time que eliminan trabajo redundante en cada página renderizada por Astro:

1. **PERF-01**: `getProductReferenceMap()` (`catalog.ts:402-409`) construye un `Map` de todos los productos cada vez que se llama. Se invoca desde `getProductByReference()` → `getProductsByReferences()` → `getHomepageCatalogInitialProducts()`, `getStorefrontBundles()`, `getHomeQuickPicks()`, `getHomeFeaturedStaples()`. Cada page render reconstruye el mismo mapa.

2. **PERF-02**: `getNavigationGroups()` (`catalog.ts:643-669`) filtra y ordena categorías activas + construye paths para cada grupo de navegación en cada page render. Se llama desde `BaseLayout.astro` (cada página) y `resolveHomeCategories()`.

3. **PERF-05**: `BaseLayout.astro:121-124` incrusta el JSON completo de `storefrontExperience` en TODAS las páginas, incluyendo parking, 404 y producto detalle, donde nunca se usa.

## Current state

### PERF-01: getProductReferenceMap sin cache

```typescript
// catalog.ts:402-409
function getProductReferenceMap() {
  return new Map(
    getProductsWithSku().map((item) => [
      productReferenceKey({ category: item.product.category, name: item.product.name }),
      item,
    ])
  );
}
```

Ya existe un patrón de cache en el mismo archivo:

- `cachedProductsWithSku` (línea ~170) — lazy init con invalidación
- `cachedCategoryIndexes` (línea ~183) — lazy init con invalidación

### PERF-02: getNavigationGroups sin cache

```typescript
// catalog.ts:643-669
export function getNavigationGroups(): NavGroup[] {
  const activeCategories = getActiveCategories();
  const groups = (categoryRegistry.nav_groups || [])
    .filter((group) => group.active !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((group) => {
      const categories = activeCategories
        .filter((category) => category.nav_group === group.id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((category) => ({
          key: category.key,
          slug: getCategorySlug(category.key),
          label: category.display_name?.default || category.key,
          legacyPath: getLegacyCategoryPath(category.key),
          modernPath: getModernCategoryPath(category.key),
        }));
      return { id: group.id, label: group.display_name?.default || group.id, categories };
    })
    .filter((group) => group.categories.length > 0);
  return groups;
}
```

### PERF-05: JSON inline en BaseLayout

```astro
<!-- BaseLayout.astro ~121-124 -->
<script id="storefront-experience-data" type="application/json">
  {JSON.stringify(storefrontExperience)}
</script>
```

### Convenciones

- `catalog.ts` usa variables module-level con prefijo `cached` para lazy init (ej: `cachedCategoryIndexes` en línea 183).
- Las funciones de `catalog.ts` son puras (leen datos estáticos de JSON imports).
- Los componentes Astro usan `---` frontmatter para lógica de servidor.

## Commands

| Purpose   | Command             | Expected on success |
| --------- | ------------------- | ------------------- |
| Typecheck | `npm run typecheck` | exit 0              |
| Build     | `npm run build`     | exit 0              |
| Tests     | `npm test`          | all pass            |
| Lint      | `npm run lint`      | exit 0              |
| Format    | `npm run format`    | exit 0              |

## Scope

**In scope**:

- `astro-poc/src/lib/catalog.ts` — añadir caches module-level para `getProductReferenceMap` y `getNavigationGroups`
- `astro-poc/src/layouts/BaseLayout.astro` — condicionar o dividir el JSON inline
- `astro-poc/src/pages/index.astro` — si necesita el JSON inline, moverlo aquí

**Out of scope**:

- `astro-poc/src/components/` — los componentes no se modifican, solo consumen las funciones ya cacheadas
- `astro-poc/src/pages/estacionamiento.astro` — no se modifica
- `astro-poc/src/data/storefront-experience.json` — los datos fuente no cambian

## Git workflow

- Branch: `advisor/004-cache-build-time-computations`
- Commit messages: `perf: cache getProductReferenceMap and getNavigationGroups at module level`
- No push/PR sin indicación.

## Steps

### Step 1: Cachear `getProductReferenceMap`

En `catalog.ts`, añadir variable module-level y modificar la función:

```typescript
let cachedReferenceMap: Map<string, ProductWithSku> | null = null;

function getProductReferenceMap(): Map<string, ProductWithSku> {
  if (cachedReferenceMap) {
    return cachedReferenceMap;
  }
  cachedReferenceMap = new Map(
    getProductsWithSku().map((item) => [
      productReferenceKey({ category: item.product.category, name: item.product.name }),
      item,
    ])
  );
  return cachedReferenceMap;
}
```

**Verify**: `npm run build` → exit 0 (el cache no debe romper ninguna página)

### Step 2: Cachear `getNavigationGroups`

Mismo patrón:

```typescript
let cachedNavigationGroups: NavGroup[] | null = null;

export function getNavigationGroups(): NavGroup[] {
  if (cachedNavigationGroups) {
    return cachedNavigationGroups;
  }
  const activeCategories = getActiveCategories();
  // ... mismo código de antes ...
  cachedNavigationGroups = groups;
  return cachedNavigationGroups;
}
```

**Verify**: `npm run build` → exit 0

### Step 3: Dividir el JSON de storefront experience

**Opción A (mínima)**: Mover el `<script>` de `BaseLayout.astro` a `index.astro` y `combos.astro` (las únicas páginas que usan `storefrontExperience`). En `storefront.js`, `readStorefrontExperience()` ya maneja el caso de que el elemento no exista (retorna `{}`, línea 93-103).

**Opción B (más granular)**: Dividir en bloques JSON más pequeños. Solo si la Opción A no es suficiente.

Implementar Opción A:

1. En `BaseLayout.astro`, eliminar el bloque `<script id="storefront-experience-data" ...>`.
2. En `index.astro`, añadir el mismo bloque en el frontmatter o template.
3. En `combos.astro`, añadir el bloque (solo si `combos.astro` usa companion rules o bundles que dependen del JSON).

**Verify**: `npm run build && npm test` → exit 0. Verificar que `npm run guardrails` no reporta assets huérfanos.

### Step 4: Validación completa

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

**Verify**: Todo exit 0. El build no debe mostrar errores de datos faltantes.

## Test plan

Los tests existentes deben seguir pasando. Añadir:

1. En `test/astro-catalog-image-url.spec.js` (o crear `test/catalog-cache.spec.js`):
   - Verificar que `getProductReferenceMap()` retorna el mismo objeto en llamadas sucesivas.
   - Verificar que `getNavigationGroups()` retorna el mismo array en llamadas sucesivas dentro del mismo build.

```javascript
it('getProductReferenceMap returns cached result', () => {
  const map1 = getProductReferenceMap();
  const map2 = getProductReferenceMap();
  expect(map1).toBe(map2); // misma referencia = cache funciona
});
```

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm test` exits 0
- [ ] `getProductReferenceMap` tiene cache module-level (misma referencia en llamadas sucesivas)
- [ ] `getNavigationGroups` tiene cache module-level
- [ ] `storefront-experience-data` script NO está en `BaseLayout.astro`; solo en páginas que lo necesitan
- [ ] No files outside the in-scope list are modified

## STOP conditions

- Si el build produce páginas con datos faltantes (productos no renderizados, bundles vacíos).
- Si los tests existentes que dependen de `getProductReferenceMap` o `getNavigationGroups` sin cache fallan (poco probable — son funciones puras).
- Si `combos.astro` u otra página requiere el JSON inline y no se identificó — reportar cuál.

## Maintenance notes

- Los caches module-level viven durante todo el build de Astro (SSG). No hay riesgo de stale data porque los datos fuente (`products.json`, `categories.json`, `storefront-experience.json`) son estáticos durante el build.
- Si en el futuro se implementa hot-reload de datos durante `astro dev`, los caches deben invalidarse. Astro ya maneja HMR para imports de JSON — si los datos cambian, el módulo se recarga y los caches se reinician.
- La invalidación explícita (`cachedReferenceMap = null`) puede añadirse si se necesita para tests.
