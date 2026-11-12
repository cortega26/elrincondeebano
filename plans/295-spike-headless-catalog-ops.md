# Plan 295 (spike): Punto de entrada headless para operaciones de catálogo — editar y subir fotos sin el admin y sin reimplementar reglas

> **Executor instructions**: Este es un plan de **diseño/spike**: el entregable es un documento de diseño
> y un prototipo mínimo **sin cablear** a CI. Sigue los pasos, ejecuta cada verificación y, ante una
> STOP condition, detente y reporta. Al terminar, actualiza la fila de estado en `plans/README.md` —
> salvo que un reviewer te haya despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 6d0a29af..HEAD -- admin/content-manager/src/domain/products/productService.ts admin/content-manager/scripts/ tools/sync-avif-assets.js tools/gap-fill-image-variants.js admin/content-manager/src/server/services/mediaJobs.ts`

## Status

- **Priority**: P3 (dirección)
- **Effort**: M (spike; el build posterior es otro plan)
- **Risk**: LOW (no cambia comportamiento existente)
- **Depends on**: `plans/284-generated-catalog-copies.md` (el diseño asume PRs de un solo archivo), `plans/288-catalog-docs-and-agent-context.md` (el runbook es el lugar donde se documentará el resultado)
- **Category**: direction
- **Planned at**: commit `6d0a29af`, 2026-11-12 (Auditoría 13)

## Why this matters

Desde octubre, **todas** las ediciones de catálogo llegan como PRs hechas por
un agente remoto vía la API de GitHub; el admin no publica desde el
2026-09-18. Evidencia en `data/product_data.json` (`origin/main`):
180 sellos `field_last_modified.*.by = "git"` y 11 `"catalog-maintenance"` —
valores que **ningún código** produce (el admin escribe `"admin"`,
`productService.ts:~175`): los agentes reescriben a mano el sellado de
revisiones y las reglas de dominio (p. ej. la PR #525 comprobó a mano
"CLP 2.000 − 200 = 1.800"). Para una foto, la PR #526 creó y luego borró un
workflow de un solo uso con `contents: write` que descargó una imagen con
`curl`, la procesó con parámetros propios (AVIF q53) distintos del pipeline
canónico (`tools/sync-avif-assets.js`: q50/effort 4; admin `mediaJobs.ts`:
q60) y empujó como `github-actions[bot]`. Un punto de entrada que reutilice
`ProductService` y el pipeline canónico daría a esos agentes (y al operador)
las mismas reglas que el admin, sin crear workflows privilegiados ad hoc.

## Current state

- `admin/content-manager/src/domain/products/productService.ts`:
  - `class ProductService` (línea 135) con `enable()/disable()`; `create(catalog, input)` (150) y
    `edit(catalog, { entityId, baseRevision, changes })` (212) son funciones sobre un `ProductCatalog` en memoria:
    validan con zod, sellan `rev` y `field_last_modified` (con `by: 'admin'`), y aplican los guardas de
    precio/descuento (≈95-120). No dependen de Fastify ni de React.
  - `EditProductParams` (`domain/products/*.ts:28-32`): `{ entityId: string; baseRevision: number; changes: EditProductInput }`.
- Scripts headless existentes que reutilizan el dominio (precedente):
  `admin/content-manager/scripts/backfill-product-ids.ts` (usa `writeJsonFileAtomic` y `productCatalogSchema`; se corre con `node --import tsx …`),
  `migrate-catalog.mjs`, `rotate-credential.mjs`.
- Pipeline de imágenes canónico: `npm run images:avif` (`tools/sync-avif-assets.js`, `quality = 50`, `effort = 4`) y
  `npm run images:gap-fill` (`tools/gap-fill-image-variants.js`); el admin genera AVIF con `quality: 60` (`mediaJobs.ts:~55`).
- `images.yml` (tras el plan 280) corre solo en `main` para `assets/images/originals/**` y abre un PR.
- Esquema: `admin/content-manager/src/shared/schemas/product.ts:7` acepta cualquier string no vacío en `by`.
- ADRs relevantes: `docs/adr/0009-catalog-data-authority.md` (autoridad de `data/`; enmienda del plan 284),
  `docs/adr/0010-private-funnel-measurement.md` (no transmitir datos), `docs/adr/0011-private-whatsapp-comms-module.md` (el admin sigue siendo necesario por comms).

## Commands you will need

| Purpose     | Command                                                                | Provenance       | Expected on success |
| ----------- | ---------------------------------------------------------------------- | ---------------- | ------------------- |
| Install     | `HUSKY=0 npm ci`                                                       | declared         | exit 0              |
| Admin tests | `npm run admin:test`                                                   | declared         | verde               |
| Typecheck   | `npm run admin:typecheck`                                              | declared         | exit 0              |
| Prototipo   | `node --import tsx admin/content-manager/scripts/catalog-op.ts --help` | declared (nuevo) | uso impreso         |
| Lint md     | `npm run lint:md`                                                      | declared         | 0                   |

## Scope

**In scope**:

- `docs/architecture/CATALOG_OPS.md` (crear — documento de diseño)
- `admin/content-manager/scripts/catalog-op.ts` (crear — prototipo **solo** `edit` de campos simples, modo `--dry-run` por defecto)
- `admin/content-manager/test/contract/catalogOpScript.test.ts` (crear)

**Out of scope** (explícitamente; son decisiones del documento, no del spike):

- Workflows nuevos (`workflow_dispatch`), tokens, ingestión de imágenes por URL, cambios a `images.yml`.
- Cambiar `by: 'admin'` en `ProductService` o el esquema.
- Retirar o reducir el admin.

## Git workflow

- Branch: `advisor/295-spike-catalog-ops`.
- Commits: `docs(architecture): catalog ops entry point design (plan 295)`, `feat(admin): dry-run catalog-op prototype (plan 295)`.

## Steps

### Step 0: Baseline

Confirma 284 (`git ls-files astro-poc/src/data/products.json` vacío). Install, admin tests, typecheck.

### Step 1: Inventario de evidencia

Recolecta y pega en el documento (sección "Evidencia"):

- `git log origin/main --since=2026-10-01 --format='%h %ad %s' --date=short -- data/product_data.json`;
- conteo de valores de `by` en `field_last_modified` (script Node de 10 líneas sobre `data/product_data.json`);
- lista de PRs de catálogo desde 2026-10-01 (`gh pr list --state merged --search "catalog in:title" --limit 30 --json number,title,mergedAt`).

**Verify**: números concretos en el borrador (no estimaciones).

### Step 2: Documento de diseño `docs/architecture/CATALOG_OPS.md`

Español neutral, ≤ 200 líneas, con estas secciones obligatorias:

1. **Problema** (con la evidencia del Step 1).
2. **Superficies candidatas** y trade-offs: (A) CLI `npm run catalog:op` para agentes con shell;
   (B) `workflow_dispatch` con inputs tipados que abre un PR (para agentes sin shell, que es el caso observado);
   (C) ambos sobre el mismo núcleo. Recomienda una con razones.
3. **Contrato del núcleo**: entrada (id, campo, valor, `baseRevision`), salida (diff + catálogo validado),
   reutilización de `ProductService.edit/create` y del esquema zod; qué valor de `by` usar (propuesta: `'cli'`,
   documentado en el esquema) y por qué no imitar `'admin'`.
4. **Imágenes**: cómo ingerir una foto aportada por el operador por el pipeline canónico (qué script, qué
   parámetros — y la decisión pendiente de unificar q50 vs q60). Si se acepta una URL remota: allowlist de
   dominios, tope de tamaño, verificación de magic bytes (reutilizar el sniffing de media del admin; cita el archivo),
   y que **nunca** se crea un workflow con permisos de escritura por foto.
5. **Seguridad del modo (B)**: permisos mínimos, inputs por `env:` (nunca `${{ }}` en `run:`), solo rama nueva + PR,
   y la interacción con el ruleset del plan 281 (los PRs creados con `GITHUB_TOKEN` no disparan CI).
6. **Preguntas abiertas** con dueño (operador/ingeniería) — mínimo 5.
7. **Plan de construcción** propuesto en 2–3 planes futuros con esfuerzo grueso.

**Verify**: `npm run lint:md` → 0; las 7 secciones presentes.

### Step 3: Prototipo `catalog-op.ts` (solo edición, dry-run)

`node --import tsx admin/content-manager/scripts/catalog-op.ts edit --id <id> --field price --value 3600 [--write]`:

- lee `data/product_data.json` (raíz resuelta como en `backfill-product-ids.ts:resolveRepoRoot`), valida con `productCatalogSchema`;
- llama `new ProductService()` + `enable()` + `edit(catalog, { entityId, baseRevision: <rev actual del producto>, changes: { [field]: valorParseado } })`;
- campos permitidos en el prototipo: `price`, `discount`, `stock`, `description` (rechaza otros con mensaje claro);
- sin `--write`: imprime el diff JSON del producto (antes/después) y sale 0; con `--write`: además incrementa `rev`/`last_updated`
  del catálogo como hace la ruta del admin (lee la ruta de edición en `src/server/routes/` para replicar exactamente el sellado de catálogo)
  y escribe con `writeJsonFileAtomic`.
- Errores del servicio (404/409/422) → mensaje + exit 1.

Test `test/contract/catalogOpScript.test.ts`: sobre un catálogo temporal, dry-run no modifica el archivo; `--write` cambia el precio, sube `rev`
del producto y del catálogo, y un descuento > precio sale con exit 1 (guard del dominio). Importa la función principal (exporta `runCatalogOp(args, { repoRoot })`),
no ejecutes un proceso hijo.

**Verify**: test verde; admin tests y typecheck verdes; `--help` imprime el uso.

### Step 4: Cierre

Añade al final del documento una sección "Resultado del spike" con: qué funcionó del prototipo, qué faltó, y la recomendación final.
Añade en `docs/operations/CATALOG_CHANGES.md` (si existe, plan 288) una línea "Prototipo experimental: ver `docs/architecture/CATALOG_OPS.md`".

## Test plan

- `catalogOpScript.test.ts`: dry-run inmutable, write con sellado, guard de descuento.

## Done criteria

- [ ] `docs/architecture/CATALOG_OPS.md` con las 7 secciones + "Resultado del spike"; lint:md 0
- [ ] Prototipo con `--dry-run` por defecto y test verde
- [ ] Ningún workflow nuevo ni cambio en `ProductService`/esquema (`git diff --name-only main...HEAD` ⊆ In scope + la línea en `CATALOG_CHANGES.md`)
- [ ] Fila 295 en `plans/README.md` con la recomendación en una línea

## STOP conditions

- `ProductService.edit` exige dependencias de servidor (repos, Fastify) para funcionar — reporta: el diseño debe cambiar.
- El sellado del catálogo (`rev`/`last_updated`) no está en un lugar reutilizable y replicarlo exigiría copiar lógica de rutas: documenta la brecha en el diseño y no la copies en el prototipo (deja `--write` deshabilitado).

## Maintenance notes

- El prototipo es experimental; no lo uses en CI hasta que un plan de construcción lo apruebe.
- **Deferred:** la superficie (B) `workflow_dispatch` e ingestión de imágenes por URL — dependen de la recomendación de este spike.
