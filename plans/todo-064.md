# Plan 064 — Todo

Spec: `plans/064-port-durable-remote-sync.md`. Drift (2026-08-11): adapter 501,
config no reconfigura el adapter vivo, ConflictRepository/schema listos (campos
del contrato ya presentes).

- [x] Drift check + contrato Python (push PATCH, pull GET changes, cola+backoff, conflictos 409/412)
- [ ] Step 1+3: adapter real (fetch acotado, redirects, redacción, token env) + URL policy (https, http loopback)
- [ ] Step 2: SyncQueueRepository durable (tmp+rename, bounded, restart-safe)
- [ ] Step 2+4: SyncService (enqueue idempotente, backoff, push, 409/412 → conflictos, pull con cursor)
- [ ] Step 4: enqueue desde PATCH de productos (offline edits)
- [ ] Step 5: config live + /sync/status real (queue counts, pause/resume) + /sync/now real
- [ ] Tests: fake remote (200/409/412/401/429/5xx/timeout/schema/oversize/redirect)
- [ ] Tests: cola (restart, duplicados, backoff, cursor exact-once)
- [ ] UI: sección sync con estado real + pause/resume
- [ ] Verificar: admin:test/typecheck/build, npm test, e2e, secret-scan
- [ ] README fila 064 → DONE + archivar
