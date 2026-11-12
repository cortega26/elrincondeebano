# Plan 290: Integridad del admin — sin fantasmas tras un 422, OG de categoría que funciona, idempotencia que no bloquea reintentos

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 6d0a29af..HEAD -- admin/content-manager/src/server/routes/storefront.ts admin/content-manager/src/server/routes/catalog-command.ts admin/content-manager/src/server/services/mediaJobs.ts admin/content-manager/src/server/repositories/productRepository.ts admin/content-manager/src/server/routes/categoryCrudRoutes.ts admin/content-manager/src/server/services/changeSetApplier.ts`

## Status

- **Priority**: P3 (el admin no publica desde el 2026-09-18; los bugs son reales pero de baja frecuencia)
- **Effort**: S–M (cuatro arreglos S independientes)
- **Risk**: LOW
- **Depends on**: none. Serializar con `plans/291-admin-publication-robustness.md` solo si ambos tocan el mismo archivo (no deberían).
- **Category**: bug
- **Planned at**: commit `6d0a29af`, 2026-11-12 (Auditoría 13)

## Why this matters

Cuatro defectos verificados en el servidor del Content Manager:

1. **Fantasmas tras un 422**: los PUT de storefront mutan el objeto que
   devuelve la caché del repositorio **antes** de validar. Si la validación
   falla (422), el archivo no se escribe pero la caché (clave mtime+size) sigue
   válida y ahora contiene lo rechazado: `GET /storefront/bundles` sirve los
   bundles rechazados como si estuvieran guardados y los PUT siguientes fallan
   por datos que el operador nunca guardó. Lo mismo ocurre en los comandos de
   registro de categorías (un batch que falla a mitad deja upserts parciales en
   caché que el siguiente comando exitoso persiste).
2. **OG de categoría siempre falla**: `runOgTool` lanza
   `python3 -m tools.category_og`, módulo borrado en el plan 156 (portado a
   `tools/generate-category-og.mjs`). Toda creación/borrado de categoría genera
   un intent de OG que falla en silencio (los tests inyectan un runner falso).
3. **Idempotencia que bloquea**: `ProductRepository.writeCatalog` guarda de
   forma persistente también los resultados `conflict` y `error`, y responde
   409 sin mensaje cuando se repite el mismo `commandId`. Varias rutas usan
   ids fijos por operación (`reassign-<id>-<to>`, `media-<intent>`,
   `import-<preview>`): tras un fallo, el reintento nunca puede tener éxito;
   y una reasignación repetida dentro de las últimas 200 operaciones devuelve
   el `ok` guardado sin escribir productos mientras el borrado de la categoría
   sí corre.
4. **Change-sets**: un `create` acepta un `id` ya existente y asigna
   `order = products.length`, que puede colisionar.

## Current state

- `admin/content-manager/src/server/routes/storefront.ts:45-66` (PUT bundles):
  ```ts
    const existing = repos.storefront.load();
    existing.bundles = body.bundles;
    // Plan 066 step 1: strict invariants + product reference checks.
    const catalog = repos.products.loadCatalog();
    const validated = validateStorefrontCuration(existing, catalog.products);
    if (!validated.ok) {
      return reply.status(422).send({ ... });
    }
    const wrote = repos.storefront.write(existing);
  ```
  y líneas 86-115 (PUT featured): mismo patrón con `existing.home.featuredStaples/primaryCategories/secondaryCategories = …`.
- `admin/content-manager/src/server/repositories/storefrontRepository.ts:30-37` — comentario del plan 150: la caché devuelve **la misma identidad de objeto** (un test lo asserta con `toBe`) porque "callers do not mutate the returned experience in place". Las dos rutas de arriba sí lo mutan.
- `admin/content-manager/src/server/routes/catalog-command.ts:23-46` — `runRegistryCommand`: `const registry = load();` y luego `await apply(registry)`; si `apply` falla, devuelve el error sin escribir. `load` es `repos.categories.load()` → `JsonFileRepository.load()` (`jsonFileRepository.ts:53-62`) devuelve `this.cache.data` (mismo objeto) si mtime+size no cambiaron.
- `admin/content-manager/src/server/services/mediaJobs.ts:95-125` — `runOgTool(repoRoot, slug, operation)`:
  ```ts
  const args =
    operation === 'generate'
      ? ['-m', 'tools.category_og', '--one', slug, '--repo-root', repoRoot]
      : ['-m', 'tools.category_og', '--delete', slug, '--repo-root', repoRoot];
  const child = spawn('python3', args, { cwd: repoRoot, shell: false, timeout: 60_000 });
  ```
  `tools/category_og/` ya no tiene `.py` (solo `render_jpg.mjs`, `render_raster_jpg.mjs`, `__pycache__/` no versionado).
  Reemplazo existente: `tools/generate-category-og.mjs` con la misma interfaz:
  `node tools/generate-category-og.mjs --one <slug> [--repo-root <path>]` y `--delete <slug> [--repo-root <path>]` (líneas 56-57 de su ayuda).
  Comentarios que mencionan el tool Python: `mediaJobs.ts`, `services/categoryOgLifecycle.ts:12`, `test/integration/mediaWorkbench.test.ts:521`, `test/integration/categoryMutationApi.test.ts:502`.
- `admin/content-manager/src/server/repositories/productRepository.ts:133-170` — `writeCatalog(data, commandId, baseRevision)`:
  ```ts
    if (this.idempotencyStore?.has(commandId)) {
      const cached = this.idempotencyStore.get(commandId)!;
      return {
        ok: cached.status === 'ok',
        statusCode: cached.status === 'ok' ? 200 : 409,
      };
    }
    const release = await this.lock.acquire();
    ...
      if (current.rev !== baseRevision) {
        ...
        this.idempotencyStore?.set(commandId, { command_id: commandId, status: 'conflict' });
        return result;
      }
      const writeResult = this.writer.write(data, commandId);
      if (!writeResult.success) {
        this.idempotencyStore?.set(commandId, { command_id: commandId, status: 'error', warnings: [...] });
        return { ok: false, error: ..., statusCode: 500 };
      }
  ```
  El store persistente (`services/persistentIdempotencyStore.ts`) es un FIFO de 200 entradas.
- Ids fijos: `categoryCrudRoutes.ts:~153-157` (`` `reassign-${id}-${body.reassign_to}` ``), `mediaApplyRoutes.ts:~149-155` (`` `media-${intent.id}` ``), `importRoutes.ts:~344-347` (`` `import-${preview_id}` ``).
- `admin/content-manager/src/server/services/changeSetApplier.ts:84-90`:
  ```ts
  const productRecord = {
    ...parsed.data,
    id: parsed.data.id ?? generateProductId(),
    order: catalog.products.length,
    rev: 1,
  };
  ```
  `domain/products/productService.ts:~157-158` usa `max(order)+1` (patrón correcto).
- Tests de integración ejemplares: `admin/content-manager/test/integration/storefrontCuration.test.ts`
  (app real sobre un repo temporal), `categoryMutationApi.test.ts`, `changeSetWorkflow.test.ts`,
  `mediaWorkbench.test.ts`.

## Commands you will need

| Purpose     | Command                                                                                                                                                                                                                    | Provenance | Expected on success |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install     | `HUSKY=0 npm ci`                                                                                                                                                                                                           | declared   | exit 0              |
| Admin foco  | `npm -w admin/content-manager exec vitest run test/integration/storefrontCuration.test.ts test/integration/categoryMutationApi.test.ts test/integration/changeSetWorkflow.test.ts test/integration/mediaWorkbench.test.ts` | declared   | verde               |
| Admin suite | `npm run admin:test`                                                                                                                                                                                                       | declared   | verde (~879)        |
| Typecheck   | `npm run admin:typecheck`                                                                                                                                                                                                  | declared   | exit 0              |
| Lint        | `npm run admin:lint`                                                                                                                                                                                                       | declared   | exit 0              |
| OG CLI      | `node tools/generate-category-og.mjs --one bebidas --dry-run`                                                                                                                                                              | declared   | exit 0              |

## Scope

**In scope**:

- `admin/content-manager/src/server/routes/storefront.ts`
- `admin/content-manager/src/server/routes/catalog-command.ts`
- `admin/content-manager/src/server/services/mediaJobs.ts` (+ comentario en `categoryOgLifecycle.ts`)
- `admin/content-manager/src/server/repositories/productRepository.ts`
- `admin/content-manager/src/server/routes/categoryCrudRoutes.ts`, `mediaApplyRoutes.ts`, `importRoutes.ts` (solo los `commandId`)
- `admin/content-manager/src/server/services/changeSetApplier.ts`
- Tests de integración bajo `admin/content-manager/test/integration/` (nuevos casos; actualizar los 2 comentarios que mencionan Python)

**Out of scope**:

- `storefrontRepository.ts` (mantiene la identidad de caché pineada por un test; el arreglo es en las rutas).
- `jsonFileRepository.ts` (el clon va en `runRegistryCommand`, un solo punto).
- Flujo de publicación / git / scheduler: plan 291.
- `tools/generate-category-og.mjs` (se usa tal cual).

## Git workflow

- Branch: `advisor/290-admin-integrity`.
- Un commit por defecto, p. ej. `fix(admin): validate storefront edits on a clone (plan 290)`.

## Steps

### Step 0: Baseline

Install, admin suite, typecheck, lint; `node tools/generate-category-og.mjs --one bebidas --dry-run` → exit 0
(si el flag `--dry-run` no existe o falla → anota la salida y STOP: el reemplazo no es usable).

### Step 1: Validar sobre un clon (storefront y registro)

1. En ambos PUT de `storefront.ts`: `const existing = structuredClone(repos.storefront.load());`.
2. En `runRegistryCommand` (`catalog-command.ts:41`): `const registry = structuredClone(load());` con
   comentario `// Plan 290: never mutate the repository cache before the write succeeds.`
3. Tests nuevos:
   - `storefrontCuration.test.ts`: PUT `/storefront/bundles` con un bundle inválido → 422; luego GET devuelve los bundles originales (deep-equal con el estado previo).
     Lo mismo para PUT featured con un staple inexistente.
   - `categoryMutationApi.test.ts` (o el archivo del batch): batch con un upsert válido seguido de un delete de id inexistente → 404; luego GET del registro no contiene el upsert; un comando exitoso posterior tampoco lo persiste.

**Verify**: los tests nuevos **fallan** antes del cambio (demuéstralo con `git stash` del código) y pasan después; admin foco verde.

### Step 2: OG de categoría con el tool Node

En `runOgTool`: `spawn(process.execPath, ['tools/generate-category-og.mjs', operation === 'generate' ? '--one' : '--delete', slug, '--repo-root', repoRoot], { cwd: repoRoot, shell: false, timeout: 60_000 })`.
Actualiza los comentarios que mencionan `python3`/`tools.category_og` en `mediaJobs.ts`, `categoryOgLifecycle.ts:12`,
`mediaWorkbench.test.ts:521` y `categoryMutationApi.test.ts:502`.
Añade un test de integración que ejecute el runner **real** (sin stub) para `--delete` de un slug inexistente en un repo temporal
y asserte que el proceso termina con código 0 o con un error del tool Node (no `ENOENT` de python/módulo):
el objetivo es probar que se invoca el tool correcto. Si el tool necesita archivos del repo que el temporal no tiene,
usa `repoRoot` = raíz real con `--dry-run`.

**Verify**: `grep -rn "python3\|tools.category_og" admin/content-manager/src` → sin match; test nuevo verde.

### Step 3: Idempotencia honesta

1. `writeCatalog`: guarda en el store **solo** resultados `ok`. Para `conflict`/`error` no hagas `set`
   (elimina esas dos llamadas). El atajo inicial solo aplica a entradas `ok` (si por datos antiguos hay
   una entrada no-ok, ignórala y sigue al lock). Corrige el comentario de la línea ~65 que dice
   "writeCatalog re-checks under the mutation lock" para que describa lo que pasa.
2. Ids por intento: `` `reassign-${id}-${body.reassign_to}-${randomUUID()}` ``,
   `` `media-${intent.id}-${randomUUID()}` ``, `` `import-${preview_id}-${randomUUID()}` ``
   (`import { randomUUID } from 'node:crypto'`). La protección contra doble aplicación de media/import
   ya la dan sus propios estados (`intent.status = 'applied'`, preview consumido) — verifica que existan antes
   de cambiar; si alguno depende SOLO del commandId fijo para no aplicar dos veces → STOP.
3. Tests: (a) un `writeCatalog` con base_rev viejo → 409; el mismo `commandId` con base_rev correcto → 200 (antes: 409 eterno);
   (b) reasignar A→B, recrear A, reasignar A→B otra vez → los productos se reasignan las dos veces.

**Verify**: admin foco + suite verdes.

### Step 4: Change-set `create` sin colisiones

En `changeSetApplier.ts`: si `parsed.data.id` existe en `catalog.products` → error 409 `DUPLICATE_ID`
(mismo shape de error que los otros fallos del applier); `order: Math.max(-1, ...catalog.products.map((p) => p.order ?? -1)) + 1`.
Test en `changeSetWorkflow.test.ts`: create con id existente → 409; create tras un purge → `order` no repetido.

**Verify**: verde.

### Step 5: Regresión

Admin suite completa, typecheck, lint; `npm run admin:test:e2e` si el entorno lo permite (si no, anótalo).

## Test plan

- 2 tests de "422 no deja fantasmas" (storefront ×2) + 1 de batch de categorías — demostrados rojos antes.
- 1 test del runner OG real.
- 2 tests de idempotencia, 2 de change-set.

## Done criteria

- [ ] `grep -n "structuredClone(repos.storefront.load())" admin/content-manager/src/server/routes/storefront.ts` → 2 matches
- [ ] `grep -n "structuredClone(load())" admin/content-manager/src/server/routes/catalog-command.ts` → 1
- [ ] `grep -rn "python3" admin/content-manager/src` → sin match
- [ ] `grep -n "status: 'conflict'\|status: 'error'" admin/content-manager/src/server/repositories/productRepository.ts` → sin match
- [ ] Admin suite, typecheck, lint verdes; tests nuevos demostrados rojo→verde (informe)
- [ ] `git diff --name-only main...HEAD` ⊆ In scope; fila 290 en `plans/README.md`

## STOP conditions

- El test de identidad de caché de `storefrontRepository` (plan 150) falla: significa que tocaste el repositorio, no la ruta.
- `tools/generate-category-og.mjs` no acepta `--one/--delete/--repo-root` como documenta.
- Media apply o import dependen solo del `commandId` fijo para no aplicarse dos veces.
- Algún test existente asserta que un `conflict` se cachea (reporta antes de cambiarlo).

## Maintenance notes

- Regla para rutas nuevas: nunca mutar lo que devuelve `repos.*.load()` antes de una escritura exitosa; clonar primero.
- **Deferred:** restaurar backup (`backup/:id/restore`) sin lock y con `rev` hacia atrás — acción explícita del operador; se reabre si se automatiza.
