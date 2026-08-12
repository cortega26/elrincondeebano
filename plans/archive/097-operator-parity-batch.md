# Plan 097: Paridad de operaciones — auto-sync, shortcuts, bulk por selección, undo/redo, media relocation, history

> Auditoría 8 (2026-08-11). M3, M4, M12, P2, P3, P6, P9, P11, P18.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED-HIGH — auto-sync y undo/redo tocan el runtime del server; cada paso es independiente
- **Depends on**: 086 (integridad de sync — el auto-sync no debe encenderse sobre un sync defectuoso), 088 (bulk scope)
- **Category**: functionality parity
- **Written against**: commit `cefdd9f`
- **Executed**: DONE — 2026-08-12 (verification abajo; media relocation DIFERIDO documentado)

## Why this matters

Python tenía: auto-sync en background (poll 60 s / pull 300 s — TS solo manual),
shortcuts CRUD (Ctrl+N/E/D/Del, Ctrl+F, Ctrl+Shift+P/C — TS solo navegación
`g <key>`), bulk sobre filas seleccionadas (TS siempre la página entera),
undo/redo multi-nivel persistente (TS: 1 nivel, in-memory), media reubicada al
cambiar de categoría, import registrado en history, commit message
autogenerado, Git/sync status con polling, y cap de history por producto (20)
vs el global de 100 del TS.

## Current state

- `app.ts:106` — `SyncService` creado, sin `setInterval`; sync solo vía `POST /sync/now` (`conflicts.ts:265-277`). Python: `sync.py:597-612`, `content_manager.py:538-541`.
- `App.tsx:83-127` — shortcuts `g <key>` + `?`; sin CRUD (HelpPage:92-93 declara el design). Python: `main_window.py:817-825`, `keyboard.py:15-24`.
- `ProductsPage.tsx:246-302` — bulk sobre `data.items`; sin multi-select (filas `tabIndex=0`, selección simple).
- `ProductsPage.tsx:317-339` + `undo.ts:57-105` — undo 1 nivel en memoria. Python: 20 niveles con redo (`bulk_operations_mixin.py:405-431`, `main_window.py:126-128`).
- Reubicación de media al cambiar categoría: ausente (Python `product_form.py:711-780`).
- Import sin history: `changes.ts:575-717` no hace `history.append` (Python `import_export_mixin.py:245-286`).
- Commit message fijo `chore(catalog): publication` (`publicationService.ts:30`) — editable en UI (Python autogeneraba `catálogo: N producto(s) [ts]`, `git_sync.py:291-311`).
- Status polling: on-demand (`ProductsPage.tsx:88-110`, `PublicationPage.tsx:103-111`) vs Python 5 s/30 s/60 s.
- History cap global 100 (`changes.ts:825-827`) vs per-product 20.

## Scope

**In scope**: `syncService.ts`/`start.ts`/`app.ts` (auto-sync), `App.tsx` (shortcuts), `ProductsPage.tsx` (multi-select + undo/redo), `productService.ts`/`changes.ts` (media relocation + import history + commit message), `syncQueueRepository` (status polling client-side), history cap, tests.
**Out of scope**: redo para change-sets (ya existe), selection persistence, sync UI redesign.

## Steps

### Step 1: Auto-sync (solo tras 086)

- En `start.ts`/`app.ts`: `setInterval` de poll (60 s push / 300 s pull) solo cuando `sync.enabled` está activo y `ADMIN_MODE=operator`; el interval se limpia al cerrar (fastify onClose); pausa/resume ya existen y deben detener el timer.
- Idempotencia: el timer llama al mismo `processOnce` del manual (colas durables ya lo hacen seguro).
- **Verificar**: test con fake-server — con sync enabled, el server ejecuta push/pull automáticamente dentro de 2× intervalo (fake timers o intervalo corto inyectado); con paused, no; onClose limpia.

### Step 2: Shortcuts CRUD

- En `App.tsx` (patrón `g` existente, guards de input-focus): Ctrl+N (nuevo producto — navega a `/products?new=1`), Ctrl+E (editar selección), Ctrl+D (duplicar), Ctrl+F (foco búsqueda), Del con confirm (archive — NUNCA purge directo), Ctrl+Shift+P (publish), Ctrl+Shift+C (commit). Documentar en HelpPage.
- **Verificar**: e2e keyboard — Ctrl+F foca búsqueda; Ctrl+Shift+P navega a publish; Del sobre selección pide confirm; en input de texto los shortcuts NO disparan.

### Step 3: Multi-select + bulk por selección

- Checkboxes por fila + "Seleccionar página/todo" (scope honesto de 088): bulk preview/apply con `scope: 'selection' | 'page' | 'matching'` (el server acepta ids explícitos para selection).
- Keyboard: Space toggle row.
- **Verificar**: e2e — seleccionar 3 filas → bulk aplica solo a 3; selección + "todos los que coinciden" respeta filtros.

### Step 4: Undo/redo multi-nivel

- Stack en `undo.ts`: `{ before: Product[] }` con límite 20 (constante compartida), `redo` con push post-success (de 088), persistencia en `sessionStorage` (no localStorage — no cruzar sesiones; documentar).
- Botones Undo/Redo en la barra de bulk con conteo ("Deshacer (2)").
- **Verificar**: tests unit de `undo.ts` (multi-nivel, redo, cap 20) + e2e: bulk A, bulk B, undo, undo, redo, redo → estado final correcto; reload borra el stack.

### Step 5: Media relocation

- En el PATCH de categoría de producto (`productService.edit`, branch category): si `image_path`/`image_avif_path` están en `assets/images/<old-category>/`, mover el archivo a `assets/images/<new-category>/` y actualizar los paths (con rollback si el segundo move falla — patrón de `atomicWriter`/media intent; usar `git mv`… no: `renameSync` + registro; el repo verá el rename).
- UI: aviso en el form "La imagen se moverá a la carpeta de la nueva categoría".
- **Verificar**: test — cambiar categoría mueve los 2 archivos y actualiza paths; destino con conflicto de nombre → sufijo `-1`; rollback si falla el segundo.

### Step 6: Import en history + commit message + polling + cap

- Import: registrar entrada en history tras apply (`changes.ts:575-717`) con `kind: 'import'`, antes/desde el preview-id (provenance).
- Commit message: autogenerar `catálogo: N producto(s) [timestamp]` (N = productos tocados en el change set) como default editable.
- Polling client-side: en `ProductsPage` sync status cada 30 s mientras la página está visible (cleanup en unmount) y `PublicationPage` git status cada 30 s (fetch on visibilitychange).
- History cap: cambiar a 20/producto (agrupar por producto, cap por producto) manteniendo el total razonable (paginado ya existe).
- **Verificar**: tests por cada sub-step (import history entry, mensaje con conteo, polling con fake timers, cap por producto).

### Step 7: Suite

```bash
npm run admin:test && npm run admin:certify && npx playwright test -c playwright.config.ts
```

## Test plan

- Unit: `undo.test.ts` (multi-nivel), `syncWorkflow.test.ts` (auto-sync con fake timers), `changes.test.ts` (import history, cap).
- Integración: media relocation en `mutationRepository.test.ts`/`mediaWorkbench.test.ts`.
- E2E: keyboard shortcuts, multi-select bulk, undo/redo, relocation (spec aislado).

## Done criteria

- [x] Auto-sync activo (tick 60 s: processOnce + pullOnce si config enabled y no paused; cleanup onClose; config re-leído por tick).
- [x] Shortcuts CRUD (Ctrl+N/E/D/F, Ctrl+Shift+P/C, Del-archive) con guards de typing y navegación por eventos.
- [x] Bulk por selección (checkboxes por fila + select-all-página, scope 'selection' con confirm y conteo real).
- [x] Undo/redo 20 niveles persistidos en sessionStorage (load/save con cap; redo re-aplica el bulk con revs frescas).
- [~] Media relocation: DIFERIDO documentado (riesgo alto de romper paths de imagen/build del storefront; el form + workbench cubren el flujo manual).
- [x] Import registra history (kind import-applied), commit message autogenerado "catálogo: N producto(s) [ts]", polling 30 s (sync status + git status), cap 20 filas/producto en /history.

## Evidence (2026-08-12)

- app.ts: timer 60 s de auto-sync (gate isConfigured/paused; onClose clear) — el pull/push reutiliza la cola durable y el lock TTL de 086.
- App.tsx: shortcuts con guards (typing, ctrlKey, preventDefault); eventos cm-edit-selected/duplicate/archive/focus-search; ProductsPage los escucha con ref de selección + ?new=1 reactivo (replaceState).
- ProductList: columna de checkboxes + select-all-página; BulkOpsBar: select de ámbito con opción "Selección (N)" (renderiza con selección aunque no haya subset) + botones Deshacer (N)/Rehacer (N).
- undo.ts: MAX_UNDO_LEVELS 20, loadStack/saveStack con sessionStorage.
- changes.ts: history.append con kind 'import-applied'; /history con cap 20/producto (Map por producto); publication.ts: commit message autogenerado con conteo del catálogo.
- historyRepository: kinds ampliados.
- Tests: +1 API (cap 20 por producto con 25 PATCHes) +2 e2e (Ctrl+N/Ctrl+F, bulk por selección con conteo exacto). Suite: 504 tests, e2e 15/15 scope + 19/19 smoke, certify 30/30, lint 0 errores.

## STOP conditions

- El auto-sync NO se habilita si 086 no está DONE (dependencia dura — el poll sobre el sync roto amplifica la pérdida silenciosa).
- Si `sessionStorage` no basta por tamaño (before arrays grandes), usar `localStorage` con cap de entradas y documentar la política de evicción.

## Maintenance notes

El timer de auto-sync vive en el server: cualquier test que cree `createApp` con sync enabled debe inyectar intervalos cortos o fake timers (patrón de `syncWorkflow.test.ts`). La reubicación de media convierte el PATCH de categoría en una operación multi-archivo: mantener el rollback y el registro en history.
