# Plan 067 — Todo

Spec: `plans/067-bound-backups-and-event-loop-work.md`.

- [x] Drift check + estado actual (backup.ts, atomicWriter, repos)
- [x] Step 1: política por clase (auto/manual/pre-restore) + protección (más reciente + recovery)
- [x] Step 2: BackupManager (creación verificada, pruning post-éxito, warnings visibles)
- [x] Step 2: writers categorías/storefront con retención acotada
- [x] Step 3: listing index-driven paginado (sin stat por archivo) + reconcile
- [x] Step 4: UI con clase/protección/warnings + prune preview/confirmación
- [x] Tests: policy table, fixture 2000 entradas, prune protegido 409, reconcile
- [x] Verificar: admin:test/typecheck/build, npm test, e2e
- [x] README fila 067 → DONE + archivar
