# Plan 018: Quick performance wins — GPU layers, companion scan, build cache, category scan

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
>
> ```
> git diff --stat 633eeb8..HEAD -- astro-poc/src/styles/global.css astro-poc/src/scripts/storefront.js astro-poc/src/lib/catalog.ts turbo.json
> ```
>
> If any in-scope file changed since this plan was written, compare excerpts
> against live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plan 013 (Astro version must be correct for build verification)
- **Category**: perf
- **Planned at**: commit `633eeb8`, 2026-07-14

## Why this matters

Cuatro optimizaciones de bajo esfuerzo que eliminan trabajo innecesario en runtime y build-time:

1. **PERF-N01** — `will-change: transform` en todos los `.producto img` crea una capa de compositor GPU por cada imagen. En móvil con 24+ productos visibles, esto consume memoria GPU significativa y puede causar frame drops u OOM en dispositivos de gama baja.
2. **PERF-N02** — `getCompanionProducts` escanea todos los productos visibles para cada target de cada companion rule en cada cambio de carrito. O(R × T × P) donde R=rules, T=targets, P=productos visibles.
3. **PERF-N04** — `turbo.json` declara `cache: true` para `build` pero sin `inputs`. Cualquier cambio en cualquier archivo del workspace invalida la caché de build.
4. **PERF-N05** — `getProductsByCategory` hace `getProductsWithSku().filter(...)` — un scan O(n) de todos los productos — llamado una vez por categoría en la home page.

## Current state

### PERF-N01: GPU layers

`astro-poc/src/styles/global.css:976-983`:

```css
.producto img {
  width: 100%;
  height: 208px;
  object-fit: contain;
  backface-visibility: hidden;
  transform: translateZ(0); /* ← crea capa GPU innecesaria */
  will-change: transform; /* ← crea capa GPU innecesaria */
}
```

### PERF-N02: N+1 companion scan

`astro-poc/src/scripts/storefront.js:705-748` — `getCompanionProducts` itera `companionRules.forEach` → `targets.forEach` → `getProductCardMap().values()` completo. La función se llama desde `renderCompanionSuggestions` que se invoca en cada `setQty` (`storefront.js:1646`).

### PERF-N04: Turbo sin inputs

`turbo.json:4-7`:

```json
"build": {
  "dependsOn": ["^build"],
  "outputs": ["dist/**", "astro-poc/dist/**"],
  "cache": true
}
```

### PERF-N05: Category scan

`astro-poc/src/lib/catalog.ts:523-524`:

```typescript
export function getProductsByCategory(categoryKey: string): ProductWithSku[] {
  return getProductsWithSku().filter(({ product }) => product.category === categoryKey);
}
```

Llamado desde `astro-poc/src/pages/index.astro:136-148` para cada `primaryCategory`.

## Commands you will need

| Purpose   | Command             | Expected on success |
| --------- | ------------------- | ------------------- |
| Build     | `npm run build`     | exit 0              |
| Typecheck | `npm run typecheck` | exit 0, no errors   |
| Lint      | `npm run lint`      | exit 0              |
| Test      | `npm test`          | all pass            |

## Scope

**In scope**:

- `astro-poc/src/styles/global.css:976-983` — eliminar `will-change` y `translateZ`
- `astro-poc/src/scripts/storefront.js:705-748` — optimizar `getCompanionProducts`
- `turbo.json:4-7` — añadir `inputs` al task `build`
- `astro-poc/src/lib/catalog.ts:523-524` — optimizar `getProductsByCategory`

**Out of scope** (do NOT touch):

- `renderCompanionSuggestions` — solo optimizamos su data source, no el rendering
- `ProductCard.astro` / `ProductCardStrip.astro` — los componentes no se modifican
- Plan 005 (optimización de DOM rendering) — diferente scope
- Plan 004 (caching de build-time en catalog.ts) — diferente scope

## Git workflow

- Branch: `advisor/018-quick-perf-wins`
- Commit per logical step (4 commits). Message style: `perf(<area>): <description>` matching the repo's conventional commits style.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Eliminar GPU layers innecesarias

En `astro-poc/src/styles/global.css`, líneas 980-982, eliminar:

```css
backface-visibility: hidden;
transform: translateZ(0);
will-change: transform;
```

Reemplazar con solo:

```css
backface-visibility: hidden;
```

El bloque final queda:

```css
.producto img {
  width: 100%;
  height: 208px;
  object-fit: contain;
  backface-visibility: hidden;
}
```

**Verify**: `npm run build` → exit 0. Inspeccionar visualmente las product cards en `npm run dev` — las imágenes deben seguir renderizándose correctamente, sin cambios visuales.

### Step 2: Optimizar getCompanionProducts con Map lookup

En `astro-poc/src/scripts/storefront.js`, dentro de `getCompanionProducts` (buscar la función ~línea 705):

Localizar el bloque que itera los targets y agrega `const byCategory = getProductCardMap().values()...`. Reemplazar con un Map pre-construido:

**Buscar** el patrón (aproximadamente líneas 720-740):

```javascript
targets.forEach(function (target) {
  // ... busca en getProductCardMap() ...
});
```

**Reemplazar** por:

```javascript
var productByKey = new Map();
getProductCardMap().forEach(function (card, _id) {
  var product = getProductFromCard(card);
  if (product) {
    var key = normalizeSearchText(product.category) + '::' + normalizeSearchText(product.name);
    productByKey.set(key, product);
  }
});

targets.forEach(function (target) {
  var key = normalizeSearchText(target.category) + '::' + normalizeSearchText(target.name);
  var match = productByKey.get(key);
  if (match) {
    var existingIndex = suggestions.findIndex(function (s) {
      return s.id === match.id;
    });
    if (existingIndex < 0 && !alreadyInCart.has(match.id)) {
      suggestions.push(match);
      alreadyInCart.add(match.id);
    }
  }
});
```

**Verify**: `npm run lint` → exit 0. La lógica de negocio es idéntica, solo cambia la estructura de datos.

### Step 3: Añadir inputs al task build en turbo.json

En `turbo.json`, modificar el task `build`:

```json
"build": {
  "dependsOn": ["^build"],
  "inputs": [
    "astro-poc/src/**",
    "astro-poc/astro.config.mjs",
    "astro-poc/public/**",
    "astro-poc/package.json",
    "data/**",
    "assets/**"
  ],
  "outputs": ["dist/**", "astro-poc/dist/**"],
  "cache": true
}
```

**Verify**: `npx turbo run build --dry` debe mostrar `inputs` en la salida.

### Step 4: Optimizar getProductsByCategory con Map pre-agrupado

En `astro-poc/src/lib/catalog.ts`, añadir una caché de productos por categoría. Agregar después de `cachedProductsWithSku` (~línea 168):

```typescript
let cachedProductsByCategory: Map<string, ProductWithSku[]> | null = null;
```

Modificar `getProductsWithSku` para invalidar esta caché cuando se regenera (~línea 366, después de asignar `cachedProductsWithSku`):

```typescript
cachedProductsByCategory = null;
```

Reemplazar `getProductsByCategory` (líneas 523-524):

```typescript
export function getProductsByCategory(categoryKey: string): ProductWithSku[] {
  if (!cachedProductsByCategory) {
    cachedProductsByCategory = new Map();
    for (const item of getProductsWithSku()) {
      const cat = item.product.category;
      if (!cachedProductsByCategory.has(cat)) {
        cachedProductsByCategory.set(cat, []);
      }
      cachedProductsByCategory.get(cat)!.push(item);
    }
  }
  return cachedProductsByCategory.get(categoryKey) || [];
}
```

**Verify**: `npm run typecheck` → exit 0, no errors. `npm run build` → exit 0.

### Step 5: Validación completa

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

**Verify**: todos exit 0.

## Test plan

Los cambios no alteran comportamiento — solo estructura de datos interna y CSS. La suite de tests existente (`npm test`) verifica que las funciones de catálogo y rendering siguen funcionando. Si algún test falla, es porque depende de efectos secundarios o timing que estos cambios no deberían afectar.

## Done criteria

All must hold:

- [ ] `npm run lint` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run build` exits 0
- [ ] `grep -rn "will-change: transform" astro-poc/src/styles/global.css` no encuentra matches
- [ ] `grep -rn "transform: translateZ" astro-poc/src/styles/global.css` no encuentra matches
- [ ] `turbo.json` contiene `"inputs"` en el task `build`
- [ ] `catalog.ts` tiene `cachedProductsByCategory`
- [ ] No files outside in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Los excerpts no coinciden con el código vivo (drift).
- Eliminar `will-change`/`translateZ` causa problemas visuales en las product cards (imágenes que parpadean o no se renderizan) en `npm run dev`.
- El cambio en `getCompanionProducts` rompe las sugerencias de productos complementarios (verificar visualmente en `npm run dev` añadiendo items al carrito).
- `npx turbo run build --dry` no muestra `inputs` después del cambio.
- `npm run typecheck` falla después de modificar `catalog.ts`.

## Maintenance notes

- Si en el futuro se necesita animar las imágenes de producto, usar `will-change` como hint temporal (añadir antes de la animación, remover después), no como propiedad permanente en CSS.
- El Map pre-agrupado en `getProductsByCategory` escala bien: O(1) lookup en lugar de O(n) filter. Si el catálogo crece a miles de productos, esta optimización se vuelve crítica.
- Los `inputs` de turbo.json deben mantenerse actualizados cuando se añadan nuevas fuentes de datos al build (ej. nuevos directorios en `data/` o `assets/`).
