# Plan 066 — Todo

Spec: `plans/066-build-safe-storefront-curation.md`. Drift (2026-08-11): dual-write
experience+bundles existe con [] (081) pero sin rollback transaccional; schema
permisivo; BundlesPage = editor JSON; rutas featured con merge.

- [x] Drift check + estado actual (schema, repo, rutas, page)
- [ ] Step 1: validateStorefrontCuration (non-empty/único/refs válidas, política archived)
- [ ] Step 1: wire en rutas + contract tests + fixtures parity
- [ ] Step 2: write transaccional (rollback de AMBOS archivos ante fallo) + failure injection
- [ ] Step 3: BundlesPage estructurada (form + picker + duplicate/reorder + validación)
- [ ] Step 4: curación featured (staples + categorías) con preservación exacta
- [ ] Tests: integración (invariantes, dual-write, preservación subtrees)
- [ ] E2E: bundle create/edit/delete-last/reorder + featured (temp repo)
- [ ] Verificar: admin:test/typecheck/build, npm test, build storefront
- [ ] README fila 066 → DONE + archivar
