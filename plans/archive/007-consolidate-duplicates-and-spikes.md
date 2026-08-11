# Plan 007: Consolidar duplicación, unificar convenciones de módulos y limpiar código spike

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.

> **Drift check (run first)**: `git diff --stat 4751633..HEAD -- astro-poc/src/lib/catalog.ts astro-poc/src/lib/formatting.ts astro-poc/src/scripts/storefront.js tools/ tools/utils/product-contract.js`
> Si los archivos cambiaron, compara excerpts contra código vivo; si hay mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plan 001 (ambos tocan `catalog.ts` y `storefront.js`)
- **Category**: tech-debt
- **Planned at**: commit `4751633`, 2026-06-14

## Why this matters

Cinco problemas de deuda técnica que degradan la mantenibilidad, claridad y DRY:

1. **TDA-02**: Dos funciones idénticas de formato de precio — `formatPrice` en `catalog.ts:210` y `formatCurrency` en `formatting.ts:3`. Si cambian las reglas de formato (locale, fraction digits), hay que actualizar dos lugares.

2. **TDA-07**: `formatPrice` vive en `catalog.ts` (módulo de datos) pero es una función de presentación. Viola separación de responsabilidades (SRP).

3. **TDA-05**: `normalizeCategoryToken` en `catalog.ts:176` y `normalizeCategoryKey` en `tools/utils/product-contract.js:29` hacen exactamente lo mismo.

4. **TDA-03**: `tools/` mezcla 11 archivos `.js` (CommonJS) con 24 archivos `.mjs` (ESM). No hay convención documentada. Nuevos desarrolladores no saben qué extensión usar.

5. **TDA-04**: Código marcado "Spike 008/010 — prototype" en `storefront.js:153-291` se ejecuta en producción sin tests. Las funciones `encodeCart`, `decodeCart`, `getShareableCartUrl`, `shareCart`, `loadCartFromUrl`, `getFavorites`, `toggleFavorite`, `isFavorite`, `checkStockNotifications` están completamente implementadas pero etiquetadas como prototipo.

## Current state

### TDA-02/07: Duplicación de formatPrice

```typescript
// catalog.ts:210-217
export function formatPrice(value: unknown): string {
  const amount = typeof value === 'number' ? value : 0;
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(amount);
}

// formatting.ts:3-12
export function formatCurrency(value: unknown): string {
  const parsed = Number(value);
  const amount = Number.isFinite(parsed) ? parsed : 0;
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(amount);
}
```

La versión de `formatting.ts` es marginalmente más robusta (maneja `NaN` correctamente).

### TDA-05: Duplicación de category normalization

```typescript
// catalog.ts:176
export function normalizeCategoryToken(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

// tools/utils/product-contract.js:29
function normalizeCategoryKey(value) {
  return hasText(value) ? value.trim().toLowerCase() : '';
}
```

### TDA-04: Código spike

```javascript
// storefront.js:153
// --- Spike 008: Carrito compartible por URL (prototype) ---
// ... ~55 líneas de funciones ...
// --- Fin Spike 008 ---

// storefront.js:210
// --- Spike 010: Notificaciones de stock (prototype) ---
// ... ~80 líneas de funciones ...
// --- Fin Spike 010 ---
```

`loadCartFromUrl()` se llama incondicionalmente en `initStorefront()` (línea ~1483).

### Componentes que importan formatPrice

- `ProductCard.astro:3` — `import { formatPrice } from '../lib/catalog'`
- `HomeBundlesSection.astro:3` — `import { formatPrice } from '../lib/catalog'`
- `CategoryCatalogPage.astro` — (verificar)
- `ProductDetail.astro` — (verificar)

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

- `astro-poc/src/lib/catalog.ts` — eliminar `formatPrice`, exportar `normalizeCategoryToken`
- `astro-poc/src/lib/formatting.ts` — mantener `formatCurrency` como canónica
- `astro-poc/src/components/ProductCard.astro` — actualizar import
- `astro-poc/src/components/HomeBundlesSection.astro` — actualizar import
- `tools/utils/product-contract.js` — importar `normalizeCategoryToken` desde catalog.ts
- `astro-poc/src/scripts/storefront.js` — eliminar código spike o promoverlo
- `tools/*.js` (11 archivos CJS) — renombrar a `.cjs` y actualizar `package.json` scripts

**Out of scope**:

- `src/js/` — código legacy, no se modifica
- `admin/` — Python, no se modifica
- `astro-poc/src/data/` — datos fuente

## Git workflow

- Branch: `advisor/007-consolidate-duplicates-and-spikes`
- Commit messages:
  - `refactor: consolidate formatPrice into formatCurrency in formatting.ts`
  - `refactor: rename CJS tools to .cjs extension`
  - `refactor: promote or remove spike prototype code from storefront.js`
- No push/PR sin indicación.

## Steps

### Step 1: Consolidar formatPrice → formatCurrency

1. En `formatting.ts`, verificar que `formatCurrency` es la versión canónica (más robusta).
2. En `catalog.ts`, eliminar la función `formatPrice` (líneas 210-217).
3. Actualizar imports en componentes Astro que usaban `formatPrice`:
   - `ProductCard.astro`: `import { formatPrice } from '../lib/catalog'` → `import { formatCurrency } from '../lib/formatting'`
   - `HomeBundlesSection.astro`: mismo cambio
   - Buscar otros imports con `grep -rn "formatPrice" astro-poc/src/`
4. Reemplazar todas las llamadas a `formatPrice(...)` por `formatCurrency(...)`.

**Verify**: `npm run build` → exit 0. `grep -rn "formatPrice" astro-poc/src/` no retorna resultados (excepto en comentarios).

### Step 2: Unificar normalización de categorías

1. En `catalog.ts`, verificar que `normalizeCategoryToken` está exportada (ya lo está).
2. En `tools/utils/product-contract.js`, reemplazar la función interna por:
   ```javascript
   const { normalizeCategoryToken } = require('../../astro-poc/src/lib/catalog.ts');
   ```
   O, si el require de TypeScript no funciona directamente, duplicar la firma de la función con un comment que referencia la fuente canónica en catalog.ts.

**Verify**: `npm run build` → exit 0 (las tools de validación funcionan correctamente)

### Step 3: Renombrar CJS tools a .cjs

1. Identificar los 11 archivos CJS:
   ```bash
   grep -l "require(" tools/*.js | grep -v node_modules
   ```
2. Renombrar cada uno de `.js` a `.cjs` (`git mv`).
3. Actualizar `package.json` scripts que referencian estas tools:
   - `"icons": "node tools/generate-icons.cjs"`
   - `"images:variants": "node tools/generate-image-variants.cjs"`
   - etc.
4. Añadir convención en `tools/README.md` (crear si no existe): "`.mjs` para ESM, `.cjs` para CommonJS. No crear nuevos archivos `.js` en tools/."

**Verify**: `npm run preflight` → exit 0 (las tools renombradas se ejecutan correctamente)

### Step 4: Promover o eliminar código spike

**Opción A (promover)**: Si el product owner confirma que las features de carrito compartible y notificaciones de stock son deseadas:

1. Eliminar marcadores `// --- Spike 008 ---` y `// --- Spike 010 ---`.
2. Reemplazar con comentarios descriptivos: `// Carrito compartible por URL` y `// Notificaciones de stock`.
3. Eliminar `globalThis.toggleFavorite = toggleFavorite` (línea ~289) — exposición innecesaria.

**Opción B (eliminar)**: Si son experimentos descartados:

1. Eliminar líneas 153-208 (Spike 008 completo).
2. Eliminar líneas 210-291 (Spike 010 completo).
3. Eliminar llamada a `loadCartFromUrl()` en `initStorefront` (línea ~1483).
4. Eliminar `globalThis.toggleFavorite = toggleFavorite`.

**Por defecto, aplicar Opción A** (promover) porque las funciones ya están implementadas y `loadCartFromUrl` se ejecuta en producción.

**Verify**: `npm run lint` → exit 0. `npm run build` → exit 0.

### Step 5: Validación completa

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

## Test plan

1. **formatCurrency**: verificar que `test/formatting.spec.js` sigue pasando.
2. **Cambios en componentes**: `npm run build` cubre la verificación de que los imports son correctos.
3. **Tools renombradas**: ejecutar `npm run preflight` y verificar que todas las tools se ejecutan.
4. **Código spike**: si se promueve (Opción A), verificar que `npm test` no rompe. Si se elimina (Opción B), verificar que `grep -rn "encodeCart\|decodeCart\|loadCartFromUrl\|toggleFavorite" astro-poc/src/` no retorna ocurrencias.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm test` exits 0
- [ ] `grep -rn "formatPrice" astro-poc/src/` no retorna resultados
- [ ] `tools/*.js` ya no contiene archivos CJS con extensión `.js` (ahora son `.cjs`)
- [ ] `package.json` scripts referencian las tools con extensión `.cjs`
- [ ] Código spike en `storefront.js` está promovido (marcadores eliminados) o eliminado
- [ ] No files outside the in-scope list are modified

## STOP conditions

- Si `npm run build` falla porque algún componente Astro no encuentra `formatCurrency`.
- Si alguna tool renombrada a `.cjs` falla al ejecutarse desde `npm run preflight`.
- Si `tools/utils/product-contract.js` no puede importar de `catalog.ts` (TypeScript en contexto CJS).
- Si el product owner no está disponible para decidir Opción A vs B para el código spike — aplicar Opción A por defecto.

## Maintenance notes

- `formatCurrency` debe ser la ÚNICA función de formato de precio en el código base. Si en el futuro se necesita otro locale, parametrizar en lugar de duplicar.
- Si se añaden más tools, documentar en `tools/README.md` la convención `.mjs`/`.cjs`.
- Si el carrito compartible se itera, las funciones `encodeCart`/`decodeCart` deben estabilizar su formato (actualmente base64 de JSON — considerar un formato más compacto para URLs largas).
