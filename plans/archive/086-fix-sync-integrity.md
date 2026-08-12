# Plan 086: Fix sync integrity — pull collision, premature synced, unvalidated snapshot, stale lock

> Auditoría 8 (2026-08-11, post-release-candidate). Findings 1, 3, 4, 14.
> Blocker del retiro de Python (plan 069 está en HOLD hasta resolver esta cola).

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED — cambia el contrato interno del sync; los tests de fake-server (syncWorkflow.test.ts) son la red de seguridad
- **Depends on**: —
- **Category**: data integrity / sync
- **Written against**: commit `cefdd9f`
- **Executed**: DONE — 2026-08-11 (verification abajo) (branch `migration/069-content-manager-cutover`)

## Why this matters

Tres fallos silenciosos convierten el sync remoto en una fuente de pérdida de
datos: (a) el segundo pull con cambios nunca escribe al catálogo (colisión de
idempotencia con command_id fijo), (b) un push marca la cola `synced` aunque
la aplicación local del snapshot falle, (c) el snapshot remoto se fusiona sin
validación zod y se persiste — un remote comprometido/enfermo envenena el
catálogo y rompe todo el admin. Además, un crash durante `processOnce` deja un
lockfile que mata el sync para siempre sin señal visible.

## Current state

- `src/server/services/syncService.ts:293` — `writeCatalog(catalog, 'sync-pull', baseRev)` usa el command_id fijo `'sync-pull'`.
- `src/server/repositories/productRepository.ts:73-79` — `writeCatalog` short-circuita: `if (this.idempotencyStore?.has(commandId))` devuelve el resultado cacheado sin escribir.
- `src/server/services/persistentIdempotencyStore.ts:6-16` — persiste `data/idempotency.json` entre restarts (FIFO 200).
- `src/server/services/syncService.ts:122-135` — push: `entry.status = 'synced'` y `pushed += 1` ANTES de `await this.applyServerSnapshot(...)`; el booleano devuelto se ignora; `processOnce` (línea 109) no re-procesa `synced`.
- `src/server/services/syncService.ts:266-288` — `applyServerSnapshot` hace mass-assign de cada campo del remote sobre el producto (skippeando `id/rev/order/field_last_modified`), sin `productSchema.safeParse` del producto fusionado; `writeCatalog` re-lee el archivo para el rev check pero nunca re-valida el `data` (atomicWriter solo hace `JSON.parse`).
- `src/server/repositories/syncQueueRepository.ts:74-90` — `acquireLock` devuelve false si el lockfile existe, sin TTL ni check de liveness; `processOnce` lo trata como "nada que hacer" (`syncService.ts:100`).
- Test actual: `test/integration/syncWorkflow.test.ts:268-309` — hace pull con cambios UNA vez y luego un pull con `changes: []` (early-return en `syncService.ts:233-236`); el camino "segundo pull con cambios" nunca se ejercita.

## Scope

**In scope**: `syncService.ts`, `syncQueueRepository.ts`, `idempotencyStore` (command_id derivado), tests de sync.
**Out of scope**: transporte/adapter (`syncAdapter.ts`), conflictos, el plan 064 ya cerrado, UI de sync.

## Steps

### Step 1: Command_id único por pull

Derivar el command_id del contenido: `sync-pull-${sinceRev}-${sha256(JSON.stringify(changes))}` (usar `crypto.createHash`). El primer pull con los mismos cambios sigue siendo idempotente; pulls con contenido distinto ya no colisionan.

**Verificar**: dos pulls consecutivos con cambios distintos escriben AMBOS al catálogo; un re-envío idéntico no re-escribe (idempotencia preservada). Nuevo test en `syncWorkflow.test.ts`: "pull twice with changes, both land on disk, cursor advances exactly once per pull".

### Step 2: `synced` solo tras apply local OK

En el push, mover el `status = 'synced'`/`pushed += 1` DESPUÉS de `await this.applyServerSnapshot(...)` y condicionarlo a su retorno `true`. Si `applyServerSnapshot` devuelve `false`, marcar la entrada `error` con `last_error: 'local apply failed'` y conservarla para reintento (no `synced`).

**Verificar**: test con fake-server 200 cuyo snapshot falla al aplicar (rev mismatch inducido por edición concurrente) → la entrada queda pendiente/error, `pushed` no cuenta, `/sync/status` lo muestra.

### Step 3: Validar el snapshot antes de persistir

En `applyServerSnapshot`, después del merge: `const parsed = productSchema.safeParse(product)` por producto y `productCatalogSchema.safeParse(catalog)` antes de `writeCatalog`. Si alguno falla, devolver `false` (y por el Step 2 no marcar synced; en pull, no avanzar el cursor — `syncService.ts:248-251` debe condicionar el cursor al retorno de `applyServerSnapshot`).

**Verificar**: test fake-server que envía `price: "abc"` / campos extra → el pull se rechaza, el catálogo local intacto, cursor sin avanzar, error en status.

### Step 4: Lock stale con TTL

En `syncQueueRepository.acquireLock`, si el lockfile existe pero su mtime supera `SYNC_LOCK_TTL_MS` (constante 5 min), tratarlo como stale: borrar y adquirir. Mantener la garantía single-consumer: el borrado debe ser atómico (unlink-if-older dentro del mismo acquire). Registrar en `last_error`/status un warning visible.

**Verificar**: test que crea lockfile con mtime viejo → `acquireLock` true y el lock anterior reemplazado; lockfile fresco → false (no rompe la exclusión).

### Step 5: Correr la suite completa

**Verificar**:

```bash
npm run admin:test          # incluye syncWorkflow, idempotency, restartRecovery
npm run admin:certify       # 30/30 READY (evidencia regenerada)
```

## Test plan

- `test/integration/syncWorkflow.test.ts`: +3 casos (doble pull con cambios, push con apply local fallido, snapshot inválido rechazado).
- `test/integration/restartRecovery.test.ts`: caso de lock stale.
- Seguir el patrón existente del fake-server (`syncWorkflow.test.ts` usa un servidor fake in-process).

## Done criteria

- [x] Dos pulls consecutivos con cambios distintos escriben ambos (test verde).
- [x] Push con apply local fallido deja la entrada pendiente/error, no `synced`.
- [x] Snapshot con campos inválidos se rechaza; catálogo y cursor intactos.
- [x] Lockfile stale (mtime > TTL) se reemplaza; lockfile fresco respeta la exclusión.
- [x] `npm run admin:test` + `admin:certify` verdes.

## Evidence (2026-08-11)

- `syncService.ts`: command_id de pull derivado `sync-pull-${baseRev}-${sha256(snapshot)}`; push marca `synced` solo tras apply local OK (con backoff si falla); `applyServerSnapshot` valida el producto fusionado con `productSchema` antes de escribir; `pullOnce` reporta `error` cuando hay changes inaplicables.
- `syncQueueRepository.ts`: `SYNC_LOCK_TTL_MS` (5 min) con reclaim atómico (`wx`), unit test de TTL.
- Tests nuevos en `syncWorkflow.test.ts` (+5): doble pull con cambios distintos (caza el bug original — verificado revirtiendo el fix: price 500 ≠ 777), pull con snapshot inválido (catálogo/cursor intactos), push con apply fallido (error, no synced), lock stale integración + unit.
- Suite: 472 tests verdes, e2e smoke 19/19, `admin:certify` 30/30 READY.

## STOP conditions

- El fake-server existente no permite simular apply local fallido → no improvisar: reportar y ajustar el harness primero.
- Algún test de `syncWorkflow.test.ts` rompe el contrato de cursor → revisar el orden de pasos, no forzar.

## Maintenance notes

El command_id derivado es la garantía de idempotencia; al agregar nuevos campos al pull (p. ej. filtros), incluirlos en el hash. La TTL del lock debe ser > el peor caso de duración de un `processOnce` (hoy < 1s; 5 min es seguro).
