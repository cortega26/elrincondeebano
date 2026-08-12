# Plan 092: Quick wins de arquitectura y performance

> Auditoría 8 (2026-08-11). Findings 16, 18, 20, 21, 22, 23, 25, M16.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED — toca el write path (validación) y la capa de datos (cache); `performance.test.ts` y `parity.test.ts` son la red
- **Depends on**: —
- **Category**: architecture / performance
- **Written against**: commit `cefdd9f`
- **Executed**: DONE — 2026-08-11 (verification abajo)

## Why this matters

Ocho problemas pequeños con efectos concretos: el edit de `description` no
registra revisión (historia inconsistente); `sharp` sin declarar en el
workspace (npm ci aislado rompe media); cada request re-lee y re-valida el
catálogo completo (17+ call sites); assets sin cache headers y con sourcemap
servido; N+1 en history/import/pull; tres patrones de fetch/validación
compitiendo (con PUT de storefront sin schema); código muerto que invita a
deriva; y el write de producto sin validación de `image_path`
(prefix `assets/images/` + extensiones + fallback AVIF).

## Current state

- `productService.ts:175-181` — branch `description` NO hace `product.rev += 1` ni `field_last_modified` (el resto de campos sí).
- `mediaJobs.ts:5` — `import sharp from 'sharp'`; `admin/content-manager/package.json:25-31` no lo declara (resuelve por hoisting del root).
- `productRepository.ts:38-66` — `loadCatalog` = `readFileSync` + `JSON.parse` + `safeParse` por llamada; 17+ call sites (catalog.ts:116,173,241…; changes.ts:420,436…; storefront.ts:36,82; media.ts:60,404; syncService.ts:218-260; bootstrap.ts:9-29 hace 2 reads de producto + 2 de categoría).
- `app.ts:298-349` — static sin `Cache-Control`/`ETag`; `vite.config.ts:22` `sourcemap: true` (map de 1.6 MB servible); sin `@fastify/compress`.
- N+1: `changes.ts:791-804` (`products.find` por op en history), `:637-644` (2 `find` por update en import), `syncService.ts:239-250` (load+write por cambio).
- Patrones: 3 estilos de fetch en ProductsPage (`client.*`, `fetch`, `fetchWithCredential`); validación zod solo en algunas rutas; `storefront.ts:33` hace `existing.bundles = body.bundles as typeof existing.bundles` sin schema; paginación triplicada (schema `api.ts` sin uso + hand-roll ruta + hand-roll client).
- Muerto: `shared/errors/AppError.ts` sin imports; `shared/schemas/api.ts` (6 exports sin uso); `catalog.ts:807` `storefrontRoutes` sin registrar; `createProductRepository`/`createStorefrontRepository` factories; `categoryRepository.ts:155-157` `countProductsInCategory` stub; `storefrontRepository.ts:85` `getFeaturedStaples`.
- `productSchema` (`shared/schemas/product.ts:22-24`) sin checks de `image_path`.

## Scope

**In scope**: `productService.ts`, `productRepository.ts` (+cache), `mediaJobs.ts` + package.json, `app.ts` (headers estáticos + compress), `vite.config.ts` (sourcemap prod off), `changes.ts`/`syncService.ts` (N+1), `storefront.ts` (+schema), `shared/schemas/*` + `client.ts` (patrón único), borrado de muerto, `productSchema` (image_path), tests.
**Out of scope**: refactor de ProductsPage (plan 094), cache en categorías/storefront si los números no lo justifican (mismo patrón, menor frecuencia).

## Steps

### Step 1: Rev de description

Alinear el branch `description` con el resto de campos en `productService.edit`: `product.rev += 1` + `field_last_modified.description = { ts, by: 'operator', rev, base_rev, changeset_id: null }`.

**Verificar**: test en `test/contract/discountMutation.test.ts` o `productService.test.ts` — edit solo-description avanza rev y registra metadata; history lo muestra.

### Step 2: sharp declarado

Agregar `"sharp": "^0.35.3"` (misma versión que el root) a `admin/content-manager/package.json` dependencies. Verificar que `npm ci` en el workspace aislado (`npm ci -w admin/content-manager` en un clone) resuelve sin hoisting. **Gotcha**: el lockfile del workspace no puede divergir — revisar `npm ci` root tras el cambio.

**Verificar**: `npm ci` root + `npm run admin:test` (los jobs media siguen pasando).

### Step 3: Cache mtime en el data layer

En `productRepository` (y luego `categoryRepository`/`storefrontRepository` si el patrón aplica): cache in-memory `{ mtimeMs, catalog }`; en cada `loadCatalog`, `statSync(filePath).mtimeMs` — si coincide con el cache, devolver el objeto cacheado (clonado por referencia con `structuredClone` solo donde los callers mutan — revisar callers: `productService.edit` muta in-place, así que el cache debe entregar una copia deep o invalidarse en writes). Los writes invalidan el cache siempre. Flag `bypassCache` para tests (`createApp({ cache: false })` o env).

**Verificar**: `test/contract/performance.test.ts:125-171` (inyecta N requests y mide latencia) debe mejorar; test de invalidation: write → cache fresco; edición externa del archivo (mtime cambia) → cache inválido.

### Step 4: Headers estáticos + compress + sourcemap off

- `app.ts`: para el branch `/assets/` con nombre hasheado → `Cache-Control: public, max-age=31536000, immutable`; para index.html y demás → `no-cache`; `ETag` opcional si fácil.
- `@fastify/compress` registrado (deps del workspace admin).
- `vite.config.ts`: `build.sourcemap: false` en producción (o `sourcemap: 'hidden'` si el debug lo exige — NO servir el map públicamente).

**Verificar**: curl headers en clone; bundle servido sin `.map` accesible; e2e sin regresión.

### Step 5: N+1s

- `changes.ts:791-804`: construir `Map<id, product>` una vez (patrón ya usado en import-preview `changes.ts:499-504`).
- `changes.ts:637-644`: un solo `Map` por update.
- `syncService.ts:239-250`: pull en un solo `loadCatalog` + un solo `writeCatalog` (merge todos los changes y escribir una vez).

**Verificar**: `performance.test.ts` o test nuevo con catálogo grande (fixture 500 productos) — history/pull sin crecimiento cuadrático; tests existentes de history/import/pull verdes.

### Step 6: Un patrón de validación + limpiar muerto

- Elegir ganador: **zod en el boundary** (el patrón de `changes.ts:577`, `catalog.ts:528`). Aplicarlo a: PUT storefront (`storefront.ts:33` — schema `storefrontWriteSchema` en `shared/schemas/storefront.ts` con los invariantes del walker existente como segunda capa), envelopes de producto/categoría en catalog.ts, resolve de conflictos (`conflicts.ts:68`).
- Borrar: `AppError.ts` si se decide que el envelope central de errores (plan 090) lo reemplaza — coordinar: si 090 introduce `setErrorHandler` con tipos, migrar servicios a `DomainError` o borrar; `api.ts` muerto → o se cablea `paginationParamsSchema`/`paginatedResponseSchema` en catalog.ts+client.ts (recomendado) o se borra; `storefrontRoutes` muerto → borrar; factories muertos → borrar; `countProductsInCategory` stub → borrar o implementar (usarlo en el delete-check del plan… ya existe plan 088 para el scope — aquí: si nadie lo llama, borrar); `getFeaturedStaples` → borrar.
- Unificar fetch en `client.ts` (usar `fetchWithCredential` internamente; eliminar usos directos de `fetch` en pages).

**Verificar**: typecheck + suite completa; grep de imports de lo borrado = 0; `routePolicy.test.ts` sigue cubriendo las rutas tras borrar `storefrontRoutes`.

### Step 7: image_path validation en producto

En `productSchema` (`shared/schemas/product.ts`): `image_path` debe matchear `^assets/images/.+\.(webp|jpg|jpeg|png|avif|gif)$` (y `image_avif_path` `.avif`; vacío permitido si el campo es opcional — revisar el contrato actual: Python requería el prefijo, TS no). Ajustar `productService`/schemas de import si el contrato lo exige y el parity test (`plans/fixtures/055` goldens) debe seguir pasando — si un golden incumple, reportar antes de debilitar la validación.

**Verificar**: `schemas.test.ts` + casos válidos/inválidos; parity cero diffs.

### Step 8: Suite completa

```bash
npm run admin:test && npm run admin:typecheck && npm run admin:certify && npm run validate
```

## Test plan

Por paso: tests de contrato/integración indicados + regresión de `performance.test.ts`, `parity.test.ts`, `schemas.test.ts`, `media.test.ts`.

## Done criteria

- [x] Edit description avanza rev/metadata (field_last_modified + rev); test.
- [x] `sharp` declarado en el workspace admin (^0.35.3); `npm ci` limpio.
- [x] Cache mtime+size en productRepository con invalidación eager en writes y por stat externo; test.
- [x] Headers immutable para bundles hasheados, max-age=600 para media, sin sourcemaps públicos, `@fastify/compress` activo.
- [x] N+1s eliminados: history (map por id), import apply (maps id+identity), pull de sync (batch 1 load + 1 write, all-or-nothing).
- [x] Storefront PUTs con zod en el boundary (bundles/featured schemas; walker invariantes como 2ª capa); código muerto borrado: api.ts completo, storefrontRoutes sin registrar, factories createProductRepository/createStorefrontRepository, countProductsInCategory stub, getFeaturedStaples.
- [x] `image_path`/`image_avif_path` validados (assets/images/ + extensiones; fixtures de tests legacy `/img/` actualizados); parity 0 diffs.

## Evidence (2026-08-11)

- productService: branch description alineado (rev + field_last_modified.description).
- productRepository: cache `{mtimeMs}:{size}` con invalidación al inicio de writeCatalog (el rev check siempre ve disco); 63 archivos de tests verdes sin bypass flag necesario.
- app.ts: compress registrado; cache-control por clase de asset; vite sourcemap:false (dist sin .map).
- changes.ts: maps de lookup; syncService: mergeSnapshotIntoCatalog + pull en un write (command id derivado del batch).
- storefront.ts: bundlesWriteSchema/featuredWriteSchema.
- Muerto borrado: 5 símbolos + api.ts (6 exports sin uso) + storefrontRoutes no registrada.
- Fixtures legacy `/img/...` → `assets/images/...` en exportApi/operatorWorkflows (3 archivos de test ajustados).
- Tests: +4 (description rev, cache invalidation, image path schema, más el parity). Suite: 498 tests, e2e 19/19, certify 30/30, lint 0 errores.

## STOP conditions

- Si un golden de parity (fixture 055) incumple la nueva validación de `image_path`, PARAR y reportar — no debilitar la validación.
- Si el cache mtime rompe un test que muta el archivo externamente con mtime idéntico (misma ms), documentar el caso y usar `mtimeMs` + tamaño como clave.

## Maintenance notes

El cache mtime es el techo de latencia del admin: cualquier writer nuevo debe invalidar. La validación de `image_path` en el schema protege el build del storefront (los builds fallan con paths rotos); el picker de media (plan 091) sigue siendo la fuente canónica de paths válidos.
