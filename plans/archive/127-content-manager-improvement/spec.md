# Plan 127 — Content Manager TS: Roadmap de mejora (master plan)

- **Estado**: TODO · **Prioridad**: P1 · **Esfuerzo**: L (roadmap en 3 fases)
- **Stamped against**: `4ac6283b` (drift check: `git rev-parse --short HEAD` debe coincidir antes de ejecutar cualquier fase)
- **Alcance**: `admin/content-manager/` — el admin canónico (Fastify 5 + React 19 + TS 7 + Vite)
- **Dependencias**: ejecutar después de cerrar la Auditoría 9 (planes 098–126) — este plan se basa en ese estado

---

## 1. Contexto y objetivo

El Content Manager TS es la aplicación canónica del repo (plan 055 + 056–097).
La Auditoría 9 (098–126) cerró 29 hallazgos: bugs de dominio (undo, path
traversal, catálogo compartido, reorder gating), cobertura (OG lifecycle,
fault-injection), retiros (legacy e2e, sync server Python), refactors
(catalog.ts split, unificación de fetch, bases de ESLint/Playwright) y DX
(watch + HMR, deep imports de Bootstrap, gap-fill de variants).

Este plan NO repite esa cola: ataca las **brechas estructurales que quedaron
expuestas** durante esa ejecución. La tesis central, con evidencia:

> **La mayor fuente de bugs del Content Manager en 2026-08-12 fue la lógica de
> UI sin tests de componentes** (los planes 099, 126 y el drift e2e de
> `ccb921f` fueron todos bugs de la capa web que solo un harness de
> componentes habría atrapado). La segunda fuente es la **ausencia de un
> contrato API formal** (el cliente tipado se mantiene a mano y ya se desvió
> una vez, plan 115). El resto del plan organiza robustez de dominio y
> operación alrededor de esas dos fundaciones.

El plan entrega **métricas medibles** (sección 6) y cada ítem trae su propia
verificación concreta.

---

## 2. Estado actual (fortalezas verificadas, no se tocan)

- **Escribir**: AtomicWriter (tmp → verify → backup → rename) + RecoveryJournal
  - MutationLock + idempotencia persistente (`services/atomicWriter.ts`,
    `services/recoveryJournal.ts`, `services/mutationLock.ts`,
    `services/persistentIdempotencyStore.ts`) — con suite de fault-injection
    portada (plan 108).
- **Dominio**: `productService` valida prospectivamente antes de mutar (plan
  100); `bulkApply` cuenta solo cambios reales (102); snapshots por request
  (105); batch-update con guard de revisión único (121).
- **Cambios**: change-sets + conflictos + publication con jobRunner
  (`routes/changes.ts`, `routes/publication.ts`).
- **Medios**: workbench con intents durables y progreso (`routes/media.ts`,
  `services/mediaJobs.ts`, OG lifecycle 106).
- **Seguridad**: credential loopback + constant-time (`security/launchCredential.ts`),
  route policy fail-closed (`security/routePolicy.ts`), path containment
  (100), IDs criptográficos (125).
- **Calidad**: vitest 532 (contract + integration vía `app.inject`), 6 configs
  Playwright con base compartida (123), lint en pre-commit y CI.
- **DX**: watch + HMR (124), client tipado (115), bases de config compartidas
  (122/123).

---

## 3. Diagnóstico por área (evidencia)

### 3.1 Capa web sin tests de componentes — **crítico**

- `package.json` no tiene `@testing-library/*` ni `jsdom`/`happy-dom`
  (verificado 2026-08-12). Todo el estado de UI (pilas de undo, dialogs,
  filtros, forms) se prueba solo por e2e.
- Consecuencia directa (historial de la sesión): undo/redo movía entries
  antes del éxito (099), los confirms destructivos no se asertaban (126), el
  e2e se rompió por drift app↔spec (`ccb921f`), el toggle de reorder-filters
  (101) y el propio `filtersActive` (101) eran lógica UI pura sin test.
- Coste: cada cambio de UI requiere una corrida e2e de ~2–40 min para
  retroalimentación; los fallos llegan tarde y con diagnóstico indirecto.

### 3.2 Contrato API cliente-servidor duplicado a mano

- `src/web/api/client.ts` (34 métodos tipados a mano) vs zod schemas en
  `src/shared/schemas/`. Ya se detectaron 3 métodos muertos y 3 patrones de
  fetch (115); el riesgo de derivar persiste en cada endpoint nuevo.
- No existe OpenAPI ni validación compartida cliente/servidor: un cambio de
  shape en el servidor no falla en compilación del cliente.

### 3.3 Deuda de lint latente en el admin

- `npx eslint src test --config eslint.config.mjs` reporta **14 errores**
  pre-existentes en ~7 archivos sin tocar (SettingsPage + suites de test:
  `conflictService`, `jobRunnerAdvanced`, `media`, `mediaSecurity`,
  `mutationRepository`, `publicationAdvanced`, `restartRecovery`,
  `rollbackDrill` — imports sin uso, `prefer-const`, `no-require-imports`).
- Hoy solo lint-staged y CI lintean archivos tocados; el árbol completo del
  admin nunca pasa lint en CI. Cualquier refactor global (F2.x) tropieza con
  este ruido.

### 3.4 Dominio: undo solo cubre productos

- `ProductsPage.tsx` tiene `undoStack`/`moveEntryOnSuccess` (099/121); las
  operaciones de categorías (create/update/delete/reassign/nav-groups) no
  tienen undo. Un error de reasignación de categoría es irrecuperable desde
  la UI (solo vía change-sets si se usaron).

### 3.5 Datos: sin versionado de esquema

- `data/product_data.json` se valida contra `productCatalogSchema`
  (`repositories/productRepository.ts:67`) con schema único; no hay
  `schema_version` ni migraciones. El catálogo es el sistema de registro
  (ADR 0009): cualquier evolución de shape (p. ej. image_variants en 119)
  exige edición manual de datos o scripts ad-hoc.

### 3.6 Medios: sin operaciones batch

- El workbench (`MediaPage.tsx`) opera intent por intent; los intents ya
  tienen `progress` (media.ts) y estado durable — no hay "regenerar N",
  "aplicar selección" ni progreso agregado.

### 3.7 Operación

- **Publicación**: `routes/publication.ts` ejecuta publish manual/immediato
  vía `jobRunner.schedule` (líneas 81, 150); no hay publicación programada.
- **Observabilidad**: el error handler central (`app.ts:396-409`) hace
  `console.error` sin request-id ni correlación; no hay log estructurado.
- **Recovery UX**: `DiagnosticsPage.tsx:91` muestra "recuperación pendiente"
  solo en diagnóstico; el operador no recibe aviso proactivo.
- **Sync**: `SyncStatusPanel`/`ProductsPage.tsx:111` pollean cada 30 s; el
  server ya tiene SyncAdapter (`app.ts:112`) — no hay push.
- **Credential**: 125 escribió `data/.admin-credential` (0600) pero no hay
  comando de rotación ni detección de fuga.

### 3.8 Rendimiento residual

- Snapshot por request (105) clona el catálogo completo en cada GET: para el
  tamaño actual (~184 productos) es microsegundos, pero sin benchmark
  documentado. Medir antes de optimizar (F3.6 opcional).

---

## 4. Roadmap

Dependencias: F1 habilita F2 (los tests de componentes protegen el undo de
categorías; el lint limpio hace seguros los refactors); F2 habilita F3
(operación sobre un dominio estable).

### Fase 1 — Fundaciones de calidad (P0, 4–5 días)

#### F1.1 Harness de tests de componentes — **P0 · M**

- **Qué**: `vitest` + `@testing-library/react` + `jsdom` para `src/web/**`;
  `test/web/` con renderer de página real (mock del `ContentManagerClient`
  con `vi.mock`, patrón de fetch injectado).
- **Por qué**: ataca la causa raíz 3.1; retroalimentación en segundos para
  toda lógica de UI.
- **Archivos**: `package.json`, `vitest.config.ts` (añadir `environment:
jsdom` por archivo o `test/web`), nuevo `test/web/harness.tsx`.
- **Verificación**: un test de humo (`render(<ProductsPage/>` con client
  mock, `expect(getByLabel('Categoría:'))`) + portar las 4 aserciones de
  dialog de 126 al nivel de componente; `npm run admin:test` verde.

#### F1.2 Lint del árbol completo en verde — **P0 · S**

- **Qué**: corregir los 14 errores (imports sin uso, `prefer-const`,
  `no-require-imports`) y añadir `npx eslint . --config eslint.config.mjs` a
  `admin.yml` como paso (no solo lint-staged).
- **Por qué**: 3.3; sin esto, ningún refactor global es revisable.
- **Verificación**: `npx eslint src test` → 0 errores; CI nuevo paso verde.

#### F1.3 Paralelizar e2e admin en CI — **P1 · S**

- **Qué**: los 6 configs corren secuenciales; ejecutar los 5 de temp-repo en
  paralelo (workers independientes) manteniendo el operator suite aparte.
  scope.spec ya es orden-independiente (109).
- **Por qué**: wall-clock del gate e2e (~3 min → <1 min).
- **Verificación**: `admin.yml` con matriz de configs; run completo verde.

### Fase 2 — Robustez de dominio y contrato (P1, 7–9 días)

#### F2.1 Undo/redo de categorías — **P1 · M** (depende F1.1)

- **Qué**: `buildUndoEntry` análogo para categorías (snapshot de key/slug/
  nav_group/active/sort_order/display_name), stack con `moveEntryOnSuccess`
  (099), y batch endpoint de categorías con guard de revisión (patrón 121).
- **Por qué**: 3.4; la reasignación errónea es hoy irrecuperable.
- **Verificación**: tests de componente del stack + integración del batch
  endpoint (patrón `mutationApi.test.ts` plan 121) + e2e en scope.spec.

#### F2.2 Versionado de esquema del catálogo — **P1 · M**

- **Qué**: `schema_version` en `data/product_data.json` + registry de
  migraciones `data/migrations/` + hook en `loadCatalog` (migrar antes de
  validar) y en preflight del storefront.
- **Por qué**: 3.5; el shape ya evolucionó (119) sin mecanismo.
- **Verificación**: migración 1→2 de fixture (idempotente, atómica vía
  AtomicWriter), `npm run validate` verde.

#### F2.3 OpenAPI generado desde zod — **P1 · S–M**

- **Qué**: exponer `openapi.json` desde los schemas (`zod-openapi` o
  `@asteasolutions/zod-to-openapi` — evaluar con la política de deps), y
  validar el cliente tipado contra él en un test de contrato.
- **Por qué**: 3.2; elimina la derivación manual.
- **Verificación**: test que compila `client.ts` contra el openapi generado
  (cada ruta del client existe y coincide el shape).

#### F2.4 Media workbench: operaciones batch — **P2 · M**

- **Qué**: selección múltiple → "regenerar" / "aplicar" / "cancelar" sobre
  intents existentes, con progreso agregado en la lista.
- **Por qué**: 3.6; el estado durable ya lo soporta.
- **Verificación**: e2e en `playwright.media.config.ts` (crear 3 intents,
  batch-cancel, batch-run) + contrato del endpoint batch de intents.

### Fase 3 — Operación y producto (P2, 6–8 días)

#### F3.1 Publicación programada — **P2 · M**

- **Qué**: `publish_at` en change-sets + scheduler en el jobRunner existente
  (patrón `publication.ts:81`), cancelable desde la UI.
- **Verificación**: test de integración con `publish_at` futuro (fake timers
  o jobRunner con clock inyectado).

#### F3.2 Observabilidad: request-id + log estructurado — **P2 · S–M**

- **Qué**: hook `onRequest` que asigna `x-request-id`, error handler con
  `{req_id, route, error}` JSON a stderr, y cabecera de respuesta.
- **Por qué**: 3.7; hoy no hay correlación entre log y request.
- **Verificación**: test de integración que inyecta un 500 y aserta el
  request-id en la respuesta y en el log capturado.

#### F3.3 Recovery proactivo en la UI — **P2 · S**

- **Qué**: banner global (patrón del feedback existente) cuando
  `recoveryJournal.getPendingRecoveries()` > 0, con enlace a Diagnostics.
- **Por qué**: 3.7; hoy el aviso solo existe en el diagnóstico.
- **Verificación**: test de componente del banner con journal mock + smoke.

#### F3.4 Sync push (SSE) — **P2 · M**

- **Qué**: endpoint SSE `/api/v1/sync/events` + suscripción del panel en vez
  del polling de 30 s (`ProductsPage.tsx:111`).
- **Por qué**: 3.7; el SyncAdapter ya existe (app.ts:112).
- **Verificación**: test de integración SSE (conecta, dispara enqueue,
  recibe evento); el polling queda como fallback.

#### F3.5 Rotación de credential — **P2 · S**

- **Qué**: `npm run admin:rotate-credential` (genera, escribe `0600`, invalida
  la anterior) + nota de fuga en el README del admin.
- **Verificación**: test del script con repo temp (modo 0600, la vieja deja
  de autenticar).

#### F3.6 Benchmark de snapshots del catálogo (opcional) — **P3 · S**

- **Qué**: medir `loadCatalog` (clone) con el catálogo real; documentar el
  presupuesto antes de optimizar.
- **Verificación**: script `tools/bench-catalog-snapshot.mjs` con salida
  registrada en `reports/`.

---

## 5. Orden de ejecución y dependencias

```
F1.2 (lint) → F1.1 (harness) → F1.3 (paralelo e2e)
  → F2.1 (undo categorías) → F2.2 (schema_version) → F2.3 (OpenAPI) → F2.4 (media batch)
  → F3.1 (publicación programada) → F3.2 (observabilidad) → F3.3 (recovery UI)
  → F3.4 (SSE sync) → F3.5 (rotación) → F3.6 (benchmark, opcional)
```

Cada ítem es un plan de trabajo propio (spec/todo/tests según el método del
repo) con rollback `git revert <sha>`. Este documento es el índice maestro.

---

## 6. Criterios de éxito (métricas)

| Métrica                                    | Hoy       | Objetivo                                  |
| ------------------------------------------ | --------- | ----------------------------------------- |
| Errores de lint en `admin/content-manager` | 14        | 0 (CI lo exige)                           |
| Tests de componente en `test/web/`         | 0         | ≥ 30 (incl. undo stack, dialogs, filtros) |
| Contrato API: rutas cliente vs OpenAPI     | manual    | verificado por test                       |
| Wall-clock e2e admin en CI                 | ~3 min    | < 1.5 min                                 |
| Undo disponible para                       | productos | productos + categorías                    |
| Writes del catálogo sin schema_version     | 100 %     | 0 % (migraciones)                         |
| Time-to-feedback para cambio de UI         | e2e (min) | unit/componente (seg)                     |

## 7. Fuera de alcance (decisiones conscientes)

- **Alinear TS 6/7**: bloqueado upstream (typescript-eslint `<6.1.0`,
  @astrojs/check `^5||^6`) — documentado en `docs/operations/DEPENDENCY_POLICY.md` (plan 113).
- **Multi-usuario remoto / auth completa**: el modelo es local-first de
  operador único (plan 071); el sync (F3.4) es el paso hacia el modelo
  multi-caja, no una reescritura.
- **Migrar el storefront** fuera de Astro o unificar runtimes: no toca el
  Content Manager y tiene su propio ciclo (Auditorías del storefront).
- **Deuda del storefront** (dist sin excluir originals no referenciados,
  flake del reveal del shortcut mobile): documentada como follow-up del 119
  y del cierre de la Auditoría 9; se mantiene fuera de este plan.

## 8. Mantenimiento

Este plan es un índice vivo: cada ítem ejecutado se marca DONE en
`todo.md`, se archiva su plan de trabajo en `plans/archive/` y la fila de
`plans/README.md` se actualiza. La sección 6 se re-mide al cierre de cada
fase. Cualquier hallazgo nuevo del Content Manager entra como ítem nuevo en
este plan (no como plan suelto) hasta que el roadmap se vacíe.

## 9. Rollback

Los ítems se ejecutan como commits individuales (`git revert <sha>` por
ítem). El plan en sí es documentación: rollback no aplica.
