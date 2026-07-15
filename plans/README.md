# Implementation Plans

Generados por `/improve deep` en tres auditorías. La cola de Auditoría 3
supersede el orden histórico para todo trabajo todavía pendiente; los planes
DONE se conservan como registro.

| Auditoría | Fecha      | Commit    | Planes  |
| --------- | ---------- | --------- | ------- |
| 1         | 2026-06-14 | `4751633` | 001–012 |
| 2         | 2026-07-14 | `633eeb8` | 013–024 |
| 3         | 2026-07-14 | `877f179` | 025–038 |

Cada executor debe leer el plan completo antes de empezar, respetar sus STOP conditions, y actualizar su fila al terminar.

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
