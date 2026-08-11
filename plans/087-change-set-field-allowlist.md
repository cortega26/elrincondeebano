# Plan 087: Change-set apply field allowlist — proteger rev/order/id/field_last_modified

> Auditoría 8 (2026-08-11). Finding 2. Blocker del retiro de Python.

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: LOW-MED — el allowlist cambia semántica de apply solo para claves ajenas; los flujos legítimos (edit/undo/redo) ya solo llevan campos registrados
- **Depends on**: —
- **Category**: data integrity / change sets
- **Written against**: commit `cefdd9f`
- **Executed**: DONE — 2026-08-11 (verification abajo)

## Why this matters

`POST /change-sets` acepta `op.data: z.record(z.string(), z.unknown())` y el
applier escribe CADA clave de `data` sobre el producto. Un op crafted con la
credential del operador puede resetear `rev` (rompe el control de concurrencia
de ese producto), reescribir `order` (revuelve el catálogo publicado),
cambiar `id` (detacha history/undo/cola) o fabricar `field_last_modified`.
El revalidado posterior descarta el resultado, así que el objeto mutado se
persiste con las claves inyectadas.

## Current state

- `src/shared/schemas/changeSet.ts:22` — `data: z.record(z.string(), z.unknown())`.
- `src/server/services/changeSetApplier.ts:77-81` — en `op.action === 'edit'`:
  ```ts
  for (const [field, value] of Object.entries(op.data)) {
    before[field] = (product as Record<string, unknown>)[field];
    (product as Record<string, unknown>)[field] = value;
  }
  ```
  Luego `product.rev += 1`; el `productSchema.safeParse` (línea ~90) se ejecuta pero su resultado no detiene el apply.
- Branches `archive`/`restore`/`create` (líneas 82-99) no tocan `data`.

## Scope

**In scope**: `changeSetApplier.ts`, `changeSet.ts` (schema), `changes.ts` (validación en POST), tests.
**Out of scope**: undo/redo (ya usan `data` con campos registrados), conflictos, reorder.

## Steps

### Step 1: Allowlist en el applier

En el branch `edit`, iterar solo sobre las claves permitidas y rechazar el op completo si trae otras:

```ts
const EDITABLE_FIELDS = new Set([
  'name',
  'description',
  'price',
  'discount',
  'stock',
  'category',
  'image_path',
  'image_avif_path',
  'is_archived',
]);
```

Dos opciones (elegir la que preserve mejor el contrato de errores existente, test-driven):

1. Validación estricta en `POST /change-sets` (`changes.ts:119`): op inválido → 422 `INVALID_OP_FIELD` con la lista de claves no permitidas.
2. Guard en el applier: `if (!EDITABLE_FIELDS.has(field)) return { ok: false, ... }`.

Aplicar AMBAS (defensa en profundidad) pero con el mismo código de error para no duplicar el contrato.

**Verificar**: test en `test/contract/changeSet.test.ts` — op con `rev`/`order`/`id`/`field_last_modified`/clave arbitraria en `data` → 422/op rechazado y el producto NO mutado (incluida `rev`); op con campos editables → apply normal.

### Step 2: Revalidación que detiene el apply

En `changeSetApplier.ts`, tras el merge, si `productSchema.safeParse(product)` falla, no persistir: devolver error 422 `INVALID_APPLIED_STATE` con los issues. El resultado del safeParse debe alimentar el estado de la operación, no descartarse.

**Verificar**: test que inyecta `price: "abc"` vía op → apply rechazado, catálogo intacto.

### Step 3: Suite

```bash
npm run admin:test && npm run admin:certify
```

## Test plan

- `test/contract/changeSet.test.ts`: +3 casos (claves prohibidas, clave arbitraria, estado resultante inválido).
- `test/integration/changeSetWorkflow.test.ts`: confirmar que los flujos legítimos (edit con `price`/`stock`, undo/redo) no cambian de comportamiento.

## Done criteria

- [x] Ops con claves fuera del allowlist se rechazan (422) y no mutan nada.
- [x] Estado post-apply inválido según schema detiene la escritura (ya existía — 422 VALIDATION_ERROR; verificado con test).
- [x] Flujos legítimos de edit/undo/redo siguen verdes (suite integrada).

## Evidence (2026-08-11)

- `changeSetApplier.ts`: `EDITABLE_PRODUCT_FIELDS` (9 campos) exportado como única fuente de verdad + `forbiddenOpFields()`; guard en `apply()` para create (allowlist ∪ id) y edit (allowlist estricto) → 422 `INVALID_OP_FIELD`.
- `changes.ts`: validación del mismo allowlist en `POST /change-sets` y `PATCH /change-sets/:id` (PATCH puede reemplazar product_ops).
- Tests: +5 — unit (superficie editable exacta, forbiddenOpFields), integración (POST 6 casos inyectando rev/order/id/field_last_modified/slug/create-rev → 422 y catálogo intacto; create con id explícito → 201; PATCH reemplazo → 422; apply sobre change set escrito directo en disco con `rev` → 422, producto sin mutar — prueba de poder verificada revirtiendo el guard: 200 ≠ 422).
- Suite: 477 tests verdes, e2e admin 19/19 + storefront 44/44, `admin:certify` 30/30 READY, lint 0 errores.

## STOP conditions

- Si algún test existente usa `data` con claves fuera del allowlist (p. ej. `order` en reorder), NO ampliar el allowlist sin revisar el caso con el maintainer — reportar.

## Maintenance notes

Al agregar campos editables al producto (p. ej. `size_value`), actualizar `EDITABLE_FIELDS` y su test en el mismo cambio. Mantener la lista en un solo lugar (exportarla del applier) para que schema y guard no diverjan.
