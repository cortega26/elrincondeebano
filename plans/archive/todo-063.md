# Plan 063 — Todo

Spec: `plans/063-build-transactional-media-workbench.md`. Drift (2026-08-11):
intents response-only, /convert y /generate `acknowledged`, upload directo sin
sniffing, MediaPage inventario-only.

- [x] Drift check + estado actual
- [x] Step 1: schema + MediaIntentRepository durable + staging root
- [x] Step 2: upload sniffed (magic bytes), bounded, staging-only
- [x] Step 3: jobs allowlisted (avif/variant sharp, OG tool args fijos)
- [x] Step 4: apply atómico (promueve assets + refs de producto, rollback)
- [x] Step 5: UI workbench + e2e aislado (:3103)
- [x] Tests: sniffing, ciclo intent/apply, restart, discard, cancel
- [x] Verificar: admin:test/typecheck/build, npm test, e2e
- [x] README fila 063 → DONE + archivar
