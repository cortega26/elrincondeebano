# Plan 062 — Todo

Spec: `plans/062-enforce-change-sets-history-recovery.md`. Drift (2026-08-11):
el enum + ALLOWED_TRANSITIONS ya existen en el schema (058), pero el PATCH
masa `...body` (status arbitrario); ops sin before/after; sin apply engine; sin
undo/redo; /history reconstruye desde field_last_modified; backups existen.

- [x] Drift check + estado actual (schema, PATCH, backups, contract tests)
- [ ] **Slice A (Step 1)**: PATCH con enforce de transiciones + campos permitidos
- [ ] **Slice B (Step 2)**: ops con before/after/revisions/idempotency (migración-safe)
- [ ] **Slice B**: apply engine de change sets (product_ops, revision checks, 1 write)
- [ ] **Slice C (Step 4)**: undo/redo (change set inverso, revision-aware, durable)
- [ ] **Slice C**: HistoryRepository append-only + /history fusionado
- [ ] **Slice D (Step 5)**: UI control center (drafts, history, undo/redo, backups)
- [ ] Tests: transiciones tabla, apply, undo/redo con restart, history
- [ ] E2E: edit → review → apply → undo → redo tras reload
- [ ] Verificar: admin:test/typecheck/build, npm test, e2e
- [ ] README fila 062 → DONE + archivar
