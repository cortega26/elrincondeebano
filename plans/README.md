# Implementation Plans

Generados por `/improve deep` en cuatro auditorías. La Auditoría 4 está
deliberadamente limitada a `admin/product_manager/` y define la cola vigente
para el revamp del Content Manager. La cola de Auditoría 3 sigue vigente para
las demás superficies; los planes DONE se conservan como registro.

| Auditoría | Fecha      | Commit    | Planes  |
| --------- | ---------- | --------- | ------- |
| 1         | 2026-06-14 | `4751633` | 001–012 |
| 2         | 2026-07-14 | `633eeb8` | 013–024 |
| 3         | 2026-07-14 | `877f179` | 025–038 |
| 4         | 2026-07-15 | `8c903e3` | 039–054 |

Cada executor debe leer el plan completo antes de empezar, respetar sus STOP conditions, y actualizar su fila al terminar.

---

## Cola vigente — Auditoría 4: Content Manager

### Objetivo y límites

Esta wave convierte el Content Manager en una herramienta segura, verificable
y orientada a tareas. El orden evita construir una interfaz nueva sobre flujos
que hoy pueden perder metadata, mover medios antes de guardar, reordenar el
producto equivocado, borrar conflictos al verlos o declarar un deploy exitoso
sin push exitoso.

Todos los cambios de implementación quedan limitados a
`admin/product_manager/`. Los planes pueden actualizar su propia fila en este
README, pero no autorizan cambios en storefront, datos reales, assets, CI,
servidores remotos ni scripts root. El plan 049 tiene una dependencia explícita
en el ADR cross-surface 036 y no debe ejecutarse antes de esa decisión.

> **Advertencia de snapshot**: la auditoría se escribió contra commit
> `8c903e3` con cambios locales ya presentes en `content_manager.py`, varios
> módulos UI y requirements, además de archivos nuevos de deploy/Git/theme/toast.
> Cada executor debe ejecutar tanto el drift check del plan como
> `git status --short -- admin/product_manager` y preservar ese trabajo.

### Secuencia óptima resumida

```text
WAVE 0  BASELINE & HYGIENE
  039 characterization tests
  048 dependency lock                    (parallel with 039)

WAVE 1  DATA-INTEGRITY BUGS
  039 ─┬─► 040 preserve bulk state
       ├─► 041 transactional media
       ├─► 042 identity-based reorder
       ├─► 043 durable conflicts
       └─► 044 unified discount rule

WAVE 2  RELEASE & RUNTIME SAFETY
  039 ─► 045 safe publication ─► 046 async Git/UI
  039 ─► 047 centralized configuration

WAVE 3  ARCHITECTURAL SEAM
  039–047 ─► 050 typed presenters

WAVE 4  PRODUCT CAPABILITIES
  041 + 045 + 047 + 050 ─► 051 staged change sets ─► 052 workspace redesign
  036 + 039 + 043 + 050 ─► 053 stable identities
  043 + 050 + 052 (+ 053 recommended) ─► 054 conflict center

CONDITIONAL CLEANUP
  036 accepted ADR ─► 049 retire dormant SQLite store
```

The numeric order is the default execution order. Plans 048 and 049 are placed
near the baseline because they are small, but 049 remains blocked until plan
036 decides catalog authority. Plan 053 may run after 050 in parallel with early
workspace design, but it should land before the final persistence contract of
the conflict center.

### Wave 0 — Baseline and reproducibility

| Plan                                                    | Título                               | Priority | Effort | Depends on | Status |
| ------------------------------------------------------- | ------------------------------------ | -------- | ------ | ---------- | ------ |
| [039](039-characterize-product-manager-ui.md)           | Caracterizar workflows UI headlessly | P1       | M      | —          | DONE   |
| [048](048-lock-product-manager-runtime-dependencies.md) | Bloquear dependencias runtime        | P2       | S      | —          | TODO   |

Run 039 first on the branch that will carry UI work. Plan 048 is file-disjoint
from 039 and can run concurrently, but reconcile it with completed plan 034:
034 integrated the admin web profile; 048 closes missing pins specifically in
the Tk Content Manager profile.

**Wave gate**:

```bash
admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q
admin/product_manager/.venv/bin/ruff check admin/product_manager
```

Expected: all tests pass and Ruff exits 0. Coverage must be non-zero for the
five high-risk UI modules named in plan 039.

### Wave 1 — Correctness and data integrity

These plans may be implemented in parallel after 039 because their primary
production files do not overlap, except 040/044 both touch bulk operations.
If using multiple executors, run 040 before 044 or serialize those two branches.

| Plan                                                    | Título                                          | Priority | Effort | Depends on           | Status |
| ------------------------------------------------------- | ----------------------------------------------- | -------- | ------ | -------------------- | ------ |
| [040](040-preserve-product-state-in-bulk-operations.md) | Preservar metadata en operaciones masivas       | P1       | S      | 039                  | TODO   |
| [041](041-stage-media-mutations-until-save.md)          | Hacer transaccionales los cambios de medios     | P1       | M      | 039                  | TODO   |
| [042](042-reorder-products-by-identity.md)              | Reordenar por identidad real                    | P1       | S      | 039                  | TODO   |
| [043](043-preserve-sync-conflicts.md)                   | Preservar conflictos hasta resolución explícita | P1       | S      | 039                  | TODO   |
| [044](044-unify-discount-invariant.md)                  | Unificar invariante de descuentos               | P2       | S      | 039; 040 recomendado | TODO   |

**Why this order**: 040 and 041 remove silent data-loss paths first. Plan 042
then fixes incorrect catalog mutation, 043 makes sync evidence durable, and 044
closes a smaller but concrete validation inconsistency. Each relevant strict
xfail from plan 039 must become a passing regression test.

**Wave gate**: full pytest + Ruff; additionally rerun coverage and confirm no
target module regresses to 0%.

### Wave 2 — Publication, responsiveness, and configuration

| Plan                                                   | Título                                   | Priority | Effort | Depends on | Status |
| ------------------------------------------------------ | ---------------------------------------- | -------- | ------ | ---------- | ------ |
| [045](045-make-publication-safe-and-truthful.md)       | Publicación acotada, preflighted y veraz | P1       | M      | 039        | TODO   |
| [046](046-run-git-operations-off-ui-thread.md)         | Ejecutar Git fuera del hilo Tk           | P1       | M      | 039, 045   | TODO   |
| [047](047-centralize-product-manager-configuration.md) | Centralizar configuración tipada         | P1       | M      | 039        | TODO   |

Implement 045 before 046 so async orchestration wraps the final publication
contract, not a transitional API. Plan 047 is file-overlapping with the current
dirty UI work but logically independent; it can run in parallel only in a
separate worktree with a deliberate merge.

**Wave gate**:

```bash
admin/product_manager/.venv/bin/python -m pytest \
  admin/product_manager/tests/test_git_sync.py \
  admin/product_manager/tests/test_deploy.py \
  admin/product_manager/tests/test_ui_deploy_panel.py -q
admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q
admin/product_manager/.venv/bin/ruff check admin/product_manager
```

No focused test may touch the developer repository, network remote, or user
configuration path.

### Wave 3 — Typed architecture seam

| Plan                                             | Título                                            | Priority | Effort | Depends on | Status |
| ------------------------------------------------ | ------------------------------------------------- | -------- | ------ | ---------- | ------ |
| [050](050-decompose-ui-into-typed-presenters.md) | Extraer presenters tipados y adelgazar MainWindow | P1       | L      | 039–047    | TODO   |

This is intentionally after behavior fixes. It is a sequence of feature slices,
not a big-bang rewrite: catalog state, mixin orchestration, forms, then final
composition. Keep the app runnable and tests green after every slice.

**Wave gate**:

```bash
admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q
admin/product_manager/.venv/bin/ruff check admin/product_manager
admin/product_manager/.venv/bin/python -m mypy admin/product_manager \
  --no-incremental --cache-dir=/tmp/pm-mypy
```

Expected: tests/Ruff pass and production-package mypy errors reach the accepted
zero or explicitly approved narrower baseline. Do not start visual redesign
while implicit mixin contracts remain.

### Wave 4 — New operator workflow

| Plan                                                | Título                                    | Priority | Effort | Depends on                     | Status |
| --------------------------------------------------- | ----------------------------------------- | -------- | ------ | ------------------------------ | ------ |
| [051](051-design-staged-content-changes.md)         | Introducir change sets durables           | P2       | L      | 041, 045, 047, 050             | TODO   |
| [052](052-build-task-oriented-content-workspace.md) | Reconstruir workspace orientado a tareas  | P2       | L      | 039–051                        | TODO   |
| [053](053-design-stable-content-identities.md)      | Diseñar/migrar identidades estables       | P2       | L      | 036, 039, 043, 050             | TODO   |
| [054](054-build-actionable-conflict-center.md)      | Construir centro de conflictos accionable | P2       | L      | 043, 050, 052; 053 recomendado | TODO   |

Plan 051 creates the application-owned draft/review/publish state machine. Plan
052 then redesigns the UI around that workflow. Plan 053 is a high-risk schema
migration and begins with design/dry-run gates; it may overlap early 052 design
but should not be merged concurrently with selection/state changes. Plan 054
lands last because durable conflicts, presenters, workspace navigation, and
preferably stable IDs must already exist.

**Wave gate**: full pytest, Ruff, mypy, plus targeted change-set, identity, and
conflict-center suites. Manual smoke must cover keyboard-only browse → edit →
review → publish confirmation in both themes and at maximum configured font.

### Conditional cleanup

| Plan                                      | Título                       | Priority | Effort | Depends on | Status                                      |
| ----------------------------------------- | ---------------------------- | -------- | ------ | ---------- | ------------------------------------------- |
| [049](049-retire-dormant-sqlite-store.md) | Retirar store SQLite dormido | P3       | S      | 036        | BLOCKED — waiting for catalog-authority ADR |

Do not delete `data_store.py` merely because it has no callers. Plan 036 already
owns the cross-surface authority decision and may retain SQLite as an operator
cache or compatibility layer. Execute 049 only if the accepted ADR explicitly
retires it.

### Master status table — Auditoría 4

| #   | Plan                | Category  | Priority | Effort | Risk | Primary files                     | Status             |
| --- | ------------------- | --------- | -------- | ------ | ---- | --------------------------------- | ------------------ |
| 039 | UI characterization | tests     | P1       | M      | LOW  | `tests/`, minimal UI seams        | TODO               |
| 040 | Preserve bulk state | bug       | P1       | S      | MED  | `bulk_operations_mixin.py`        | TODO               |
| 041 | Transactional media | bug       | P1       | M      | MED  | `product_form.py`                 | TODO               |
| 042 | Identity reorder    | bug       | P1       | S      | MED  | `main_window.py`, `components.py` | TODO               |
| 043 | Durable conflicts   | bug       | P1       | S      | MED  | `sync.py`, `services.py`, UI      | TODO               |
| 044 | Discount invariant  | bug       | P2       | S      | LOW  | model/form/main/bulk              | TODO               |
| 045 | Safe publication    | bug       | P1       | M      | HIGH | deploy/Git/deploy panel           | TODO               |
| 046 | Async Git UI        | perf      | P1       | M      | MED  | deploy panel/task runner          | TODO               |
| 047 | Central config      | tech-debt | P1       | M      | MED  | bootstrap/main/dialog/theme       | TODO               |
| 048 | Runtime lock        | migration | P2       | S      | LOW  | requirements files                | TODO               |
| 049 | Retire SQLite store | tech-debt | P3       | S      | LOW  | `data_store.py`                   | BLOCKED — plan 036 |
| 050 | Typed presenters    | tech-debt | P1       | L      | HIGH | UI/category GUI                   | TODO               |
| 051 | Staged change sets  | direction | P2       | L      | HIGH | new domain + services             | TODO               |
| 052 | Task workspace      | direction | P2       | L      | HIGH | UI shell/pages                    | TODO               |
| 053 | Stable identities   | migration | P2       | L      | HIGH | model/service/sync                | TODO               |
| 054 | Conflict center     | direction | P2       | L      | HIGH | sync/service/UI                   | TODO               |

### Parallelism and merge-conflict guidance

| Can run together                            | Must serialize                               | Reason                                                         |
| ------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| 039 + 048                                   | 040 before 044                               | Both alter bulk-operation behavior/tests                       |
| 041 + 042 + 043                             | 045 before 046                               | Async layer must wrap final publication contract               |
| 045 + 047 in isolated worktrees             | All before 050                               | Presenter extraction must see stabilized behavior              |
| 051 design + 053 design                     | 051 implementation before 052                | Workspace consumes staged-change API                           |
| Early 052 wireframes + 053 migration design | 053 implementation and late 052 state wiring | Both affect selection/identity contracts                       |
| —                                           | 054 last                                     | Needs durable conflicts, presenters, workspace, preferably IDs |

### Rollback and release policy

- Every implementation plan uses its own branch and conventional commit.
- Do not combine multiple HIGH-risk plans in one commit or PR.
- Roll back with `git revert <sha>`; never reset the shared branch.
- Plans 041, 045, 051, 053, and 054 require explicit recovery/failure tests
  before merge because they mutate durable content or publication state.
- No executor may publish, push, migrate real data, or modify real assets as a
  verification step.

### Final acceptance gate for the revamp

The roadmap is complete only when all applicable 039–054 rows are DONE and:

1. Full product-manager pytest and Ruff pass.
2. Production mypy reaches the accepted zero/baseline defined in plan 050.
3. High-risk UI modules have meaningful behavior coverage, not merely imports.
4. Cancel/validation/service failures cannot leave media or product data split.
5. Publication previews exact owned paths, validates before commit, and never
   reports success for a failed required step.
6. Tk remains responsive during Git/network work and ignores late callbacks on close.
7. The operator can browse, edit, review staged changes, resolve conflicts, and
   reach publish confirmation via keyboard.
8. No implementation file outside `admin/product_manager/` changed under this roadmap.

### Findings considered and rejected — Auditoría 4

- **Immediate Tkinter-to-web/Electron rewrite**: rejected. No evidence justifies
  a platform migration before correctness, testability, and workflow boundaries
  are fixed; plan 052 rebuilds the workflow on the current runtime.
- **Adopt SQLite immediately**: rejected pending plan 036. Active JSON repositories
  already use locks, fsync, backups, and atomic replacement; the dormant store
  has an incompatible model and no callers.
- **Treat all local pip-audit findings as repository vulnerabilities**: rejected.
  The active `.venv` is stale relative to the constraint file. Plan 048 audits a
  clean, reproducible environment and fixes missing direct pins.
- **Bandit subprocess warnings as command injection**: rejected. Current Git/npm
  calls use argument arrays and `shell=False`; the release risk is incorrect
  scoping/result semantics, covered by plan 045.
- **Micro-optimize product filtering**: rejected at current catalog scale. The
  observable performance risk is blocking Git/network work on the Tk thread,
  covered by plan 046.

---

## Cola vigente — Auditoría 3

Los planes nuevos agrupan todos los findings con balance net-positive. Los
planes 019 y 024 siguen vigentes; 010 fue reconciliado como DONE porque sus
tres suites objetivo ya existen y pasan.

### Wave A — Safety, characterization and truth

Estos planes son paralelizables y preparan cambios posteriores:

| Plan | Título                                          | Priority | Effort | Depends on | Status |
| ---- | ----------------------------------------------- | -------- | ------ | ---------- | ------ |
| 025  | Caracterizar checkout y personalización activos | P1       | M      | —          | DONE   |
| 028  | Exigir transporte seguro en catalog sync        | P1       | S      | —          | DONE   |
| 029  | Corregir estado de carga de parking             | P1       | S      | —          | DONE   |
| 032  | Limpiar LHCI y audit de dependencias dev        | P2       | S      | —          | DONE   |
| 033  | Reforzar pre-commit y hermeticidad de tests     | P2       | S      | —          | DONE   |
| 034  | Integrar admin web en lock y CI                 | P2       | M      | —          | DONE   |
| 037  | Converger documentación con runtime real        | P2       | M      | —          | DONE   |

**Gate**: `npm run lint && npm run typecheck && npm test`; para 028/034,
además `cd admin/product_manager && python -m ruff check . && python -m pytest`.

### Wave B — Storefront and CI improvements

| Plan | Título                                     | Priority | Effort | Depends on      | Status |
| ---- | ------------------------------------------ | -------- | ------ | --------------- | ------ |
| 026  | Canonicalizar carritos compartidos         | P1       | M      | 025             | TODO   |
| 027  | Preservar descuentos y rollback de carrito | P1       | M      | 025             | TODO   |
| 031  | Retirar Partytown y reducir Bootstrap JS   | P2       | M      | 025             | TODO   |
| 035  | Consolidar builds duplicados de CI         | P2       | M      | —               | TODO   |
| 019  | Reducir Bootstrap CSS                      | P2       | M      | 031 recomendado | DONE   |

**Gate**: `npm run validate` más los E2E focalizados de cada plan.

### Wave C — Durability and authority

| Plan | Título                                  | Priority | Effort | Depends on | Status |
| ---- | --------------------------------------- | -------- | ------ | ---------- | ------ |
| 030  | Hacer durable el ProductStore           | P1       | L      | —          | TODO   |
| 036  | Decidir una autoridad única de catálogo | P2       | M      | 034        | TODO   |

El plan 030 es independiente lógicamente, pero se difiere a esta wave por su
riesgo de durabilidad. El plan 036 termina en ADR y contract tests; no autoriza
una migración de datos.

### Wave D — Convergence and optional direction

| Plan | Título                               | Priority | Effort | Depends on   | Status |
| ---- | ------------------------------------ | -------- | ------ | ------------ | ------ |
| 024  | Unificar test runners bajo Vitest    | P2       | M      | 025–030, 033 | TODO   |
| 038  | Spike de medición privada del funnel | P3       | S      | 037          | TODO   |

**Final gate**: `npm run validate:release`.

### Dependency graph — Auditoría 3

```text
025 ─┬─► 026
     ├─► 027
     └─► 031 ─► 019

034 ───► 036
037 ───► 038

025–030 + 033 ─► 024

028, 029, 030, 032, 035 are otherwise independent.
```

---

## Pipeline de ejecución óptimo

Los 24 planes históricos de las auditorías 1–2 se organizaron en 7 stages secuenciales. Dentro de cada stage, los planes eran paralelizables (no compartían archivos en conflicto ni dependencias lógicas). Este pipeline se conserva como registro; para trabajo pendiente manda la cola vigente de Auditoría 3.

```
STAGE 0  FOUNDATION         1 plan   ~30 min    prerequisito universal
STAGE 1  SAFETY NET         3 plans  ~2 h       tooling + low-risk fixes
  ═══ gate: lint + typecheck + test ═══
STAGE 2  CRITICAL BUGS      4 plans  ~3 h       P1 bugs + security
  ═══ gate: lint + typecheck + test + build ═══
STAGE 3  PERFORMANCE        5 plans  ~3 h       quick wins, no logic changes
  ═══ gate: lint + typecheck + test + build + e2e ═══
STAGE 4  STRUCTURAL         5 plans  ~1 día     M-effort refactors
  ═══ gate: lint + typecheck + test + build + e2e ═══
STAGE 5  CONSOLIDATION      3 plans  ~1 día     depend on structural stability
  ═══ gate: lint + typecheck + test + build + e2e ═══
STAGE 6  DEEPEN             3 plans  ~1 día     test infra + final optimizations
  ═══ gate: validate:release ═══
```

---

## STAGE 0 — FOUNDATION

| #   | Plan                               | Categoría | Archivos que toca                    |
| --- | ---------------------------------- | --------- | ------------------------------------ |
| 013 | Corregir drift Astro 6.4.6 → 7.0.4 | deps      | `node_modules/`, `astro-poc/vendor/` |

**Por qué primero**: Todo plan posterior asume Astro 7. `npm ci` reconcilia la versión instalada. Sin esto, `build`, `dev`, y `typecheck` corren Astro 6 mientras el código asume Astro 7.

**Gate**: `node -e "console.log(require('./astro-poc/node_modules/astro/package.json').version)"` → `7.0.4`

---

## STAGE 1 — SAFETY NET

| #   | Plan                                               | Categoría | Archivos que toca                            |
| --- | -------------------------------------------------- | --------- | -------------------------------------------- |
| 023 | DX tooling: hooks, `build:fast`, `.prettierignore` | dx        | `package.json`, `.husky/`, `.prettierignore` |
| 016 | Corregir guardias truthiness en preferencias       | bug       | `storefront.js:348-362`                      |
| 009 | Consolidar loggers legacy → activo                 | tech-debt | `logger.mts` → `logger.ts`                   |

**Por qué en este stage**: Los tres son S-effort, riesgo LOW, y no comparten archivos. El plan 023 instala el safety net (pre-commit hooks) que beneficia a todos los stages siguientes. El 016 es un two-liner. El 009 elimina duplicación de loggers inmediatamente.

**Gate**: `npm run lint && npm run typecheck && npm test`

---

## STAGE 2 — CRITICAL BUGS

| #   | Plan                                                 | Categoría | Archivos que toca                                                         |
| --- | ---------------------------------------------------- | --------- | ------------------------------------------------------------------------- |
| 015 | Blindar parking contra fallos silenciosos de APIs    | bug       | `parking-reservation.js`                                                  |
| 003 | Eliminar innerHTML stock notification + CSP nonce    | security  | `storefront.js:~266`, `csp.js`                                            |
| 014 | Corregir corrupción de carrito en rollback por quota | bug       | `storefront.js:1608-1637`                                                 |
| 017 | Escapar `</script>` en JSON.stringify inline         | security  | `StructuredData.astro`, `index.astro`, `combos.astro`, `serialization.ts` |

**Por qué en este stage**: Los 4 son P1/P2, S-effort, y tocan áreas no solapadas de `storefront.js` (016 ya ejecutado en Stage 1). 014 y 003 tocan funciones distintas de `storefront.js` (líneas ~266 y ~1608) — sin conflicto. 015 y 017 tocan archivos distintos. El orden dentro del stage sigue risk-gradient: parking (aislado) → storefront norte → storefront sur → astro components.

**Gate**: `npm run lint && npm run typecheck && npm test && npm run build`

---

## STAGE 3 — PERFORMANCE

| #   | Plan                                                        | Categoría | Archivos que toca                                             |
| --- | ----------------------------------------------------------- | --------- | ------------------------------------------------------------- |
| 018 | Quick wins: GPU layers, companion scan, cache, turbo        | perf      | `global.css`, `storefront.js:705`, `catalog.ts`, `turbo.json` |
| 004 | Cachear build-time en catalog.ts (verificar scope restante) | perf      | `catalog.ts`, `BaseLayout.astro`                              |
| 006 | Extender SW cache TTLs + CSS externo                        | perf      | `service-worker.js`                                           |
| 008 | DX legacy: lint-staged TS, `.editorconfig`                  | dx        | `eslint.config.cjs`, `.editorconfig`                          |
| 011 | Higiene de dependencias                                     | deps      | `node_modules/`, `astro-poc/vendor/`                          |

**Por qué en este stage**: Los 5 son S-effort principalmente, sin cambios de lógica de negocio. 018 y 004 tocan `catalog.ts` pero en zonas distintas (018 añade `cachedProductsByCategory`, 004 añade cachés a funciones existentes). 006, 008, 011 tocan archivos independientes. Stage 3 completa todas las quick wins de performance antes de entrar a refactors más profundos.

**Gate**: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`

---

## STAGE 4 — STRUCTURAL

| #   | Plan                                                           | Categoría | Archivos que toca                                                        |
| --- | -------------------------------------------------------------- | --------- | ------------------------------------------------------------------------ |
| 020 | Consolidar observabilidad legacy → activo                      | tech-debt | `observability.mjs` → `observability.js`                                 |
| 021 | Extraer lógica compartida de ProductCard y ProductCardStrip    | tech-debt | `ProductCard.astro`, `ProductCardStrip.astro`, `product-card-helpers.ts` |
| 002 | Corregir race condition en parking + tests                     | bug       | `parking-reservation.js`                                                 |
| 001 | Corregir bugs del carrito: dual keys, quota, stock, descuentos | bug       | `storefront.js` multi-área, `storefront-state.ts`, `storage-contract.ts` |
| 019 | Reducir CSS de Bootstrap no utilizado                          | perf      | `BaseLayout.astro`, `global.css`, `bootstrap-needed.scss`                |

**Por qué en este stage**: Planes M-effort que requieren que el código base esté estable (bugs corregidos en Stage 2, perf estabilizado en Stage 3). 020 y 021 son refactors autocontenidos. 002 depende de que `parking-reservation.js` esté estable (015 ya ejecutado). 001 es el fix comprehensivo del carrito — se ejecuta DESPUÉS de 014 (el fix puntual del splice) para evitar conflictos en `setQty`. 019 toca CSS y BaseLayout (004 ya modificó BaseLayout en Stage 3).

**Gate**: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`

---

## STAGE 5 — CONSOLIDATION

| #   | Plan                                                             | Categoría | Archivos que toca                                         |
| --- | ---------------------------------------------------------------- | --------- | --------------------------------------------------------- |
| 007 | Consolidar duplicados, unificar convenciones, limpiar spike code | tech-debt | `catalog.ts`, `formatting.ts`, `storefront.js`, `tools/`  |
| 012 | Unificar políticas CSP: header vs meta tag                       | security  | `csp.js`, `security-header-policy.mjs`, Cloudflare worker |
| 022 | Derivar tipos desde Zod schemas + eliminar código muerto         | tech-debt | `catalog.ts`, `data-schemas.ts`, `src/js/`                |

**Por qué en este stage**: Los 3 dependen de stages anteriores: 007 depende de 001 (cart estable) y 004 (catalog cache); 012 depende de 003 (nonce eliminado); 022 depende de 018 (catalog.ts con cachedProductsByCategory). Cada uno toca conjuntos de archivos disjuntos. Stage 5 completa la consolidación arquitectónica antes de la fase final de tests.

**Gate**: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`

---

## STAGE 6 — DEEPEN

| #   | Plan                                                               | Categoría | Archivos que toca                                                        |
| --- | ------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------ |
| 005 | Optimizar renderizado DOM y payload en cliente                     | perf      | `storefront.js`, `catalog-view.js`, `personalization.js`                 |
| 010 | Tests unitarios para `catalog.ts`, `seo.ts`, `product-identity.ts` | tests     | nuevos archivos en `test/`                                               |
| 024 | Unificar test runners bajo Vitest                                  | tests     | `vitest.config.mts`, `test/run-all.js`, `package.json`, `test/*.test.js` |

**Por qué en este stage**: 005 depende de 001 (cart estable — storefront.js ya no cambiará estructuralmente). 010 depende de 007 (API de catalog.ts consolidada) y 009 (logger unificado). 024 depende de 022 (si `src/js/` fue archivado, los tests legacy ya no existen, simplificando la migración). Stage 6 cierra con la infraestructura de tests unificada y las optimizaciones finales de cliente.

**Gate**: `npm run validate:release`

---

## Resumen de gates por stage

| Stage | Gate                                                                                    |
| ----- | --------------------------------------------------------------------------------------- |
| 0     | `node -e "console.log(require('./astro-poc/node_modules/astro/package.json').version)"` |
| 1     | `npm run lint && npm run typecheck && npm test`                                         |
| 2     | `↑ + npm run build`                                                                     |
| 3     | `↑ + npm run test:e2e`                                                                  |
| 4     | `↑`                                                                                     |
| 5     | `↑`                                                                                     |
| 6     | `npm run validate:release`                                                              |

Cada gate es acumulativo: el gate del Stage N incluye todos los checks de los gates anteriores. Esto asegura que los problemas se detectan temprano, cuando el cambio que los introdujo está fresco.

---

## Tabla maestra

| #   | Plan                          | Stage | Effort | Risk | Archivos principales                                      | Status |
| --- | ----------------------------- | ----- | ------ | ---- | --------------------------------------------------------- | ------ |
| 013 | Astro version drift           | 0     | S      | MED  | `node_modules/`, `vendor/`                                | DONE   |
| 023 | DX tooling                    | 1     | S      | LOW  | `package.json`, `.husky/`                                 | DONE   |
| 016 | Preference guards             | 1     | S      | LOW  | `storefront.js:348`                                       | DONE   |
| 009 | Logger consolidation          | 1     | S      | LOW  | `logger.mts` → `logger.ts`                                | DONE   |
| 015 | Parking API hardening         | 2     | S      | LOW  | `parking-reservation.js`                                  | DONE   |
| 003 | innerHTML + CSP nonce         | 2     | S      | LOW  | `storefront.js:~266`, `csp.js`                            | DONE   |
| 014 | Cart splice rollback          | 2     | S      | LOW  | `storefront.js:1608`                                      | DONE   |
| 017 | JSON escape helper            | 2     | S      | LOW  | `.astro` files, `serialization.ts`                        | DONE   |
| 018 | Quick perf wins               | 3     | S      | LOW  | `global.css`, `storefront.js`, `catalog.ts`, `turbo.json` | DONE   |
| 004 | Build-time caching ⚠️         | 3     | S      | LOW  | `catalog.ts`, `BaseLayout.astro`                          | DONE   |
| 006 | SW cache TTL                  | 3     | S      | LOW  | `service-worker.js`                                       | DONE   |
| 008 | DX legacy fixes               | 3     | S      | LOW  | `eslint`, `.editorconfig`                                 | DONE   |
| 011 | Dependency hygiene            | 3     | S      | LOW  | `node_modules/`, `vendor/`                                | DONE   |
| 020 | Observability consolidation   | 4     | M      | MED  | `observability.mjs` → `.js`                               | DONE   |
| 021 | Card helpers extract          | 4     | M      | LOW  | `ProductCard*.astro`, helper                              | DONE   |
| 002 | Parking race condition        | 4     | M      | MED  | `parking-reservation.js`                                  | DONE   |
| 001 | Cart bugs comprehensive       | 4     | M      | MED  | `storefront.js` multi, `*-state.ts`, `*-contract.ts`      | DONE   |
| 019 | Bootstrap CSS reduction       | 4     | M      | MED  | `BaseLayout.astro`, `global.css`, `.scss`                 | DONE   |
| 007 | Duplicates + spike cleanup ⚠️ | 5     | M      | LOW  | `catalog.ts`, `formatting.ts`, `storefront.js`, `tools/`  | DONE   |
| 012 | Unify CSP policies            | 5     | M      | MED  | `csp.js`, `security-header-policy.mjs`, worker            | DONE   |
| 022 | Types from Zod + dead code    | 5     | M      | LOW  | `catalog.ts`, `data-schemas.ts`, `src/js/`                | DONE   |
| 005 | Client DOM optimization       | 6     | M      | MED  | `storefront.js`, `catalog-view.js`, `personalization.js`  | DONE   |
| 010 | Lib unit tests                | 6     | M      | LOW  | `test/` (new files)                                       | DONE   |
| 024 | Unify test runners            | 6     | M      | MED  | `vitest.config.mts`, `test/run-all.js`, `test/*.test.js`  | TODO   |

Status: TODO | IN PROGRESS | DONE | BLOCKED | REJECTED

⚠️ **Planes con nota de verificación previa**: El executor debe leer el código vivo antes de empezar — partes del scope pueden estar ya implementadas.

---

## Dependency graph

```
013 ─────────────────────────────────────────────────────────────────────────────►
 │
 ├─► 023 ──┬──► 016 ──┬──► 015 ──┬──► 018 ──┬──► 020 ──┬──► 007 ──┬──► 005
 │         │          │          │          │          │          │
 │         └──► 009   ├──► 003   ├──► 004   ├──► 021   ├──► 012   ├──► 010
 │                    │          │          │          │          │
 │                    ├──► 014   ├──► 006   ├──► 002   └──► 022   └──► 024
 │                    │          │          │
 │                    └──► 017   ├──► 008   ├──► 001
 │                               │          │
 │                               └──► 011   └──► 019
 │
 ├─ Stage 0 ──► Stage 1 ──► Stage 2 ──► Stage 3 ──► Stage 4 ──► Stage 5 ──► Stage 6
```

- **Flechas horizontales (─►)**: orden secuencial entre stages.
- **Barras verticales (│)**: planes paralelizables dentro del mismo stage.
- **Conexiones hacia abajo (├─►)**: el stage actual desbloquea el siguiente.

---

## Notas de reconciliación (auditoría 2)

### Planes con scope parcialmente resuelto

- **004**: `getProductReferenceMap` (`catalog.ts:394`) y `getNavigationGroups` (`catalog.ts:614`) ya tienen caché. Verificar si el plan se reduce solo a PERF-05 (storefront JSON inline).
- **007**: `formatPrice` ya no existe en `catalog.ts`. `formatCurrency` permanece en `formatting.ts`. Verificar scope restante: TDA-03 (tools extensions), TDA-04 (spike code), TDA-05 (normalizeCategoryToken).

---

## Findings considered and rejected (auditoría 2)

- **CB-06** (trackAnalyticsEvent silent swallow): analytics no es crítico. Cubrir en mejora de observabilidad futura.
- **SEC-02** (CSP `img-src https:`): política deliberada para WhatsApp/OG previews. Cubierto por plan 012.
- **SEC-03** (CSP hash dual-baseline): fragilidad de mantenimiento. Cubierto por plan 003 + 012.
- **SEC-04** (edge worker `content-length`): Workers auto-gestiona Transfer-Encoding. Verificar antes de actuar.
- **SEC-05** (admin panel inline onclick): admin es interno, no comparte origin con storefront.
- **SEC-06** (secret-scan sin phone detection): el número expuesto es público (WhatsApp business). Nice-to-have.
- **PERF-09** (`prefetchAll: true`): impacto dependiente de comportamiento de usuario, no confirmado.
- **PERF-10** (`getHomeFeaturedDeals` full sort): imperceptible a escala actual (~150 productos).
- **PERF-11** (CSS monolítico 3446 líneas): L effort. Diferir hasta post-plan 019.
- **TD-N05** (inconsistent extensions .js/.mjs/.ts): L effort, 70+ archivos. Documentar convención primero.
- **TD-N06** (269 MB archive bloat): `prune-backups.js` existe. No es blocker.
- **TD-N10** (presentation in data-layer catalog.ts): riesgo de breaking changes en path resolution. Diferir.
- **DEP-02** (vendored anymatch Astro 6): cubierto por plan 011 + 013.
- **DEP-03** (Cypress dead types): 2 líneas. Incluido como nota en plan 024.
- **DEP-04** (ES2018 target): sin impacto en SSG. Type-checking solamente.
- **DEP-05** (`eslint-plugin-astro` v3): optional step en plan 023.
- **DEP-07** (Bootstrap 5.3.3 → 5.3.8): patch releases, `npm update` trivial.
- **DEP-08** (duplicate `eslint-plugin-sonarjs`): 1 línea, trivial.
- **DX-04** (no test watch mode): resuelto automáticamente por plan 024.
- **DX-05** (`.vscode/` gitignored): preferencia del maintainer.
- **DOCS-01 a DOCS-05**: doc-gardening recurrente, no planes de implementación.
- **DIR-01, DIR-02, DIR-05, DIR-06**: requieren decisión del maintainer sobre producto/stack.

---

## Reconciliación y descartes — Auditoría 3

### Plan reconciliado

- **010 → DONE**: `test/catalog-queries.spec.js`, `test/seo.spec.js` y
  `test/product-identity.spec.js` existen y pasaron dentro de `npm test` en
  `877f179`. El plan 037 vuelve a ejecutar los tres specs focalizados y registra
  la evidencia documental.

### Findings no convertidos en plan

- **Programar vigencia de promociones/bundles**: arquitectura favorable, pero
  no hay evidencia de necesidad operativa ni frecuencia de campañas. Reabrir
  cuando exista un owner y calendario de promociones.
- **Hold transaccional para parking**: L-effort/HIGH-risk, introduce backend,
  abuso y expiraciones sin evidencia de colisiones reales. Medir primero.
- **Partición adicional completa de `storefront.js`**: LOW-confidence y alto
  riesgo de listeners/estado. El plan 025 caracteriza el runtime; sólo crear un
  refactor posterior si emerge una frontera pequeña y medible.
- **Persistir como exitosa una invalidación de SW fallida**: comportamiento
  deliberado cubierto por tests y mitigado por la versión propia del worker.
  Reabrir sólo con evidencia de caché obsoleta después de deploy.
