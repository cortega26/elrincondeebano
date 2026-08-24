# Implementation Plans

Índice de los planes de implementación (001–127). Generados por `/improve deep`
en nueve auditorías (2026-06-14 → 2026-08-12) y ampliados por la directiva de
migración del 2026-07-15 (plan 055) y el master roadmap del Content Manager
TS (plan 127). El retiro de Python (plan 069) se ejecutó el 2026-08-11 de
forma revertible. El histórico completo vive en
[`archive/README-history.md`](archive/README-history.md).

| Auditoría | Fecha      | Commit    | Planes  |
| --------- | ---------- | --------- | ------- |
| 1         | 2026-06-14 | `4751633` | 001–012 |
| 2         | 2026-07-14 | `633eeb8` | 013–024 |
| 3         | 2026-07-14 | `877f179` | 025–038 |
| 4         | 2026-07-15 | `8c903e3` | 039–054 |
| 5         | 2026-07-15 | `30dbab7` | 055     |
| 6         | 2026-07-16 | `30dbab7` | 056–069 |
| 7         | 2026-08-03 | `30dbab7` | 070–085 |
| 8         | 2026-08-11 | `cefdd9f` | 086–097 |
| 9         | 2026-08-12 | `ccb921f` | 098–126 |

**Status values**: `TODO | IN PROGRESS | PARTIAL | DONE | BLOCKED (reason) |
REJECTED (rationale)`, más `SUPERSEDED`/`ABSORBED` (reemplazados por el plan
055), `UNBLOCKED` (dependencia resuelta) y `RECONCILED` (plan consolidado como
hoja de ruta).

**Regla de archivo (fija e inevitable, 2026-08-12)**: al marcar un plan
`DONE`, su archivo se mueve a `plans/archive/` EN EL MISMO CAMBIO (git mv);
los DONE recientes se conservan como registro en las tablas de este README.
Los planes `SUPERSEDED`/`ABSORBED` también viven en `archive/` (precedente
050–054, 040–049 y 055); en la raíz solo queda la cola activa (`README.md`).
Está enforced mecánicamente por
`node tools/check-plan-archive.mjs` (falla si un plan DONE está fuera de
`archive/` o un link no resuelve): corre en `npm run validate`, en
lint-staged (`plans/**/*.md`) y en CI (`ci.yml`).

Cada executor debe leer el plan completo antes de empezar, respetar sus STOP
conditions, y actualizar su fila al terminar.

## Estado actual — 2026-08-13

- **Plan 127 (master roadmap del Content Manager)**: DONE el 2026-08-13 —
  las 3 fases (F1.1–F3.6, 50 ítems) verificadas, archivado en
  `plans/archive/127-content-manager-improvement/`; gates finales
  (`validate` + `validate:release`) verdes (`ee20b0f6`).
- **Auditoría 9 (098–126)**: completa el 2026-08-12 — todos DONE y
  archivados (bugs 098–105, tests 106–109, retiros de superficie 110–111,
  batch 2 112–126).
- **Auditoría 8 (086–097)**: completa el 2026-08-12 — 086–097 DONE y
  archivados; gates finales verdes. Ítems diferidos cerrados el 2026-08-12
  (`ff277fe`): search/filtro/expand de categorías, OG lifecycle automático
  (096) y media relocation (097).
- **Auditoría 7 (070–085)**: completa el 2026-08-11 (todos DONE, archivados).
- **Auditoría 6 (056–069)**: completa el 2026-08-11 (todos DONE, archivados).
  Retiro reversible de Python ejecutado (tag `v1.x-python-final` en
  `cefdd9f`; rollback: `git revert` o `git checkout v1.x-python-final --
admin/product_manager/`).
- **Residuales de Auditoría 3 (030, 031, 038)**: DONE el 2026-08-12 y
  archivados — la cola de planes TODO está vacía. 040–047 y 049 (Auditoría
  4, Python) quedaron `SUPERSEDED` al retirar Python (capacidades migradas
  al Content Manager TS).
- Los planes archivados se conservan como registro en las tablas de este
  README (regla de archivo enforceada por `tools/check-plan-archive.mjs`).

---

## Auditoría 10 — 2026-08-17 (`/improve deep`, commit `ee20b0f6`)

Auditoría completa (8 categorías, 8 subagentes paralelos) sobre el árbol post-cierre
del plan 127. Hallazgos vetados contra fuente (cada plan cita el código leído por el
advisor, no el reporte del subagente). Todos los hallazgos net-positivos se convirtieron
en planes 128–168 (bugs/seguridad → tests → perf → tech-debt → deps → docs → dirección).
Regresión detectada: el reorder se rompió con el fix del 2026-08-13 ("default list excludes
archived", `db6f00ca`) — plan 128. El drift de docs es el batch más grande desde 112.

| Plan                                                                | Título                                                                 | Prioridad | Esfuerzo | Depende de | Estado                                                                                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------- | -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [128](archive/128-fix-reorder-with-archived-products.md)            | Reorder roto con productos archivados (regresión)                      | P1        | S        | —          | DONE — 2026-08-17 (`ca74544a`, worktree `advisor/128-fix-reorder-with-archived-products`; merged a main `9d9586eb`)          |
| [129](archive/129-fix-category-redo-snapshot.md)                    | Category redo re-aplica el snapshot pre-edición                        | P1        | S        | —          | DONE — 2026-08-17 (`cb8ef36b`, worktree `advisor/129-fix-category-redo-snapshot`; merged a main `9d9586eb`)                  |
| [130](archive/130-clear-publication-recovery-on-handled-failure.md) | Limpiar journal de publicación en fallo/cancelación                    | P1        | S        | —          | DONE — 2026-08-17 (`a0a1eecf`, worktree `advisor/130-clear-publication-recovery`; merged a main `9d9586eb`)                  |
| [131](archive/131-fix-backup-recovery-journal.md)                   | Backup recovery-protection lee el journal equivocado                   | P1        | S        | —          | DONE — 2026-08-17 (`a30fb860`, worktree `advisor/131-fix-backup-recovery-journal`; merged a main `9d9586eb`)                 |
| [132](archive/132-harden-dev-server-path-containment.md)            | dev-server: contención por segmentos + symlinks                        | P1        | S        | —          | DONE — 2026-08-17 (`7188d630`, worktree `advisor/132-harden-dev-server-path-containment`; merged a main `9d9586eb`)          |
| [133](archive/133-align-openapi-with-routes.md)                     | OpenAPI alineado con las rutas reales                                  | P2        | S        | —          | DONE — 2026-08-17 (`7c074805`, worktree `advisor/133-align-openapi-with-routes`; merge pendiente de decisión del maintainer) |
| [134](archive/134-enforce-category-in-use-guard-on-batch-delete.md) | Guard CATEGORY_IN_USE en batch delete (undo de create)                 | P1        | S-M      | —          | DONE — 2026-08-21 (`a5da7dc5`, direct on main; review approved)                                                              |
| [135](archive/135-complete-git-conflict-detection.md)               | Detección completa de conflictos git + ahead/behind                    | P2        | S        | —          | DONE — 2026-08-22 (`dbd800bb`, worktree `advisor/135-complete-git-conflict-detection`; merged a main `f16437b8`)             |
| [136](archive/136-admin-shutdown-and-sync-interval-hygiene.md)      | Shutdown: timers de jobs + catch del sync interval                     | P2        | S        | —          | DONE — 2026-08-22 (`0e49b86b`, worktree `advisor/136-admin-shutdown-and-sync-interval-hygiene`; merged a main `78d56f1d`)    |
| [137](archive/137-sw-cache-version-only-on-success.md)              | SW: version de cache solo en éxito de invalidación                     | P2        | S        | —          | DONE — 2026-08-22 (`94e711d4`, worktree `advisor/137-sw-cache-version-only-on-success`; merged a main `0095204c`)            |
| [138](archive/138-media-batch-discard-and-target-validation.md)     | Media: discard batch limpia outputs + targets raster                   | P2        | S-M      | —          | DONE — 2026-08-22 (`e8e1ec30`, worktree `advisor/138-media-batch-discard-and-target-validation`; merged a main `468041c4`)   |
| [139](archive/139-sync-surface-hardening.md)                        | Superficie sync: cap de SSE + config 0600 + gitignore                  | P2        | S        | —          | DONE — 2026-08-22 (`f337be45`, worktree `advisor/139-sync-surface-hardening`; merged a main `55273ad4`)                      |
| [140](archive/140-storefront-money-math-tests.md)                   | Tests unitarios del dinero (cart + order submit)                       | P1        | M        | —          | DONE — 2026-08-22 (`c606c2ee`, worktree `advisor/140-storefront-money-math-tests`; merged a main `c499ee9c`)                 |
| [141](archive/141-withfreshrev-409-retry-test.md)                   | Component-test del retry 409 (withFreshRev)                            | P1        | S        | —          | DONE — 2026-08-22 (`1bb9b295`, worktree `advisor/141-withfreshrev-409-retry-test`; merged a main `4cd19dd8`)                 |
| [142](archive/142-rescope-a11y-suites.md)                           | Re-scope de las suites a11y (source-string → honestas)                 | P2        | S        | —          | DONE — 2026-08-22 (`5088e53a`, worktree `advisor/142-rescope-a11y-suites`; merged a main `d0071afe`)                         |
| [143](archive/143-recovery-banner-test-coverage.md)                 | Cobertura RecoveryBanner + cart-recovery del storefront                | P2        | S        | —          | DONE — 2026-08-22 (`bb144b15`, worktree `advisor/143-recovery-banner-test-coverage`; merged a main `adb82ecc`)               |
| [144](archive/144-remove-timing-flakiness.md)                       | Eliminar flakiness de timing (thresholds + sleeps reales)              | P2        | S        | —          | DONE — 2026-08-23 (`06a52388`, worktree `advisor/144-remove-timing-flakiness`; merged a main `1bdac06a`)                     |
| [145](145-dev-tool-reconciliation.md)                               | Reconciliar dev-tools: decisión stryker + changesets 3.0               | P2        | S-M      | 140        | TODO                                                                                                                         |
| [146](archive/146-sw-stale-while-revalidate.md)                     | SW stale-while-revalidate para assets estáticos                        | P2        | S-M      | 137        | DONE — 2026-08-23 (`f809adc6`, worktree `advisor/146-sw-stale-while-revalidate`; merged a main `d6224084`)                   |
| [147](archive/147-sync-queue-cache-and-prune.md)                    | Sync queue: cache de lecturas + prune de entradas terminales           | P2        | S-M      | —          | DONE — 2026-08-23 (`f17d6b62`, worktree `advisor/147-sync-queue-cache-and-prune`; rebased onto `3d6463f3` → `1b198b55`)      |
| [148](archive/148-media-inventory-cache.md)                         | Cache del inventario de media (mtime-keyed)                            | P2        | S        | —          | DONE — 2026-08-23 (`530fb79c`, worktree `advisor/148-media-inventory-cache`; merged a main `33b7cccb`)                       |
| [149](149-storefront-interaction-perf.md)                           | Perf de interacción storefront (companion cache + reorder gating)      | P2        | S        | —          | TODO                                                                                                                         |
| [150](150-memoize-admin-stable-data.md)                             | Memoizar datos estables del admin (OpenAPI, storefront)                | P2        | S        | —          | TODO                                                                                                                         |
| [151](151-finish-client-unification.md)                             | Completar plan 115: 11 fetch sueltos → ContentManagerClient            | P2        | S        | —          | TODO                                                                                                                         |
| [152](152-repository-base-class.md)                                 | Base compartida de repositorios JSON + writer atómico multi-target     | P2        | M        | —          | TODO                                                                                                                         |
| [153](153-consolidate-route-orchestration.md)                       | Consolidar orquestación de rutas (helper catalog-command)              | P2        | M        | 128, 141   | TODO                                                                                                                         |
| [154](154-unify-validation-layers.md)                               | Unificar las 4 capas de validación en zod canónico                     | P3        | L        | —          | TODO                                                                                                                         |
| [155](155-retire-src-js-zombie-surface.md)                          | Retirar src/js zombie (extraer funciones vivas primero)                | P2        | M        | 140        | TODO                                                                                                                         |
| [156](156-image-pipeline-consolidation.md)                          | Consolidar pipeline de imágenes + portar renderer OG a Node            | P3        | L        | —          | TODO                                                                                                                         |
| [157](157-remove-vestigial-surfaces.md)                             | Remover superficies vestigiales (cypress, panel, config Python muerta) | P2        | S        | —          | TODO                                                                                                                         |
| [158](158-split-changes-routes.md)                                  | Split de changes.ts (1.076 líneas) en 3 módulos                        | P3        | M        | —          | TODO                                                                                                                         |
| [159](159-remove-inert-overrides.md)                                | Quitar overrides inertes de astro-poc                                  | P3        | S        | —          | TODO                                                                                                                         |
| [160](160-vendored-anymatch-drift-guard.md)                         | Guard de drift dir↔tgz del anymatch vendoreado                         | P3        | M        | —          | TODO                                                                                                                         |
| [161](161-fix-docs-config-drift.md)                                 | Batch de drift docs/config (9 ítems DX + DEP-04)                       | P2        | S-M      | —          | TODO                                                                                                                         |
| [162](162-scheduled-publication-ui.md)                              | UI de publicación programada (terminar F3.1)                           | P3        | M        | 133        | TODO                                                                                                                         |
| [163](163-generated-typed-client-spike.md)                          | Spike: cliente tipado generado del OpenAPI/zod                         | P3        | M        | 133        | TODO                                                                                                                         |
| [164](164-build-preview-job-spike.md)                               | Spike: job "build + preview" dentro del admin                          | P3        | M        | —          | TODO                                                                                                                         |
| [165](165-rescope-parity-gate.md)                                   | Re-scope del gate de parity Python → regresión de round-trip           | P2        | S        | —          | TODO                                                                                                                         |
| [166](166-whatsapp-notify-on-out-of-stock.md)                       | WhatsApp "Avísame cuando vuelva" en tarjetas AGOTADO                   | P3        | S        | —          | TODO                                                                                                                         |
| [167](167-resolve-observability-dead-end.md)                        | Resolve observability dead end (ADR 0010 go/no-go)                     | P3        | M        | —          | TODO                                                                                                                         |
| [168](archive/168-dependabot-auto-merge-patch-only.md)              | Auto-merge Dependabot patch PRs only when CI is green                  | P2        | S        | —          | DONE — 2026-08-23 (`87e3115c`, worktree `advisor/168-dependabot-auto-merge-patch-only`; merged a main `f46d5c00`)            |

### Dependencias (Auditoría 10)

- **140 antes de 145 y 155**: stryker y el retiro de `src/js` necesitan la cobertura de dinero en los módulos vivos.
- **128 y 141 antes de 153**: el fix de reorder y el test del retry 409 pinean el contrato que 153 consolida.
- **137 antes de 146**: el SWR solo es seguro con el versionado de cache fiable.
- **133 antes de 162 y 163**: las shape-assertions del OpenAPI habilitan el cliente/UI.
- Dos planes no editan el mismo archivo en paralelo (regla de la casa): 149 y 140 tocan `storefront.js`-side pero en archivos distintos; 155 y 140 también (155 depende de 140 por orden).

### Orden de ejecución recomendado

128 → 129 → 130 → 131 → 132 → 134 → 140 → 141 → 133 → 135 → 136 → 137 → 146 → 138 → 139 → 168 → 142 → 143 → 144 → 147 → 148 → 149 → 150 → 151 → 152 → 153 → 157 → 158 → 159 → 160 → 161 → 145 → 165 → 155 → 162 → 166 → 163 → 164 → 167 → 154 → 156 (los L al final).

### Considerados y rechazados (Auditoría 10)

- **Autenticar las lecturas del admin (SEC-03, parte)**: rechazado — la clasificación read de los GETs es por diseño (control plane loopback-local); gatear las lecturas rompería el UI sin un cambio cliente equivalente. Sí se aceptó el cap de conexiones SSE + perms del config (plan 139).
- **structuredClone del catálogo por request (PERF-07)**: rechazado — es la garantía de aislamiento por request del plan 105; no se cachea.
- **Path traversal en el servidor estático del admin (app.ts)**: refutado empíricamente en Auditoría 7; no re-reportado. El dev-server (`scripts/dev-server.mjs`) SÍ es un caso real → plan 132.
- **`service-worker.js` raíz vs `astro-poc/public`**: no es finding — sync-data.mjs lo copia en build; byte-idénticos.
- **`test/e2e-astro` vs admin e2e**: no son duplicados (storefront UX vs admin API/UI).
- **TS 6 vs 7 (root vs admin)**: decisión documentada del plan 113, aún vigente (peers de typescript-eslint/@astrojs/check bloquean TS 7 en root).
- **Bootstrap/@popperjs**: mantenimiento congelado por diseño.
- **`.coverage`/`coverage/`, `.mypy_cache`/`.ruff_cache`/`.pytest_cache`**: no commiteados, gitignored; los artefactos Python reaparecen porque `tools/category_og` corre en preflight → plan 156 los elimina de raíz.
- **`reports/bench-catalog-snapshot.json`**: 0.393 ms para 184 productos — sin problema de costo; idea de alerta de drift descartada.

### Alcance no auditado (Auditoría 10)

E2E completo (requiere build), comportamiento en vivo del sitio, internals de `tools/category_og/*.py` (solo la interfaz de spawn), cuerpos de `.github/actions/*` composites, `_archive/` (intencional). Los hallazgos LOW-confidence sin plan ("investigar") no se reportaron.

---

## Auditoría 9 — 2026-08-12 (`/improve deep`, commit `ccb921f`)

Auditoría completa (8 categorías, subagentes paralelos) sobre el árbol post
release v1.5.0. Todos los hallazgos con evidencia verificada; los net-positivos
se convirtieron en planes 098+. Orden de ejecución recomendado por
dependencias: bugs primero (098–105), tests (106–109), retiro de superficie
(110–111), luego el batch 2 (112+).

| Plan                                                                   | Título                                              | Prioridad | Esfuerzo | Depends on | Estado          |
| ---------------------------------------------------------------------- | --------------------------------------------------- | --------- | -------- | ---------- | --------------- |
| [098](archive/098-fix-cart-subtotal-discount-fast-path.md)             | Subtotal del carrito ignora descuento (fast path)   | P1        | S        | —          | DONE 2026-08-12 |
| [099](archive/099-fix-undo-redo-stack-semantics.md)                    | Undo/redo corrompen las pilas al fallar             | P1        | M        | —          | DONE 2026-08-12 |
| [100](archive/100-harden-media-relocation-paths.md)                    | Path traversal vía `category` en mediaRelocation    | P1        | S        | —          | DONE 2026-08-12 |
| [101](archive/101-fix-reorder-gating-under-discount-filters.md)        | Reorder habilitado con filtros → 409 garantizado    | P1        | S        | —          | DONE 2026-08-12 |
| [102](archive/102-fix-bulk-apply-noop-revs.md)                         | bulkApply cuenta no-ops como modificados            | P2        | S        | —          | DONE 2026-08-12 |
| [103](archive/103-harden-media-intent-runner.md)                       | Intent runner sin catch → estado atascado           | P2        | S        | —          | DONE 2026-08-12 |
| [104](archive/104-storefront-routes-error-classification.md)           | PUT storefront convierte 500 en 400                 | P2        | S        | —          | DONE 2026-08-12 |
| [105](archive/105-isolate-catalog-snapshots-per-request.md)            | Catálogo mutable compartido → falsos 409            | P1        | M        | —          | DONE 2026-08-12 |
| [106](archive/106-test-category-og-lifecycle.md)                       | Cero tests en categoryOgLifecycle                   | P1        | M        | —          | DONE 2026-08-12 |
| [107](archive/107-storefront-cart-e2e-hardening.md)                    | E2E: dismiss del offcanvas + subtotal con descuento | P1        | S        | 098        | DONE 2026-08-12 |
| [108](archive/108-port-durability-fault-injection-to-atomic-writer.md) | Portar fault-injection a AtomicWriter               | P2        | M        | —          | DONE 2026-08-12 |
| [109](archive/109-fix-scope-spec-order-dependence.md)                  | scope.spec orden-dependiente (fixture compartido)   | P2        | S        | —          | DONE 2026-08-12 |
| [110](archive/110-retire-dead-e2e-surface.md)                          | Scripts e2e muertos + 8 specs legacy                | P1        | S        | —          | DONE 2026-08-12 |
| [111](archive/111-retire-legacy-sync-server-and-python-surface.md)     | Retirar sync API legacy + superficie Python         | P1        | S        | 108        | DONE 2026-08-12 |

Batch 2 — perf/deps/DX/seguridad (112–126):

| Plan                                                          | Título                                                     | Prioridad | Esfuerzo | Depends on | Estado          |
| ------------------------------------------------------------- | ---------------------------------------------------------- | --------- | -------- | ---------- | --------------- |
| [112](archive/112-fix-claude-md-drift.md)                     | CLAUDE.md stale (run-all.js, Astro 6)                      | P1        | S        | —          | DONE 2026-08-12 |
| [113](archive/113-dependency-hygiene.md)                      | Deps muertas + playwright skew + decisión TS 7             | P2        | S        | —          | DONE 2026-08-12 |
| [114](archive/114-split-catalog-routes-module.md)             | Split de catalog.ts (1028 líneas)                          | P2        | M        | —          | DONE 2026-08-12 |
| [115](archive/115-unify-admin-data-fetching.md)               | Unificar fetch en ContentManagerClient                     | P2        | M        | —          | DONE 2026-08-12 |
| [116](archive/116-extract-storefront-cart-module.md)          | Extraer módulo de carrito de storefront.js                 | P3        | L        | —          | DONE 2026-08-12 |
| [117](archive/117-complete-storefront-storage-abstraction.md) | Storage: favorites + shared-cart feedback                  | P3        | S        | —          | DONE 2026-08-12 |
| [118](archive/118-bootstrap-deep-imports.md)                  | Deep imports de Bootstrap (quitar monolith)                | P2        | M        | —          | DONE 2026-08-12 |
| [119](archive/119-image-payload-optimization.md)              | Imágenes: LCP-only priority + variant faltante + huérfanos | P2        | M        | —          | DONE 2026-08-12 |
| [120](archive/120-catalog-view-keys-and-companion-map.md)     | Precomputar sort keys + mapa companion                     | P3        | S        | —          | DONE 2026-08-12 |
| [121](archive/121-batch-undo-endpoint.md)                     | Endpoint de batch-undo (1 write por undo)                  | P3        | M        | 099        | DONE 2026-08-12 |
| [122](archive/122-eslint-shared-base.md)                      | Base ESLint compartida (triplicación)                      | P3        | M        | —          | DONE 2026-08-12 |
| [123](archive/123-playwright-shared-base.md)                  | Base Playwright compartida (6 configs)                     | P3        | M        | —          | DONE 2026-08-12 |
| [124](archive/124-admin-dev-watch-mode.md)                    | Watch mode para admin dev (server + HMR)                   | P3        | M        | —          | DONE 2026-08-12 |
| [125](archive/125-admin-security-hardening.md)                | IDs criptográficos + credential en archivo 0600            | P2        | S        | —          | DONE 2026-08-12 |
| [126](archive/126-assert-destructive-confirm-dialogs.md)      | Asertar dialogs destructivos en e2e                        | P3        | S        | —          | DONE 2026-08-12 |

Orden de ejecución recomendado: 098 → 100 → 101 → 107 → 099 → 121 → 102 →
103 → 104 → 105 → 106 → 108 → 111 → 109 → 110 → 112 → 113 → 114 → 115 →
117 → 118 → 119 → 120 → 122 → 123 → 124 → 125 → 126 → 116 (el L al final).

---

## Auditoría 9 cerrada — Plan 127 (master roadmap del Content Manager)

| Plan                                                   | Título                                                                                         | Prioridad | Esfuerzo | Depende de           | Estado                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | --------- | -------- | -------------------- | ------------------------------ |
| [127](archive/127-content-manager-improvement/spec.md) | Roadmap de mejora del Content Manager TS (3 fases: fundaciones → dominio/contrato → operación) | P1        | L        | Auditoría 9 completa | DONE — 2026-08-13 (`ee20b0f6`) |

Espec en `plans/archive/127-content-manager-improvement/spec.md`; sub-tareas
verificables en `plans/archive/127-content-manager-improvement/todo.md`
(50 ítems, F1.1…F3.6, todos verificados). Cada ítem (F1.1…F3.6) se ejecuta
como plan de trabajo propio con su commit y rollback. Métricas objetivo en la
sección 6 del spec.

---

## Reconciliación final — 2026-08-12

La cola de planes TODO quedó vacía. Tabla de reconciliación histórica
(2026-08-10) sustituida: los planes 030/031/038 (Auditoría 3) se ejecutaron
el 2026-08-12 (durabilidad del ProductStore, retiro de Partytown/Bootstrap
barrel, spike de funnel → ADR 0010) y los planes 056–085 (Auditorías 6 y 7)
cerraron con sus evidencias en las tablas de cola. 040–047 y 049 quedaron
SUPERSEDED con el retiro de Python (069).

Pendientes documentados (ítems diferidos de planes cerrados):

| Ítem                                          | Origen | Estado                                             |
| --------------------------------------------- | ------ | -------------------------------------------------- |
| Search/filtro/expand de categorías            | 096    | DONE 2026-08-12 (ui en CategoriesPage + scope e2e) |
| OG lifecycle automático en CRUD de categorías | 096    | DONE 2026-08-12 (`categoryOgLifecycle.ts`)         |
| Media relocation al cambiar categoría         | 097    | DONE 2026-08-12 (`mediaRelocation.ts`)             |

Cierre de diferidos: `ff277fe` (gates: vitest 506/506, e2e 19/19, scope e2e
16/16 ×3, lint, certify). Rollback: `git revert ff277fe`.

---

## Cola vigente — Auditoría 7: integridad de escritura, evidencia y compromiso del árbol

Generada por `/improve deep` el 2026-08-03 contra `30dbab7` (working tree con
todo el trabajo de la migración sin commitear). Esta auditoría encontró que la
migración se documenta como completa mientras `admin/content-manager/` (la app
"canónica"), los planes 026–069, CUTOVER.md y ADR 0008 están 100 % untracked:
un clone limpio no puede hacer `npm ci` y el job `test-ts` de `admin.yml`
apunta a un directorio inexistente en el checkout. Todos los hallazgos de
Auditoría 6 (F01–F21) siguen TODO; esta cola agrega la integridad de la
frontera de escritura y la verificación del estado real sobre esa base.

### Orden de ejecución y estado

<!-- markdownlint-disable MD060 -->

| Plan                                                           | Título                                                          | Priority | Effort | Depends on | Status                                                                                                                                                                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------- | -------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [070](archive/070-commit-canonical-content-manager.md)         | Commit del Content Manager canónico y del registro de migración | P0       | M      | —          | DONE — `27d6c0e` (2026-08-03)                                                                                                                                                                                 |
| [071](archive/071-enforce-write-boundary.md)                   | Frontera de escritura: clasificación de rutas, bootstrap y Host | P0       | M      | 070        | DONE — `ad7b303` (2026-08-03)                                                                                                                                                                                 |
| [072](archive/072-make-publication-commit-scoped.md)           | Publicación commit scoped a ownedPaths + no-unrelated-staged    | P1       | M      | 070, 071   | DONE — 2026-08-10                                                                                                                                                                                             |
| [073](archive/073-fix-lossless-import-apply.md)                | Import aplica productos nuevos y reporta conteos reales         | P1       | M      | 070        | DONE — `df0d74c`, `62c8e2b`, `653b84f` (2026-08-09)                                                                                                                                                           |
| [074](archive/074-enforce-discount-invariant-schemas.md)       | Invariante discount ≤ price en todos los write boundaries       | P1       | S–M    | 070        | DONE — `7f545f7`, `4a16c6d`, `2a0d926` (2026-08-09)                                                                                                                                                           |
| [075](archive/075-fail-closed-build-contract-tests.md)         | Tests de contrato de build fail-closed                          | P1       | S      | —          | DONE — `316924a` (2026-08-03)                                                                                                                                                                                 |
| [076](archive/076-fix-backup-id-collision.md)                  | IDs de backup únicos (flake de CI + pérdida de datos)           | P1       | S      | 070        | DONE — (2026-08-08)                                                                                                                                                                                           |
| [077](archive/077-fix-bulk-undo-snapshot.md)                   | Undo bulk con snapshot de valores previos siempre               | P1       | S      | 070        | DONE — (2026-08-08)                                                                                                                                                                                           |
| [078](archive/078-close-atomic-writer-recovery-gap.md)         | Restore-on-failure del AtomicWriter + journal conectado         | P1       | M      | 070        | DONE — `180b023`..`eb85e13` (2026-08-09)                                                                                                                                                                      |
| [079](archive/079-align-cutover-docs-with-evidence.md)         | Docs de cutover/onboarding alineadas con la evidencia           | P1       | S–M    | 070        | DONE — `68850f1` (2026-08-03)                                                                                                                                                                                 |
| [080](archive/080-harden-category-concurrency-and-id-paths.md) | Concurrencia optimista de categorías + IDs contenidos           | P2       | M      | 070, 071   | DONE — 2026-08-10                                                                                                                                                                                             |
| [081](archive/081-fix-empty-bundles-persistence.md)            | Persistir bundles vacíos (stale storefront-bundles.json)        | P2       | S      | 070        | DONE — `158c327` (2026-08-03)                                                                                                                                                                                 |
| [082](archive/082-resolve-admin-ci-and-dep-audits.md)          | CI admin alineada al retiro + npm audit HIGHs                   | P1       | M      | 070, 076   | DONE — `be11b20c` (2026-08-11): `test-web` y `admin/web` retirados (copia en `_archive/admin-web/`), `npm audit --omit=dev` en `test-ts`; audit 0 vulns, parity 0 diffs                                       |
| [083](archive/083-characterize-category-mutation-boundary.md)  | Tests de caracterización categorías + ensureDiscountToggle real | P2       | M      | 070, 080   | DONE — `1952d92`, `8d150f0`, `5f23b3a` (2026-08-11): contract `categoryService` 0 → 94.8 % statements, rutas create/edit/delete-in-use/nav-groups/401/405, `ensureDiscountToggle` real vía `bindFilterEvents` |
| [084](archive/084-unify-monorepo-validation-and-lint.md)       | validate/typecheck del monorepo + lint de .tsx                  | P2       | S      | 070        | DONE — `5552137` (2026-08-03)                                                                                                                                                                                 |
| [085](archive/085-add-parking-degraded-mode.md)                | Modo degradado de parking con datos externos caídos             | P2       | S      | —          | DONE — `d49dbf2` (2026-08-03)                                                                                                                                                                                 |

<!-- markdownlint-enable MD060 -->

### Dependency graph

```text
070 commit del árbol (desbloquea todo lo demás)
 ├─► 071 frontera de escritura ──► 072 publication scoped
 ├─► 073 import lossless
 ├─► 074 invariante discount
 ├─► 076 backup IDs ──► 082 CI admin + audit
 ├─► 077 undo bulk
 ├─► 078 atomic writer
 ├─► 079 docs vs evidencia
 ├─► 080 categorías ──► 083 caracterización
 ├─► 081 bundles vacíos
 └─► 084 validación monorepo
075 y 085 son independientes (storefront/root tests)
```

### Secuencia de ejecución óptima (Auditoría 7)

Ruta crítica: **070 → 071 → {072, 080}** y **070 → 076 → 082**. Todo lo demás
cuelga de 070. Regla de archivos: dos planes que editan el mismo archivo NO
corren en paralelo. Conflictos conocidos: 071 y 076 (backup.ts), 071 y 078
(app.ts), 080 y 076 (backup.ts).

```text
WAVE 0  FUNDACIÓN (bloquea todo)
  070 commit del árbol canónico + registro de migración

WAVE 1  SEGURIDAD + INDEPENDIENTES (en paralelo, 1 ejecutor por plan)
  071 frontera de escritura          ← ruta crítica
  ├─ en paralelo (sin tocar sus archivos):
  │   075 tests fail-closed (root test/)
  │   079 docs vs evidencia (docs/)
  │   081 bundles vacíos (storefrontRepository.ts)
  │   084 validación monorepo + lint (package.json, eslint)
  │   085 parking degradado (astro-poc/src)
  └─ NO en paralelo con 071: 076, 078, 080 (editan backup.ts / app.ts)

WAVE 2  INTEGRIDAD DE DATOS (después de 070; 078/080 después de 071)
  073 import lossless (changes.ts, ImportPage.tsx)
  074 invariante discount (productService, schemas)
  076 backup IDs únicos (backup.ts — tras 071)
  077 undo bulk (ProductsPage.tsx)
  078 atomic writer + journal (tras 071)

WAVE 3  PUBLICACIÓN + CONCURRENCIA + CI
  072 publication scoped (tras 071)
  080 concurrencia de categorías + IDs (tras 071)
  082 CI admin + audit (tras 076; 070 ya está)

WAVE 4  VERIFICACIÓN
  083 caracterización categorías (tras 080)

COMPLETO DE COLA: filas 070–085 en DONE. Luego ejecutar lo que conservan
los planes viejos reconciliados (057 Step 4, 058/059/060 restantes) y
reanudar la cola 056–069 hacia el gate terminal 069 (retiro de Python).
```

Justificación del orden: seguridad antes que integridad de datos (071 antes de
que los arreglos de datos tengan una frontera autenticada que los proteja);
integridad antes que CI (082 incorpora la cobertura flaky que arregla 076);
caracterización de categorías al final porque 080 cambia los contratos que
083 debe pinear. 075 y 085 son aislables y desbloquean valor inmediato
sin depender de la migración.

### Reconciliación con colas previas (obligatoria antes de ejecutar)

Los planes 070–085 ejecutan **partes** de planes TODO de la Auditoría 6. Antes de
ejecutar cualquier plan viejo o nuevo, leer esta tabla: el executor NO debe
reimplementar lo que ya cubre un plan nuevo, ni el plan nuevo ignorar lo que el
viejo aún exige.

| Plan viejo (TODO)                       | Alcance ejecutado por                                                                   | Queda pendiente en el plan viejo                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 057 (P0, write boundary)                | **071** (Steps 1–3: clasificación de rutas, credential, modos)                          | Step 4 (sync secrets fuera del repo) y el test de proceso-spawned de Step 3                                 |
| 058 (P0, publication/paths fail-closed) | **072** (commit scoped) + **080** (IDs contenidos en change-sets/conflicts/backup)      | Recovery journal de publicación y el helper de contención compartido                                        |
| 059 (P1, invariantes de catálogo)       | **074** (discount ≤ price) + **077** (bulk undo) + **080** (concurrencia de categorías) | Idempotencia/replay (F18), reorder (F08), metadata de revisión (F09), identidad/borrado de categorías (F11) |
| 060 (P1, import/export lossless)        | **073** (flujo actual de import arreglado)                                              | Schemas tipados, CSV, parity Python, export lossless                                                        |
| 067 (P2, backups)                       | **076** (IDs únicos)                                                                    | Retención/pruning, listing no bloqueante                                                                    |
| 068 (P2, deps)                          | **082** (audit gate en test-ts)                                                         | Contrato de lockfile/determinismo de `npm ci`                                                               |
| 056, 061–066, 069                       | —                                                                                       | Sin solape directo; siguen TODO como estaban                                                                |

Regla de precedencia: los planes nuevos NO dependen de los viejos (excepto el
orden interno 070→085); si un plan viejo y uno nuevo tocan el mismo archivo,
el nuevo se ejecuta primero y el viejo se actualiza en el mismo cambio (sus
"Current state" ya citan la versión nueva del código).

### Finding coverage matrix (Auditoría 7)

| Finding (resumido)                                                           | Plan |
| ---------------------------------------------------------------------------- | ---- |
| F1 árbol canónico sin commitear / CI roto al merge                           | 070  |
| F2 frontera de escritura no funcional (policy stale + bootstrap leak + Host) | 071  |
| F3 publication commitea archivos ajenos                                      | 072  |
| F4 import no aplica productos nuevos                                         | 073  |
| F5 invariante discount > price eludible + schemas contradictorios            | 074  |
| F6 `npm test` verde con contratos de build sin ejecutar                      | 075  |
| F7 backup IDs colisionan por milisegundo                                     | 076  |
| F8 undo bulk restaura valores equivocados                                    | 077  |
| F9 hueco del atomic writer + journal muerto                                  | 078  |
| F10 CUTOVER/docs contradicen la evidencia                                    | 079  |
| F11 categorías sin guardas de concurrencia + IDs en paths                    | 080  |
| F12 storefront-bundles.json stale al vaciar                                  | 081  |
| F13 Streamlit retirado pero CI lo testea + npm audit 5 HIGH                  | 082  |
| F14 categorías 0 % cobertura + copy-test del toggle                          | 083  |
| F15 sin validación única de monorepo + .tsx sin lint                         | 084  |
| F16 parking hard-fail con dependencias externas                              | 085  |

### Alcance auditado y rechazado (Auditoría 7)

- Auditado: `admin/content-manager/` completo (63 src / 40 test), deltas
  Python sin commitear, storefront Astro, tools, CI, docs, dependencias.
- No auditado: E2E completo (requiere build), verificación en vivo de
  feriados.cl (404), internals de `admin/web/` (retirado) y `_archive/`.
- Rechazado: path traversal en el servidor estático (`app.ts:213-244`) —
  **refutado empíricamente**: 7 variantes (`..`, `%2e%2e`, `%2f`, dobles)
  contra servidor en vivo devuelven el SPA fallback; el router de Fastify
  normaliza. Queda como nota de hardening, no como finding.
- Rechazado: "sync-category-catalog.js tiene 8 try blocks" — mal atribuido
  (43 líneas, sin try); el patrón real de fallo silencioso es
  `sync-category-og-overrides.mjs` (exit 0 con overrides faltantes).
- Rechazado: "src/data/products.json es stale" (ADR 0008) — falso hoy:
  byte-idéntico al canónico (140 974 B), se copia en el build.
- Rechazado: @popperjs/core sin releases — peer de Bootstrap,
  mantenimiento-frozen por diseño.

---

## Directiva cumplida — Migración paralela del Content Manager

| Plan                                                            | Título                                         | Priority | Effort | Depends on | Status                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------- | -------- | ------ | ---------- | ------------------------------------------------------------------------ |
| [055](archive/055-build-parallel-typescript-content-manager.md) | TypeScript 7 + Fastify + React Content Manager | P1       | XL     | 036, 039   | CUMPLIDA — roadmap de ejecución 056–069 DONE; Python retirado (plan 069) |

El plan 055 autorizó la aplicación paralela y reemplazó como destino los planes
050–052 y 054 orientados a Tkinter. Sus requisitos de seguridad y workflow se
conservaron como criterios de aceptación TypeScript, junto con los findings
040–047 y la migración de identidad 053. El cutover se completó (plan 069,
certificación 30/30) y Python/Tkinter se retiró de forma reversible
(tag `v1.x-python-final`). El roadmap vigente del Content Manager es el
plan 127 (master roadmap, 3 fases). Progreso fase a fase en
`plans/archive/055-progress.md`.

---

## Cola vigente — Auditoría 6: certificación y paridad final del Content Manager TS

Generada por `/improve deep` el 2026-07-16 contra `30dbab7`. Esta cola reconcilia
la implementación real de `admin/content-manager/` con el objetivo de retirar
Python únicamente después de migrar todas sus capacidades. Los planes agrupan
los 21 findings auditados en incrementos arquitectónicos coherentes; ningún
finding quedó descartado.

### Decisiones de arquitectura

1. **Sync remoto se implementa, no se elimina.** El requisito del maintainer es
   migrar toda la funcionalidad Python; por eso el plan 064 porta cola, push/pull,
   retries y conflictos con credenciales fuera del repositorio.
2. **Media es un workbench transaccional.** El plan 063 reemplaza uploads directos
   y endpoints no-op por intents/jobs durables, staging, preview, generación,
   apply/rollback y recuperación.
3. **Change sets son el núcleo de mutación.** El plan 062 convierte drafts,
   history, undo/redo, backups y recovery en un control center, en vez de mantener
   rutas que escriben archivos canónicos por caminos independientes.
4. **Interchange y storefront son superficies tipadas.** Los planes 060 y 066
   eliminan JSON manual como workflow primario y migran import/export, pickers,
   bundles y featured content con preview y referencia validada.
5. **Python no se retira por fecha.** El plan 069 exige evidencia ejecutable,
   shadow runs, rollback drills y aceptación explícita antes del commit aislado
   de retiro.

### Orden de ejecución y estado

| Plan                                                          | Título                                           | Priority | Effort | Depends on         | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------ | -------- | ------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [056](archive/056-make-certification-executable.md)           | Certificación ejecutable y CI real               | P0       | L      | —                  | DONE — evidence-based (`test_command` + evidence paths), E2E con servidor propio, job `test-ts` en CI con `--ci` (2026-08-10)                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [057](archive/057-enforce-local-control-plane-security.md)    | Boundary local autenticado y write mode único    | P0       | L      | 056                | DONE — `8aae54a` (2026-08-11): test de proceso-spawned de `start.ts` (boot operator, credential env, 401/200)                                                                                                                                                                                                                                                                                                                                                                                                                                                   |     |
| [058](archive/058-harden-publication-and-repository-paths.md) | Publication/path containment fail-closed         | P0       | M      | 057                | DONE — `no-unrelated-staged` enforced, `git add --`, `isSafeId` en change-sets/conflicts, recovery journal (slices de 072/080 + journal de publicación)                                                                                                                                                                                                                                                                                                                                                                                                         |
| [059](archive/059-restore-catalog-mutation-invariants.md)     | Invariantes de catálogo, revision e idempotencia | P1       | L      | 056, 057           | DONE — `8aae54a` (2026-08-11): todas las ediciones directas (discount/stock/category/imagen/avif/archive) avanzan `rev` + `field_last_modified`, igual que name/price                                                                                                                                                                                                                                                                                                                                                                                           |     |
| [060](archive/060-build-lossless-import-export.md)            | Import/export lossless ligado a preview          | P1       | L      | 056, 057, 059      | DONE — `32cfcf3`, `4931bfe`, `12b871d` (2026-08-11): preview durable (sha256 + base_rev + `data/import-previews/`), apply ligado a preview_id (404/409/422), modos new/update/mixed/no-op/keep-local, client tipado, `/export.csv` parity Python + filtros, UX de archivo con aprobación e informe de errores, e2e aislado (temp repo :3101)                                                                                                                                                                                                                    |
| [061](archive/061-complete-operator-workflows.md)             | Paridad de workflows diarios del operador        | P2       | L      | 056, 057, 059, 060 | DONE — `687f345`, `754f79e`, `4c94a98`, `d87d02c` (2026-08-11): filtros min/max en URL+API, create full-field + duplicate (identidad fresca), Git pull seguro (`pull --rebase` fijo, 409 dirty/conflicted, job runner, tests temp-repo), diagnósticos con remedio + redacción, preferencias/ayuda/shortcuts (e2e operator)                                                                                                                                                                                                                                      |
| [062](archive/062-enforce-change-sets-history-recovery.md)    | Change sets, history, undo y recovery durables   | P1       | L      | 057, 058, 059, 060 | DONE — `51530e2`, `34f7345` (2026-08-11): transiciones enforced (PATCH 409/400), ops con before/after+revisiones (migración-safe), apply engine con guards de revisión y 1 escritura, undo/redo durables (inverso exacto, redo en revisiones post-undo, create→archive/restore), history append-only con evidencia, control center UI (drafts/backups/restore/undo-redo) + e2e aislado. Nota: las mutaciones unitarias conservan el fast path directo guardado (excepción explícita del plan); import/preview, publications y change sets sí pasan por revisión |
| [063](archive/063-build-transactional-media-workbench.md)     | Workbench transaccional de media/assets          | P1       | L      | 057, 058, 062      | DONE — `9a12cf9`, `fb75f8b` (2026-08-11): intents durables (`data/media-intents`), upload con sniffing de magic bytes + límites + staging (`data/.media-staging`, gitignored; nunca canónico), jobs allowlisted (avif/variant con sharp, OG vía herramienta canónica con args fijos), apply atómico con rollback de archivos, discard solo staging, UI workbench + e2e aislado. Nota: OG requiere python3 en la máquina del operador; fallback no-AVIF no portado (parity Python restante)                                                                      |
| [064](archive/064-port-durable-remote-sync.md)                | Sync remoto durable y autenticado                | P1       | L      | 057, 059, 062      | DONE — `8681cb0` (2026-08-11): transporte real (fetch acotado, redirects rechazados, Bearer solo de SYNC_API_TOKEN, redacción), cola durable (tmp+rename, idempotente, backoff exponencial máx 15 min), push con 409/412 → conflictos durables con evidencia exacta, pull con cursor = rev del catálogo (avanza solo con write OK), reconfig en runtime sin restart, pause/resume, status con cola/últimos resultados sin exponer token; fake-server tests (200/409/401/429/5xx/restart/cursor)                                                                 |
| [065](archive/065-converge-canonical-content-contracts.md)    | Contrato canónico Python/TS/Astro                | P1       | L      | 056, 059           | DONE — `admin:parity` cero diferencias, schemas read/write, goldens en `plans/fixtures/055`, ADR 0009 (2026-08-10)                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [066](archive/066-build-safe-storefront-curation.md)          | Curación estructurada y segura del storefront    | P1       | L      | 057, 062, 065      | DONE — `45d2651` (2026-08-11): invariantes estrictos en todos los write boundaries (campos no vacíos, ids/refs únicos, refs a productos reales no archivados), write transaccional experiencia+proyección (rollback de AMBOS ante fallo, test de inyección), BundlesPage estructurada (form tipado, picker con búsqueda, duplicate/reorder, destacados + categorías), preservación exacta de subtrees ajenos; e2e aislado (:3104)                                                                                                                               |
| [067](archive/067-bound-backups-and-event-loop-work.md)       | Retención acotada y listing no bloqueante        | P2       | M      | 057, 062           | DONE — `15dd7ac` (2026-08-11): política por clase (auto 10 / manual 20 / pre-restore 5) protegiendo el más reciente y referenciados por recovery; BackupManager con creación verificada (hash), pruning post-éxito con warnings visibles, listing paginado index-driven (sin stat por archivo, fixture de 2000 entradas), prune preview/confirmación (protegidos → 409), reconciliación explícita; writers de categorías/storefront con retención acotada; UI con clase/protección/warnings                                                                     |
| [068](archive/068-reconcile-content-manager-dependencies.md)  | Contrato limpio de dependencias/lockfile         | P2       | S      | 056                | DONE — `8aae54a` (2026-08-11): `@playwright/test` 1.62.1 alineado en el lock del workspace                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |     |
| [069](archive/069-complete-cutover-and-retire-python.md)      | Cutover comprobado y retiro reversible de Python | P1       | L      | 056–068            | DONE — 2026-08-11 (branch `migration/069-content-manager-cutover`): certificación 30/30 READY con aceptación firmada, clean-clone ×2 sin diferencias, drills 8/8; Steps 1–5; Step 6 (retiro) commiteado como `chore(admin): retire Python fallback`; tag `v1.x-python-final` en `cefdd9f`; rollback: `git revert` o `git checkout v1.x-python-final -- admin/product_manager/`                                                                                                                                                                                  |

Status values: `TODO | IN PROGRESS | DONE | BLOCKED (reason) | REJECTED (rationale)`.

### Dependency graph

```text
056 executable evidence
 ├─► 057 authenticated write boundary
 │    ├─► 058 publication + path safety ─┐
 │    ├─► 059 catalog invariants ────────┼─► 062 durable change control
 │    │    ├─► 060 interchange ──────────┘    ├─► 063 media workbench
 │    │    ├─► 064 remote sync ◄──────────────┤
 │    │    └─► 065 canonical contracts ───────┼─► 066 storefront curation
 │    └─► 067 bounded backups ◄───────────────┘
 ├─► 068 dependency reconciliation
 └─► 061 operator parity (after 059 + 060)

056–068 all DONE ─► 069 shadow certification, cutover, Python retirement
```

Plans 063, 064, 065, 067, and 068 may run in parallel after their listed
dependencies. Plans 063 and 066 both consume change-set contracts and should not
redefine them. Plan 069 is a hard terminal gate and must not absorb unfinished
implementation from another plan.

### Finding coverage matrix

| Finding                                          | Plan     | Acceptance summary                                                  |
| ------------------------------------------------ | -------- | ------------------------------------------------------------------- |
| F01 partial/read-only canonical runtime          | 057      | one enumerated mutation policy; explicit operator/read-only startup |
| F02 missing per-launch authentication            | 057      | in-memory launch credential required for every mutation             |
| F03 unrelated/option-injected publication paths  | 058      | server-owned manifest, `--`, exact staged set, index restoration    |
| F04 change-set ID filesystem escape              | 058      | immutable constrained IDs and canonical containment                 |
| F05 repository-stored sync token                 | 057      | external secret provider, redacted response/files/logs              |
| F06 declarative certification and absent TS CI   | 056      | current-SHA evidence, real browser coverage, required CI            |
| F07 broken browser import contract               | 060      | full records preserved; preview-bound atomic apply                  |
| F08 page-wide bulk and partial reorder           | 059      | stable selection and catalog-global reorder command                 |
| F09 incomplete product revision/history metadata | 059, 062 | one revision per edit; exact append-only history                    |
| F10 volatile/incomplete undo/history             | 062      | durable revision-aware undo/redo after restart                      |
| F11 unsafe category identity/deletion            | 059      | canonical resolution, full-catalog usage, reassignment              |
| F12 media stubs/direct writes                    | 063      | durable staged jobs and atomic content+asset apply                  |
| F13 remote sync 501                              | 064      | queue, push/pull, retry, cursor, conflict lifecycle                 |
| F14 unenforced change-set state machine          | 062      | legal domain transitions and draft-driven mutations                 |
| F15 three drifting content contracts             | 065      | one field policy and zero unexplained consumer diffs                |
| F16 invalid/incomplete storefront editing        | 066      | validated structured editors and atomic projection                  |
| F17 missing operator utilities                   | 060, 061 | JSON/CSV plus filters, duplicate, pull, doctor, prefs/help          |
| F18 false idempotent replay responses            | 059      | original status/body/fingerprint persisted across restart           |
| F19 unbounded synchronous backups                | 067      | protected retention and paginated/non-blocking listing              |
| F20 manifest/lock dependency drift               | 068      | narrow deterministic dependency reconciliation                      |
| F21 contradictory cutover/docs/CI                | 069      | evidence-generated status and reversible retirement                 |

---

## Cola vigente — Auditoría 8: release candidate del Content Manager TS (post-plan 069)

Auditoría profunda del 2026-08-11 (4 subagentes + verificación empírica:
probes de traversal, sync pull, change-set apply, intents OG, filtro de
descuento, cap de 50) sobre el release candidate `cefdd9f`. El retiro de
Python (plan 069) se ejecutó el mismo día de forma revertible; los blockers
P0 (086–089) se cerraron/continúan sobre el árbol post-retiro.

**Cola cerrada el 2026-08-12**: 086–097 todos DONE. Gates finales en verde:
`npm run validate` y `npm run validate:release` (exit 0) sobre `main`
(`172972e`). Ítems documentados como diferidos: search/filtro/expand de
categorías (096), OG lifecycle automático (096, el workbench lo cubre) y
media relocation (097).

### Finding coverage matrix (Auditoría 8)

| Finding (resumido)                                                                    | Plan             |
| ------------------------------------------------------------------------------------- | ---------------- |
| F1 pull sync colisiona con command_id fijo (pérdida silenciosa)                       | 086              |
| F2 change-set apply sin allowlist (rev/order/id/field_last_modified inyectables)      | 087              |
| F3 push marca synced antes de aplicar local; snapshot sin validación zod; lock stale  | 086              |
| F4 reorder/bulk con scope de página invisible; bulk miente conteos; undo prematuro    | 088              |
| F5 intents OG inaplicables (output canónico fuera de staging → 422 siempre)           | 089              |
| F6 route policy incompleta (9 rutas); error envelope filtra paths; containment prefix | 090              |
| F7 export UI ausente; filtro descuento inexistente; imágenes sin fallback; confirms   | 091              |
| F8 arch/perf: description sin rev, sharp sin declarar, sin cache, N+1s, 3 patrones    | 092              |
| F9 UX: sin nav persistente, sin tokens, feedback ×3, dialogs sin trap, contraste      | 093              |
| F10 god module ProductsPage 1467 líneas; guards copiados; errores por string-match    | 094              |
| F11 parity: purge, inline editing, revert por producto, galería AVIF                  | 095              |
| F12 parity: delete con reasignación, bundle price, nav-groups, OG lifecycle, picker   | 096              |
| F13 parity: auto-sync, shortcuts, multi-select bulk, undo/redo, relocation, history   | 097              |
| F14 path traversal — **refutado empíricamente** (8 variantes; Fastify normaliza)      | hardening en 090 |

### Orden de ejecución y estado

<!-- markdownlint-disable MD060 -->

| Plan                                                          | Título                                                                                  | Priority | Effort | Depends on    | Status                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------- | ------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [086](archive/086-fix-sync-integrity.md)                      | Integridad de sync (pull collision, synced prematuro, snapshot sin validar, lock stale) | P0       | M      | —             | DONE — 2026-08-11: command_id derivado por contenido, synced solo tras apply local, snapshot validado con productSchema, lock TTL 5 min; +5 tests (el de doble pull caza el bug original); 472 tests, e2e 19/19, certify 30/30                                                                                                     |
| [087](archive/087-change-set-field-allowlist.md)              | Allowlist de campos en change-set apply                                                 | P0       | S      | —             | DONE — 2026-08-11: EDITABLE_PRODUCT_FIELDS como fuente única, guard en applier (create∪id, edit estricto) + validación en POST/PATCH (422 INVALID_OP_FIELD); +5 tests (apply sobre CS escrito a disco con rev inyectado → 422, producto intacto); 477 tests, certify 30/30                                                         |
| [088](archive/088-bulk-reorder-scope-pagination.md)           | Scope real de bulk/reorder + paginación visible                                         | P0       | M      | —             | DONE — 2026-08-11: paginación UI (Prev/Next, X–Y de N, reset por filtro), debounce+race guard, bulk con ámbito explícito + confirm, undo post-success, reorder 409 si parcial + disabled con filtros; scope=all+filters en API; +4 tests API + e2e aislado (fixture 80, :3102); 481 tests, certify 30/30                           |
| [089](archive/089-fix-og-media-workbench.md)                  | Workbench OG aplicable (staging honesto)                                                | P0       | S      | —             | DONE — 2026-08-11: apply OG verifica el canónico (existente/ausente, 422 fail-closed) y transiciona sin promote; output_kind canonical; UI crea OG con target correcto (antes 400 — la creación nunca funcionó); +4 tests; 485 tests, certify 30/30                                                                                |
| [090](archive/090-security-posture-route-policy-errors.md)    | Route policy completa + error envelope + contención                                     | P1       | S–M    | —             | DONE — 2026-08-11: 76 rutas cubiertas (contrato bidireccional), /diff read, setErrorHandler central sin paths (11 sitios convertidos), isContainedWithin por segmentos (media+static), sanitizeUserMessage; +8 tests; 493 tests, certify 30/30                                                                                     |
| [091](archive/091-catalog-ux-gaps-exports-discount-images.md) | Export UI, filtro descuento, imágenes robustas, confirms                                | P1       | M      | 088           | DONE — 2026-08-11: filtro descuento en API+UI (sort % consistente), badge de filtros + Limpiar, export JSON/CSV con filtros, ProductImage con placeholder, confirms destructivos; +2 API +2 e2e; 495 tests, certify 30/30                                                                                                          |
| [092](archive/092-architecture-performance-quick-wins.md)     | Quick wins arch/perf (rev, sharp, cache, N+1, patrones)                                 | P1       | M      | —             | DONE — 2026-08-11: description con rev/metadata, sharp declarado, cache mtime+size con invalidación, headers+cache-control+compress+sin sourcemap, N+1 eliminados (history/import/pull en batch), zod en storefront PUT, 9 símbolos muertos borrados, image_path validado (fixtures legacy actualizados); 498 tests, certify 30/30 |
| [093](archive/093-ux-foundations-nav-tokens-feedback.md)      | Fundamentos UX (nav, tokens, feedback, a11y)                                            | P1       | M–L    | 088, 091      | DONE — 2026-08-11: nav persistente (11 rutas, aria-current, 7 navs de página eliminadas), tokens+estilos base+densidad+alto contraste, Feedback único, errores de operación inline (no destruyen forms), useDialog con trap/Escape, aria-sort, i18n es (PublicationPage/MediaPage); +4 e2e UX; 499 tests, certify 30/30            |
| [094](archive/094-refactor-products-page.md)                  | Refactor ProductsPage (split en hooks/components)                                       | P2       | L      | 088, 091, 093 | DONE — 2026-08-11/12: códigos tipados (0 string-matches, 422 vs 409 corregido), requireWriteMode (15 guards), 6 componentes + hook extraídos; ProductsPage 1778→627 líneas; tests estáticos re-apuntados a ProductList; 499 tests, certify 30/30                                                                                   |
| [095](archive/095-catalog-parity-purge-inline-revert-avif.md) | Purge, inline editing, revert por producto, galería AVIF                                | P2       | M      | 087, 088      | DONE — 2026-08-12: op purge (before-evidence, inverso = recreate), DELETE /products/:id, revert por producto (semántica base/resulting rev), inline editing (price/discount/stock), galería AVIF-first; rutas registradas en policy; +2 API +2 e2e; 501 tests, certify 30/30                                                       |
| [096](archive/096-categories-storefront-parity.md)            | Delete con reasignación, bundle price, nav-groups, OG                                   | P2       | M      | 088, 090, 089 | DONE — 2026-08-12: delete con reassign (scan completo, write rev-guarded, 409/422), bundle price, PATCH nav-groups + UI, auto-slug; OG lifecycle documentado como diferido (workbench 089 lo cubre); picker con filtro; +2 API; 503 tests, certify 30/30                                                                           |
| [097](archive/097-operator-parity-batch.md)                   | Auto-sync, shortcuts, bulk selección, undo/redo, relocation, history                    | P2       | L      | 086, 088      | DONE — 2026-08-12: auto-sync 60s (cleanup onClose), shortcuts CRUD con guards, multi-select con scope selection, undo/redo 20 niveles en sessionStorage, import en history, commit message autogenerado, polling 30s, cap 20/producto; relocation diferido documentado; +1 API +2 e2e; 504 tests, certify 30/30                    |

<!-- markdownlint-enable MD060 -->

Regla: los P0 (086–089) se priorizan sobre el resto; 086 habilita 097,
089 habilita 096 (OG lifecycle), 088 habilita 091/093/094/095/096/097.
El retiro de Python (069) ya está ejecutado y es revertible.

### Considerado y rechazado (Auditoría 8)

- **Path traversal en el static handler** (`app.ts:298-349`) — **refutado
  empíricamente de nuevo**: 8 variantes (`..`, `%2e%2e`, `%2f`, dobles) contra
  servidor vivo devuelven 404/SPA; Fastify normaliza antes del handler.
  Queda como hardening defensivo dentro del plan 090 (contención post-resolve).
- **Credential impresa en stdout al arrancar** (`start.ts:57-60`) — por diseño
  (plan 071), loopback; nota de awareness.
- **Zod `z.string().url()` deprecado** (`syncAdapter.ts:5`) — cosmético, sin
  fecha de remoción.
- **Bulk/purge sin restore** — purge es irreversible por diseño (history +
  backup automático como evidencia).

---

## Cola vigente — Auditoría 3 (residual)

El grueso de la Auditoría 3 está `DONE` (025–029, 032–037, 019, 024, 026, 027,
035); el detalle de waves y gates quedó en
[`archive/README-history.md`](archive/README-history.md). Siguen vigentes:

| Plan                                                   | Título                                   | Priority | Effort | Depends on | Status                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------ | ---------------------------------------- | -------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [030](archive/030-make-product-store-durable.md)       | Hacer durable el ProductStore            | P1       | L      | —          | DONE — 2026-08-12: protocolo de commit recuperable de dos archivos (tmps + manifest + backups), recovery determinista (par viejo o nuevo completo), fs inyectable, staging en clones con caché publicada post-commit; 7 límites de fault-injection + no-op durable (10 tests); 428 root tests, build verde |
| [031](archive/031-trim-unused-browser-runtime.md)      | Retirar Partytown y reducir Bootstrap JS | P2       | M      | 025        | DONE — 2026-08-12: Partytown retirado, Bootstrap plugin barrel explícito, validado por E2E/Build (commit 05670b5)                                                                                                                                                                                          |
| [038](archive/038-spike-private-funnel-measurement.md) | Spike de medición privada del funnel     | P3       | S      | 037        | DONE — 2026-08-12: spike → ADR 0010 (contracto de medición privada del funnel, commit 1a9f5af)                                                                                                                                                                                                             |

Gate residual: `npm run validate` más los E2E focalizados de cada plan; el gate
final de la cola es `npm run validate:release`.

---

## Auditoría 4 — residual Python (Content Manager Tk)

> El plan 055 reemplazó como destino los planes 050–052 y 054
> (`SUPERSEDED`/`ABSORBED`); 039 y 048 están `DONE`. Los planes 040–047 y 049
> quedaron `SUPERSEDED` el 2026-08-11: con el retiro de Python (plan 069) sus
> capacidades viven en el Content Manager TS (plan 055 + 056–068). Todos ellos
> están archivados en `plans/archive/` (040–049 el 2026-08-13). Histórico
> completo (waves, gates por wave, política de rollback, gate de aceptación)
> en [`archive/README-history.md`](archive/README-history.md).

Todos los cambios de implementación de estos planes eran limitados a
`admin/product_manager/` (retirado; frontera de rollback `v1.x-python-final`).

| Plan                                                            | Título                                      | Priority | Effort | Depends on           | Status                                                         |
| --------------------------------------------------------------- | ------------------------------------------- | -------- | ------ | -------------------- | -------------------------------------------------------------- |
| [040](archive/040-preserve-product-state-in-bulk-operations.md) | Preservar metadata en operaciones masivas   | P1       | S      | 039                  | SUPERSEDED — cubierto por TS (059: bulk con revisión/metadata) |
| [041](archive/041-stage-media-mutations-until-save.md)          | Hacer transaccionales los cambios de medios | P1       | M      | 039                  | SUPERSEDED — cubierto por TS (063: media workbench)            |
| [042](archive/042-reorder-products-by-identity.md)              | Reordenar por identidad real                | P1       | S      | 039                  | SUPERSEDED — cubierto por TS (059: reorder por identidad)      |
| [043](archive/043-preserve-sync-conflicts.md)                   | Preservar conflictos hasta resolución       | P1       | S      | 039                  | SUPERSEDED — cubierto por TS (064: conflictos durables)        |
| [044](archive/044-unify-discount-invariant.md)                  | Unificar invariante de descuentos           | P2       | S      | 039; 040 recomendado | SUPERSEDED — cubierto por TS (074: discount ≤ price)           |
| [045](archive/045-make-publication-safe-and-truthful.md)        | Publicación acotada, preflighted y veraz    | P1       | M      | 039                  | SUPERSEDED — cubierto por TS (058/072: publication scoped)     |
| [046](archive/046-run-git-operations-off-ui-thread.md)          | Ejecutar Git fuera del hilo Tk              | P1       | M      | 039, 045             | SUPERSEDED — cubierto por TS (job runner + Git no bloqueante)  |
| [047](archive/047-centralize-product-manager-configuration.md)  | Centralizar configuración tipada            | P1       | M      | 039                  | SUPERSEDED — cubierto por TS (057: credential/env + settings)  |
| [049](archive/049-retire-dormant-sqlite-store.md)               | Retirar store SQLite dormido                | P3       | S      | 036                  | SUPERSEDED — SQLite retirado con Python (ADR 0009)             |

Gate residual: retirado con la superficie Python (plan 111) — el CI del
admin es TypeScript (`admin.yml` → `admin/content-manager/`).

---

## Histórico

El registro completo de auditorías 1–4 (pipelines de 24 planes, tablas maestras,
waves con gates, findings rechazados) está en
[`archive/README-history.md`](archive/README-history.md). Los planes `DONE`
están en [`archive/`](archive/), con sus statuses registrados en las tablas de
este README.
