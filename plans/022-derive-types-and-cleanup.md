# Plan 022: Derivar tipos desde Zod schemas + eliminar código muerto en catalog.ts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
>
> ```
> git diff --stat 633eeb8..HEAD -- astro-poc/src/lib/catalog.ts astro-poc/src/lib/data-schemas.ts
> ```
>
> If files changed, compare excerpts against live code; on mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plan 013 (Astro version correct), plan 018 (toca catalog.ts — coordinar orden)
- **Category**: tech-debt
- **Planned at**: commit `633eeb8`, 2026-07-14

## Why this matters

Tres problemas de deuda técnica en los tipos del catálogo:

1. **TD-N03** — `catalog.ts` define interfaces TypeScript manuales (`ProductRecord`, `ProductCatalog`, `CategoryRecord`, etc.) mientras que `data-schemas.ts` define schemas Zod equivalentes con `z.infer`. Son dos fuentes de verdad. Si divergen, Zod validará correctamente pero TypeScript aceptará datos inválidos (o viceversa). Además, `ProductRecord` en `catalog.ts:31` tiene `[key: string]: unknown`, un escape hatch que derrota el type-checking.

2. **TD-N09** — `getHomeHighlightedCategories()` en `catalog.ts:455-457` es un wrapper muerto que solo retorna `getHomePrimaryCategories()`. No tiene callers.

3. **TD-N04** — `src/js/` contiene ~32 archivos sin imports desde `astro-poc/`. Son código legacy que consume mantenimiento (lint, typecheck) sin servir al sitio en producción.

## Current state

### TD-N03: Tipos duplicados

`astro-poc/src/lib/catalog.ts:16-31`:

```typescript
export type ProductRecord = {
  name: string;
  description?: string;
  price?: number;
  // ...
  [key: string]: unknown; // ← escape hatch
};
```

`astro-poc/src/lib/data-schemas.ts:12-26`:

```typescript
export const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().nonnegative().optional(),
  // ...
});
export type ProductRecord = z.infer<typeof productSchema>;
```

### TD-N09: Dead wrapper

`astro-poc/src/lib/catalog.ts:455-457`:

```typescript
export function getHomeHighlightedCategories(): NavGroup['categories'] {
  return getHomePrimaryCategories();
}
```

### TD-N04: Dead src/js/

`src/js/` contiene 32 archivos. `BaseLayout.astro` solo importa `astro-poc/src/scripts/storefront.js`. Ningún archivo en `astro-poc/src/` importa de `src/js/`. Solo 5 archivos de test y referencias internas dentro de `src/js/` importan esos módulos.

## Commands you will need

| Purpose   | Command             | Expected on success |
| --------- | ------------------- | ------------------- |
| Build     | `npm run build`     | exit 0              |
| Typecheck | `npm run typecheck` | exit 0, no errors   |
| Lint      | `npm run lint`      | exit 0              |
| Test      | `npm test`          | all pass            |
| E2E       | `npm run test:e2e`  | all pass            |

## Scope

**In scope**:

- `astro-poc/src/lib/catalog.ts` — reemplazar interfaces manuales por tipos inferidos de Zod, eliminar `getHomeHighlightedCategories`
- `astro-poc/src/lib/data-schemas.ts` — exportar `z.infer` types como fuente canónica
- `src/js/` — eliminar archivos no referenciados (solo si el paso 3 confirma que son dead code)

**Out of scope** (do NOT touch):

- `content.config.ts` — ya importa de `data-schemas.ts`, no debería necesitar cambios
- Componentes Astro — no se modifican
- Tests de `src/js/` — se actualizan imports pero no se eliminan si los módulos migran

## Git workflow

- Branch: `advisor/022-derive-types-and-cleanup`
- Three commits:
  1. `refactor(types): derive catalog types from Zod schemas, remove index signature`
  2. `chore(catalog): remove dead getHomeHighlightedCategories wrapper`
  3. `chore(src): remove dead src/js/ modules not imported by astro-poc`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Derivar tipos desde Zod

En `data-schemas.ts`, confirmar que todos los tipos están exportados como `z.infer`. Ya lo están (líneas 96-102).

En `catalog.ts`, reemplazar las definiciones de tipo manuales por imports desde `data-schemas.ts`:

```typescript
// Reemplazar interfaces manuales por:
import type {
  ProductRecord,
  ProductCatalog,
  CategoryRecord,
  CategoryRegistry,
  StorefrontExperience,
  StorefrontBundleRecord,
  StorefrontTrustItem,
} from './data-schemas';
```

Eliminar las definiciones de tipo manuales (`ProductRecord`, `ProductCatalog`, `CategoryRecord`, `NavGroupRecord`, `CategoryRegistry`, `StorefrontTrustItem`, `StorefrontBundleRecord`, `StorefrontExperience`) de `catalog.ts`.

Mantener los tipos que NO tienen schema Zod y son específicos de catalog.ts:

- `ProductImageVariant`
- `ProductWithSku`
- `NavGroup`
- `ProductReference`
- `StorefrontBundle`
- `ResponsiveImageSource`
- `StorefrontCompanionRule`

**Importante**: El `ProductRecord` de Zod NO tiene `[key: string]: unknown`. Verificar que el código en `catalog.ts` que accede a propiedades dinámicas de `ProductRecord` no dependa del index signature. Si hay código que usa `product[key]`, adaptarlo para usar accesos tipados o type assertions localizados.

**Verify**: `npm run typecheck` → exit 0, no errors.

### Step 2: Eliminar getHomeHighlightedCategories

En `catalog.ts`, eliminar líneas 455-457:

```typescript
export function getHomeHighlightedCategories(): NavGroup['categories'] {
  return getHomePrimaryCategories();
}
```

**Verify**: `npm run typecheck && npm run build` → exit 0.

### Step 3: Auditar y eliminar src/js/ dead code

Verificar qué archivos en `src/js/` NO son importados por ningún archivo fuera de `src/js/` y `test/`:

```bash
# Encontrar todos los imports de src/js/ desde fuera de src/js/ y test/
grep -rn "from.*src/js/" --include='*.{js,mjs,ts,astro}' --exclude-dir='src/js' --exclude-dir='test' --exclude-dir='node_modules' .
```

Si el resultado es vacío (ningún archivo fuera de `src/js/` y `test/` importa de `src/js/`), entonces `src/js/` es dead code para el runtime de producción.

**Acción condicional**: Si es dead code:

1. Mover `src/js/` a `_archive/src-js-legacy/` (no eliminar — mantener como referencia)
2. Actualizar `.gitignore` si es necesario
3. Actualizar `eslint.config.cjs` para remover reglas específicas de `src/js/` si las hay
4. Mover tests que solo aplican a `src/js/` a `_archive/` también

**Verify**: `npm run build && npm run lint && npm test && npm run test:e2e` → todos exit 0.

### Step 4: Validación completa

```bash
npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e
```

**Verify**: todos exit 0.

## Test plan

- `npm run typecheck` — verifica que los tipos inferidos de Zod son compatibles con todos los usos en `catalog.ts` y componentes Astro.
- `npm test` — verifica que no hay regresiones en funciones del catálogo.
- Si `src/js/` se archiva, los tests que dependían de esos módulos deben actualizarse para apuntar a los módulos activos en `astro-poc/`.

## Done criteria

All must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run test:e2e` exits 0
- [ ] `grep -rn "export type ProductRecord" astro-poc/src/lib/catalog.ts` no encuentra matches (los tipos vienen de data-schemas.ts)
- [ ] `grep -rn "getHomeHighlightedCategories" astro-poc/src/` no encuentra matches
- [ ] `grep -rn "\[key: string\]: unknown" astro-poc/src/lib/catalog.ts` no encuentra matches en ProductRecord
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Los tipos inferidos de Zod causan errores de typecheck en `catalog.ts` porque el código depende del index signature `[key: string]: unknown`. En ese caso, añadir type assertions localizados (`as any`) con comentarios que expliquen por qué, o extender el schema Zod para incluir un catch-all.
- `grep -rn "from.*src/js/"` (fuera de `src/js/` y `test/`) encuentra imports — significa que `src/js/` NO es dead code. No archivar. Reportar qué archivos importan de `src/js/` para análisis manual.
- `npm test` falla después de archivar `src/js/` porque tests dependen de módulos legacy — esos tests deben migrarse (plan 024) antes de archivar.

## Maintenance notes

- Después de este plan, la ÚNICA fuente de verdad para tipos de datos del catálogo es `data-schemas.ts`. Cualquier cambio al schema de datos debe hacerse allí, y `z.infer` propagará los tipos automáticamente.
- Si `src/js/` se archiva en lugar de eliminarse, mantener `_archive/src-js-legacy/` por 90 días y luego eliminar.
- Los tipos que permanecen en `catalog.ts` (`NavGroup`, `ProductWithSku`, `StorefrontBundle`, etc.) son tipos derivados/de presentación, no de datos crudos — eso es correcto.
