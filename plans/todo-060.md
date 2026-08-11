# Plan 060 — Todo

Spec: `plans/060-build-lossless-import-export.md`. Drift (2026-08-11): 073 ya
arregló el flujo actual (preview → conflicts + incoming_by_id → apply con
products+resolutions, sin binding); 065 definió el contrato de producto. El
trabajo restante es el protocolo con preview durable + apply ligado a preview.

- [x] Drift check + re-leer `changes.ts`, `ImportPage.tsx`, cliente, Python oracle
- [ ] **Step 1**: schema compartido `importExport.ts` (preview/apply/resolución)
- [ ] **Step 1**: `PreviewRepository` durable (`data/import-previews/`)
- [ ] **Step 1**: preview → hash SHA-256 + base_rev + additions/updates/unchanged/invalid
- [ ] **Step 2**: apply ligado a preview_id (404 preview, 409 base_rev, 422 no resueltos)
- [ ] **Step 2**: apply atómico completo (modos: new-only/update-only/mixed/no-op/keep-local)
- [ ] **Step 2**: alinear respuesta con UI (`created/updated/skipped/errors/rev`)
- [ ] **Step 2**: client.ts tipado (preview/apply/export)
- [ ] **Step 4**: `/export` JSON lossless + `/export.csv` (columnas Python + filtros)
- [ ] **Step 3**: UI de archivo (file input + resumen + error report + aprobación)
- [ ] Tests: integración (protocolo, modos, 409/422/404, restart, atomicidad)
- [ ] Tests: parity CSV golden + round-trip corpus + e2e import (temp repo)
- [ ] Verificar: `admin:typecheck`, `admin:test`, `npm test`, `admin:build`
- [ ] Commit por hito; README fila 060 → DONE + archivar
