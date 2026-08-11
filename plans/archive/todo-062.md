# Plan 062 — Todo

Spec: `plans/062-enforce-change-sets-history-recovery.md`. Drift (2026-08-11):
el enum + ALLOWED_TRANSITIONS ya existen en el schema (058), pero el PATCH
masa `...body` (status arbitrario); ops sin before/after; sin apply engine; sin
undo/redo; /history reconstruye desde field_last_modified; backups existen.

- [x] Drift check + estado actual (schema, PATCH, backups, contract tests)
- [x] **Slice A (Step 1)**: PATCH con enforce de transiciones + campos permitidos
- [x] **Slice B (Step 2)**: ops con before/after/revisions/idempotency (migración-safe)
- [x] **Slice B**: apply engine de change sets (product_ops, revision checks, 1 write)
- [x] **Slice C (Step 4)**: undo/redo (change set inverso, revision-aware, durable)
- [x] **Slice C**: HistoryRepository append-only + /history fusionado
- [x] **Slice D (Step 5)**: UI control center (drafts, history, undo/redo, backups)
- [x] Tests: transiciones tabla, apply, undo/redo con restart, history
- [x] E2E: edit → review → apply → undo → redo tras reload
- [x] Verificar: admin:test/typecheck/build, npm test, e2e
- [x] README fila 062 → DONE + archivar
