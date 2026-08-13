# Plan 127 — Todo (sub-tareas verificables)

Cada ítem se marca `[x]` solo con su verificación cumplida. Commits
individuales por ítem (rollback `git revert <sha>`).

## Fase 1 — Fundaciones de calidad

- [x] F1.1 Harness de tests de componentes
  - [x] Dependencias: `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` (devDeps, alineadas con la política de deps).
  - [x] `vitest.config.ts`: `test.web` con `environment: 'jsdom'` (o `// @vitest-environment jsdom` por archivo).
  - [x] `test/web/harness.tsx`: renderer de página con `vi.mock('../../src/web/api/client')`.
  - [x] Test de humo: `<ProductsPage/>` renderiza el filtro Categoría.
  - [x] Portar las 4 aserciones de confirm (plan 126) a nivel componente.
  - [x] Verificación: `npm run admin:test` verde (nueva suite incluida).
- [x] F1.2 Lint del árbol completo
  - [x] Corregir los 14 errores (7 archivos: SettingsPage + suites de test).
  - [x] `admin.yml`: paso `npx eslint . --config eslint.config.mjs`.
  - [x] Verificación: 0 errores en `src` y `test`; CI verde.
- [x] F1.3 E2E admin en paralelo
  - [x] `admin.yml`: matriz de configs (5 temp-repo en paralelo; operator suite aparte).
  - [x] Verificación: run completo verde, wall-clock < 1.5 min.

## Fase 2 — Robustez de dominio y contrato

- [x] F2.1 Undo/redo de categorías
  - [x] `buildCategoryUndoEntry` + stack con `moveEntryOnSuccess`.
  - [x] Batch endpoint de categorías (patrón 121) + route policy.
  - [x] Tests de componente del stack + integración + e2e scope.
- [x] F2.2 Versionado de esquema del catálogo
  - [x] `schema_version` en el catálogo + registry de migraciones.
  - [x] Hook en `loadCatalog` y en preflight del storefront.
  - [x] Test de migración 1→2 idempotente y atómico.
- [x] F2.3 OpenAPI desde zod
  - [x] `openapi.json` generado (herramienta evaluada contra DEPENDENCY_POLICY).
  - [x] Test de contrato: rutas del client ⊆ OpenAPI, shapes compatibles.
- [x] F2.4 Media batch
  - [x] Endpoint batch de intents (run/cancel/apply) con progreso agregado.
  - [x] UI: selección múltiple en MediaPage.
  - [x] e2e `playwright.media.config.ts`.

## Fase 3 — Operación y producto

- [ ] F3.1 Publicación programada
  - [ ] `publish_at` en change-sets + scheduler + cancel en UI.
  - [ ] Test de integración con clock inyectado.
- [ ] F3.2 Observabilidad
  - [ ] `x-request-id` (hook onRequest) + log estructurado JSON en el error handler.
  - [ ] Test: 500 inyectado → request-id en respuesta y log.
- [ ] F3.3 Recovery proactivo
  - [ ] Banner global cuando `getPendingRecoveries() > 0`.
  - [ ] Test de componente + smoke.
- [ ] F3.4 SSE sync
  - [ ] `/api/v1/sync/events` + suscripción del panel (polling como fallback).
  - [ ] Test de integración SSE.
- [ ] F3.5 Rotación de credential
  - [ ] `admin:rotate-credential` (0600, invalida anterior).
  - [ ] Test del script con repo temp.
- [ ] F3.6 Benchmark de snapshots (opcional)
  - [ ] `tools/bench-catalog-snapshot.mjs` + resultado en `reports/`.

## Cierre

- [ ] Filas de `plans/README.md` actualizadas (plan 127 y sus planes de trabajo).
- [ ] Métricas de la sección 6 del spec re-medidas.
- [ ] `npm run validate:release` verde; CI verde.
