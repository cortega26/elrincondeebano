# Plan 095: Paridad de catálogo — purge, inline editing, revert por producto, galería AVIF

> Auditoría 8 (2026-08-11). M1, M5, M6, P15.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — purge y revert tocan el write path (change-set y revisiones)
- **Depends on**: 087 (allowlist change-set — el purge/revert debe respetarlo), 088 (paginación — el inline editing opera en la página visible)
- **Category**: functionality parity
- **Written against**: commit `cefdd9f`

## Why this matters

Cuatro capacidades de Python ausentes en TS que el operador usa: borrado duro
de producto (Python: `main_window.py:887-908`, `services.py:1076-1099` — en TS
solo existe archive, los SKUs retirados se acumulan), edición inline de celdas
(doble-click en precio/descuento/stock, Python `main_window.py:1500-1700`),
revert de un producto a un snapshot histórico (Python `main_window.py:953-1087`)
y galería con AVIF-first (Python `gallery.py:177-181`; TS solo `image_path`).

## Current state

- Sin `DELETE /products` ni op `purge` en `changeSet.ts:20` (ops: create/edit/archive/restore).
- `ProductsPage.tsx:853-856` — doble-click abre el form completo (no hay editor de celda).
- `HistoryPage.tsx:398-466` — tabla plana read-only; `changes.ts:324-417` undo/redo a nivel change-set; sin endpoint de revert por producto.
- `ProductsPage.tsx:984` — galería usa `image_path`; el catálogo tiene `image_avif_path`.

## Scope

**In scope**: `catalog.ts`/`changes.ts` (op purge + endpoint revert), `changeSet.ts`/`changeSetApplier.ts` (op `purge`), `productService.ts`, `HistoryPage.tsx` (botón revert), `ProductsPage.tsx` (inline editor), `client.ts`, tests.
**Out of scope**: purge con restore (irreversible por diseño, con confirm + backup automático), undo de purge (se registra en history como op).

## Steps

### Step 1: Op `purge` en change sets

- Nueva op `purge` (action) en `changeSet.ts` + applier: elimina el producto del catálogo, con `before` completo registrado en history (auditable). Backups automáticos vía `atomicWriter` ya existen.
- Ruta `DELETE /api/v1/products/:id` → crea y aplica el change set (o directamente con el guard de revisiones del repositorio). Requiere `isSafeId` (ya aplicado en cambios).
- UI: botón "Eliminar definitivamente" en el inspector + confirm (patrón de 091), distinto de "Archivar".
- **Verificar**: test integración — purge elimina, history registra `before`, backups creados, archive NO se ve afectado; op purge con op-data ajeno rechazado (allowlist de 087).

### Step 2: Revert por producto

- Endpoint `POST /api/v1/history/:productId/revert` con `{ to_rev }` (o `snapshot_id`): aplica el diff inverso (before del op que llevó a ese estado) como un change set de `edit` (respetando el allowlist y las guards de rev — el revert exige que el producto NO haya cambiado desde la snapshot).
- UI en `HistoryPage`: fila por producto (agrupar por producto, paginado — ya hay `total_products`), botón "Revertir a este estado" con confirm; feedback (componente de 093).
- **Verificar**: test — revert a rev N restaura name/price/stock/… exactos; revert sobre producto editado después → 409 con mensaje; history append-only (el revert aparece como nueva entrada, no borra).

### Step 3: Inline editing

- En la tabla (página visible): doble-click en celdas price/discount/stock/category → editor inline (input numérico/select) con Enter aplica (PATCH con guards de rev), Escape cancela; focus management (aria). Fuera de foco → cancela.
- Solo en la tabla, no en galería (por ahora).
- **Verificar**: e2e — doble-click price → editar → Enter → API PATCH con rev correcta; 409 stale → error inline sin perder foco; Escape cancela sin mutar.

### Step 4: Galería AVIF-first

- `ProductImage` (de 091) ya centraliza el fallback; la galería elige `image_avif_path` si existe y `image_path` como fallback (mismo orden que el storefront `ProductCard.astro`).
- **Verificar**: e2e con producto con AVIF → la galería sirve el AVIF; sin AVIF → webp.

### Step 5: Suite

```bash
npm run admin:test && npm run admin:certify && npx playwright test -c playwright.config.ts
```

## Test plan

- `test/integration/mutationApi.test.ts` (o nuevo `purgeRevert.test.ts`): purge, revert, 409s.
- `test/contract/changeSet.test.ts`: op purge en el estado de transición.
- E2E (spec aislado): inline edit + revert + purge con confirm.

## Done criteria

- [ ] Purge elimina con history/backup/confirm; archive intacto.
- [ ] Revert por producto restaura exacto, con guards de rev y history append-only.
- [ ] Inline editing funcional con keyboard y manejo de 409.
- [ ] Galería AVIF-first con fallback.

## STOP conditions

- Si el revert choca con la semántica de `field_last_modified` (restaurar un estado anterior contradice el registro de metadata), documentar el comportamiento elegido (metadata del revert vs de la snapshot) en el test antes de decidir.

## Maintenance notes

Purge y revert son operaciones con `before` completo: el history es append-only y la auditoría (plan 090, error envelope) debe poder asociar cada purge a su op. El inline editor reutiliza los guards de 088 (scope de página).
