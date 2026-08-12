# Plan 030: Commit catalog patches atomically and recover incomplete writes

> **Executor instructions**: This is durability-sensitive. Follow every step, run fault-injection tests, and STOP rather than simplifying the transaction protocol. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 877f179..HEAD -- server/productStore.js test/product-sync.server.test.js server/httpServer.js`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `877f179`, 2026-07-14
- **Executed**: DONE — 2026-08-12 (verification abajo)

## Why this matters

`applyPatch` mutates in-memory state and then overwrites two JSON files sequentially. A partial write or failure between files can corrupt JSON, split revisions, and leave memory claiming an idempotent changeset that was not durably committed. The server needs a documented two-file commit/recovery protocol before sync usage expands.

## Current state

- `productStore.js:313-320` calls `fs.writeFile` directly on both canonical files.
- `productStore.js:513-598` mutates `_state`/`_changeLog`, saves state, then saves log.
- `admin/product_manager/storefront_service.py:211-221` is the local exemplar for temp-write plus replace, but this plan additionally requires cross-file recovery.
- Sync behavior tests live in `test/product-sync.server.test.js`.

## Commands you will need

| Purpose | Command                                         | Expected |
| ------- | ----------------------------------------------- | -------- |
| Focused | `node --test test/product-sync.server.test.js`  | all pass |
| Gate    | `npm run lint && npm run typecheck && npm test` | exit 0   |

## Scope

**In scope**: `server/productStore.js`, `test/product-sync.server.test.js`; create `test/product-store.durability.test.js` and register it in `test/run-all.js` if still required by plan 024 status.

**Out of scope**: migrating the server to SQLite, changing HTTP response shapes, changing conflict resolution, admin UI, catalog schema.

## Git workflow

- Branch: `advisor/030-product-store-durability`
- Commits: `test: add product store fault injection`; `fix: make product store commits recoverable`

## Steps

### Step 1: Make persistence dependencies injectable

Allow tests to inject a narrow filesystem adapter (`readFile`, `writeFile`, `rename`, `unlink`, `mkdir`, optional `open/sync`) and transaction paths. Defaults must remain Node `fs/promises`. Do not expose this through HTTP.

**Verify**: existing product-sync tests pass unchanged.

### Step 2: Compute next state without publishing it

Clone `_state` and `_changeLog` at the start of the exclusive patch and apply all mutations/pruning to the clones. Only assign them to instance fields after durable commit succeeds. A failed commit must leave prior in-memory objects and idempotency cache intact.

**Verify**: injected write failure returns rejection and subsequent read returns the pre-patch revision/product.

### Step 3: Implement a recoverable commit protocol

Use same-directory temp files and a small transaction manifest. Write/flush both next JSON payloads, validate they parse and share the expected revision, then write the manifest. Replace targets while retaining recoverable backups. Remove manifest/backups only after both targets are installed. On `_loadState`, recover a present manifest deterministically: finalize only when both new targets validate; otherwise restore both backups. Clean stale temp files only when they are not referenced by a manifest.

**Verify**: fault injection after each write/rename boundary followed by a fresh `ProductStore` instance always yields either the complete old revision or complete new revision—never a split pair or invalid JSON.

### Step 4: Cover no-op/idempotent changesets

No-op changesets that currently write only the changelog must use the same safe single-file primitive and publish cache changes only after success.

**Verify**: retry after injected no-op persistence failure is not served from an in-memory false-success cache.

### Step 5: Full gate

**Verify**: `npm run lint && npm run typecheck && npm test` → exit 0.

## Test plan

Create table-driven fault points for temp state write, temp log write, manifest write, first rename and second rename. Assert parseability, equal revisions, idempotent retry and recovery on new process/store instance.

## Done criteria

- [x] Every simulated interruption recovers to complete old or new state (7 boundaries de fault-injection).
- [x] Failed commits do not mutate published memory/idempotency state (retry no-sirve-cache-falsa).
- [x] Direct target `writeFile` calls gone del commit path (solo tmps + manifest + renames).
- [x] Existing API behavior y full gate verdes.

## Evidence (2026-08-12)

- server/productStore.js: adapter fs inyectable (`options.fs`, defaults fs/promises); helpers de instancia (`_ensureDir`/`_readJson`); protocolo `_commit` (tmps → manifest staged → validación de par con rev compartida → backups → manifest renamed → install → cleanup); `_recoverTransaction` determinista (par nuevo desde fuentes completas — tmps o targets según fase — si valida; si no, par viejo desde backups; nunca adivina entre revisiones); `_cleanupStaleTxnFiles`; `applyPatch` staged en clones (`nextState`/`nextChangeLog`) y publica memoria + caché de idempotencia SOLO tras el commit durable (incluye el path no-op).
- Bug real encontrado por el fault-injection: el recovery original fallaba cuando el primer tmp ya estaba instalado (stateTmp desapareció) y el log quedaba dividido — corregido ensamblando el par nuevo desde fuentes existentes (tmps primero, targets después).
- test/product-store.durability.test.js (10 tests): 7 límites de interrupción (write tmps/manifest, rename backups, rename installs) → fresh instance recupera par completo con rev 0 o 1 y sigue operativa; cache falsa no publicada; no-op durable con cache sobrevive restart; sin writeFile directo al target en el commit.
- Gates: 428 root + 504 admin tests, build con validación de artefactos, lint + typecheck verdes.

## STOP conditions

- Reliable same-filesystem atomic rename cannot be assumed for configured paths.
- Recovery requires guessing between conflicting valid revisions.
- The server is already scheduled to move to the canonical SQLite authority before this can land; report and merge this scope into that migration plan.

## Maintenance notes

Review manifest versioning and cleanup carefully. Document the protocol near its implementation; future schema changes must keep recovery backward compatible or perform an explicit migration.
