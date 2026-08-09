# Implementation Plans

Generados por `/improve deep` en cuatro auditorías y ampliados por una directiva
de migración. La Auditoría 4 estaba
deliberadamente limitada a `admin/product_manager/`. La directiva de migración
del 2026-07-15 agrega el plan 055 como hoja de ruta vigente para construir un
Content Manager paralelo en TypeScript y retirar Python/Tkinter sólo después de
certificación. La cola de Auditoría 3 sigue vigente para las demás superficies;
los planes DONE se conservan como registro.

| Auditoría | Fecha      | Commit    | Planes  |
| --------- | ---------- | --------- | ------- |
| 1         | 2026-06-14 | `4751633` | 001–012 |
| 2         | 2026-07-14 | `633eeb8` | 013–024 |
| 3         | 2026-07-14 | `877f179` | 025–038 |
| 4         | 2026-07-15 | `8c903e3` | 039–054 |
| 5         | 2026-07-15 | `30dbab7` | 055     |
| 6         | 2026-07-16 | `30dbab7` | 056–069 |
| 7         | 2026-08-03 | `30dbab7` | 070–085 |

Cada executor debe leer el plan completo antes de empezar, respetar sus STOP conditions, y actualizar su fila al terminar.

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

| Plan                                                   | Título                                                          | Priority | Effort | Depends on | Status                                              |
| ------------------------------------------------------ | --------------------------------------------------------------- | -------- | ------ | ---------- | --------------------------------------------------- |
| [070](070-commit-canonical-content-manager.md)         | Commit del Content Manager canónico y del registro de migración | P0       | M      | —          | DONE — `27d6c0e` (2026-08-03)                       |
| [071](071-enforce-write-boundary.md)                   | Frontera de escritura: clasificación de rutas, bootstrap y Host | P0       | M      | 070        | DONE — `ad7b303` (2026-08-03)                       |
| [072](072-make-publication-commit-scoped.md)           | Publicación commit scoped a ownedPaths + no-unrelated-staged    | P1       | M      | 070, 071   | TODO                                                |
| [073](073-fix-lossless-import-apply.md)                | Import aplica productos nuevos y reporta conteos reales         | P1       | M      | 070        | TODO                                                |
| [074](074-enforce-discount-invariant-schemas.md)       | Invariante discount ≤ price en todos los write boundaries       | P1       | S–M    | 070        | DONE — `7f545f7`, `4a16c6d`, `2a0d926` (2026-08-09) |
| [075](075-fail-closed-build-contract-tests.md)         | Tests de contrato de build fail-closed                          | P1       | S      | —          | DONE — `316924a` (2026-08-03)                       |
| [076](076-fix-backup-id-collision.md)                  | IDs de backup únicos (flake de CI + pérdida de datos)           | P1       | S      | 070        | DONE — (2026-08-08)                                 |
| [077](077-fix-bulk-undo-snapshot.md)                   | Undo bulk con snapshot de valores previos siempre               | P1       | S      | 070        | DONE — (2026-08-08)                                 |
| [078](078-close-atomic-writer-recovery-gap.md)         | Restore-on-failure del AtomicWriter + journal conectado         | P1       | M      | 070        | TODO                                                |
| [079](079-align-cutover-docs-with-evidence.md)         | Docs de cutover/onboarding alineadas con la evidencia           | P1       | S–M    | 070        | DONE — `68850f1` (2026-08-03)                       |
| [080](080-harden-category-concurrency-and-id-paths.md) | Concurrencia optimista de categorías + IDs contenidos           | P2       | M      | 070, 071   | TODO                                                |
| [081](081-fix-empty-bundles-persistence.md)            | Persistir bundles vacíos (stale storefront-bundles.json)        | P2       | S      | 070        | DONE — `158c327` (2026-08-03)                       |
| [082](082-resolve-admin-ci-and-dep-audits.md)          | CI admin alineada al retiro + npm audit HIGHs                   | P1       | M      | 070, 076   | TODO                                                |
| [083](083-characterize-category-mutation-boundary.md)  | Tests de caracterización categorías + ensureDiscountToggle real | P2       | M      | 070, 080   | TODO                                                |
| [084](084-unify-monorepo-validation-and-lint.md)       | validate/typecheck del monorepo + lint de .tsx                  | P2       | S      | 070        | DONE — `5552137` (2026-08-03)                       |
| [085](085-add-parking-degraded-mode.md)                | Modo degradado de parking con datos externos caídos             | P2       | S      | —          | DONE — `d49dbf2` (2026-08-03)                       |

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

## Directiva vigente — Migración paralela del Content Manager

| Plan                                                    | Título                                         | Priority | Effort | Depends on | Status                                                                           |
| ------------------------------------------------------- | ---------------------------------------------- | -------- | ------ | ---------- | -------------------------------------------------------------------------------- |
| [055](055-build-parallel-typescript-content-manager.md) | TypeScript 7 + Fastify + React Content Manager | P1       | XL     | 036, 039   | RECONCILED — follow-up execution roadmap 056–069; Python fallback remains active |

El plan 055 autoriza una aplicación paralela y reemplaza como destino los planes
050–052 y 054 orientados a Tkinter. Sus requisitos de seguridad y workflow se
conservan como criterios de aceptación TypeScript, junto con los findings 040–047
y la migración de identidad 053. Python/Tkinter sigue siendo el fallback hasta que
las fases de shadow, certificación y aprobación explícita del plan 055 terminen.

No se debe ejecutar un rediseño visual completo en Tk y, en paralelo, otro en React.
Los fixes de pérdida de datos o publicación que protejan el periodo de transición
pueden seguir aterrizando en Python; las abstracciones exclusivas de Tk quedan
supeditadas al plan 055.

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

| Plan                                                  | Título                                           | Priority | Effort | Depends on         | Status |
| ----------------------------------------------------- | ------------------------------------------------ | -------- | ------ | ------------------ | ------ |
| [056](056-make-certification-executable.md)           | Certificación ejecutable y CI real               | P0       | L      | —                  | TODO   |
| [057](057-enforce-local-control-plane-security.md)    | Boundary local autenticado y write mode único    | P0       | L      | 056                | TODO   |
| [058](058-harden-publication-and-repository-paths.md) | Publication/path containment fail-closed         | P0       | M      | 057                | TODO   |
| [059](059-restore-catalog-mutation-invariants.md)     | Invariantes de catálogo, revision e idempotencia | P1       | L      | 056, 057           | TODO   |
| [060](060-build-lossless-import-export.md)            | Import/export lossless ligado a preview          | P1       | L      | 056, 057, 059      | TODO   |
| [061](061-complete-operator-workflows.md)             | Paridad de workflows diarios del operador        | P2       | L      | 056, 057, 059, 060 | TODO   |
| [062](062-enforce-change-sets-history-recovery.md)    | Change sets, history, undo y recovery durables   | P1       | L      | 057, 058, 059, 060 | TODO   |
| [063](063-build-transactional-media-workbench.md)     | Workbench transaccional de media/assets          | P1       | L      | 057, 058, 062      | TODO   |
| [064](064-port-durable-remote-sync.md)                | Sync remoto durable y autenticado                | P1       | L      | 057, 059, 062      | TODO   |
| [065](065-converge-canonical-content-contracts.md)    | Contrato canónico Python/TS/Astro                | P1       | L      | 056, 059           | TODO   |
| [066](066-build-safe-storefront-curation.md)          | Curación estructurada y segura del storefront    | P1       | L      | 057, 062, 065      | TODO   |
| [067](067-bound-backups-and-event-loop-work.md)       | Retención acotada y listing no bloqueante        | P2       | M      | 057, 062           | TODO   |
| [068](068-reconcile-content-manager-dependencies.md)  | Contrato limpio de dependencias/lockfile         | P2       | S      | 056                | TODO   |
| [069](069-complete-cutover-and-retire-python.md)      | Cutover comprobado y retiro reversible de Python | P1       | L      | 056–068            | TODO   |

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

### Direction coverage

| Direction                                     | Decision                                   | Plans         |
| --------------------------------------------- | ------------------------------------------ | ------------- |
| D01 media/generated-asset workbench           | Build as transactional operator capability | 063           |
| D02 changes and recovery control center       | Build on enforced durable change sets      | 062, 067      |
| D03 lossless interchange/storefront workspace | Build typed import/export and curators     | 060, 061, 066 |
| D04 remote sync vs de-scope                   | Implement full Python-equivalent sync      | 057, 064      |

### Audit scope and rejected items

- Audited: the complete `admin/content-manager/` implementation and tests, plus
  Python parity surfaces in `admin/product_manager/`, root scripts/CI/docs, and
  Astro content-contract integration boundaries.
- Not audited as product scope: public storefront visual redesign, deployment
  infrastructure unrelated to Content Manager publication, or any live remote.
- Considered and rejected: retiring/de-scoping remote sync, because it conflicts
  with the explicit all-functionality migration goal.
- Considered and rejected: keeping static 21/21 certification as a progress
  checklist; it cannot serve as retirement evidence.
- Considered and rejected: direct media uploads plus best-effort cleanup; it cannot
  guarantee catalog/asset atomicity or restart recovery.

---

## Cola vigente — Auditoría 4: Content Manager

> **Estado tras el plan 055**: esta auditoría se conserva como evidencia y como
> backlog de seguridad para el periodo de transición. Los planes 050–052 y 054
> ya no son el destino de implementación; sus requisitos se ejecutan en la nueva
> aplicación mediante el plan 055. Los fixes 040–047 pueden aterrizar en Python
> sólo cuando reduzcan riesgo antes del cutover.

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
| [048](048-lock-product-manager-runtime-dependencies.md) | Bloquear dependencias runtime        | P2       | S      | —          | DONE   |

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

| Plan                                             | Título                                            | Priority | Effort | Depends on | Status           |
| ------------------------------------------------ | ------------------------------------------------- | -------- | ------ | ---------- | ---------------- |
| [050](050-decompose-ui-into-typed-presenters.md) | Extraer presenters tipados y adelgazar MainWindow | P1       | L      | 039–047    | SUPERSEDED — 055 |

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

| Plan                                                | Título                                    | Priority | Effort | Depends on                     | Status           |
| --------------------------------------------------- | ----------------------------------------- | -------- | ------ | ------------------------------ | ---------------- |
| [051](051-design-staged-content-changes.md)         | Introducir change sets durables           | P2       | L      | 041, 045, 047, 050             | SUPERSEDED — 055 |
| [052](052-build-task-oriented-content-workspace.md) | Reconstruir workspace orientado a tareas  | P2       | L      | 039–051                        | SUPERSEDED — 055 |
| [053](053-design-stable-content-identities.md)      | Diseñar/migrar identidades estables       | P2       | L      | 036, 039, 043, 050             | ABSORBED — 055   |
| [054](054-build-actionable-conflict-center.md)      | Construir centro de conflictos accionable | P2       | L      | 043, 050, 052; 053 recomendado | SUPERSEDED — 055 |

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

| Plan                                      | Título                       | Priority | Effort | Depends on | Status                                                                      |
| ----------------------------------------- | ---------------------------- | -------- | ------ | ---------- | --------------------------------------------------------------------------- |
| [049](049-retire-dormant-sqlite-store.md) | Retirar store SQLite dormido | P3       | S      | 036        | UNBLOCKED — ADR 0008 names SQLite as non-authoritative, ready for execution |

Do not delete `data_store.py` merely because it has no callers. Plan 036 already
owns the cross-surface authority decision and may retain SQLite as an operator
cache or compatibility layer. Execute 049 only if the accepted ADR explicitly
retires it.

### Master status table — Auditoría 4

| #   | Plan                | Category  | Priority | Effort | Risk | Primary files                     | Status                        |
| --- | ------------------- | --------- | -------- | ------ | ---- | --------------------------------- | ----------------------------- |
| 039 | UI characterization | tests     | P1       | M      | LOW  | `tests/`, minimal UI seams        | DONE                          |
| 040 | Preserve bulk state | bug       | P1       | S      | MED  | `bulk_operations_mixin.py`        | TODO                          |
| 041 | Transactional media | bug       | P1       | M      | MED  | `product_form.py`                 | TODO                          |
| 042 | Identity reorder    | bug       | P1       | S      | MED  | `main_window.py`, `components.py` | TODO                          |
| 043 | Durable conflicts   | bug       | P1       | S      | MED  | `sync.py`, `services.py`, UI      | TODO                          |
| 044 | Discount invariant  | bug       | P2       | S      | LOW  | model/form/main/bulk              | TODO                          |
| 045 | Safe publication    | bug       | P1       | M      | HIGH | deploy/Git/deploy panel           | TODO                          |
| 046 | Async Git UI        | perf      | P1       | M      | MED  | deploy panel/task runner          | TODO                          |
| 047 | Central config      | tech-debt | P1       | M      | MED  | bootstrap/main/dialog/theme       | TODO                          |
| 048 | Runtime lock        | migration | P2       | S      | LOW  | requirements files                | TODO                          |
| 049 | Retire SQLite store | tech-debt | P3       | S      | LOW  | `data_store.py`                   | UNBLOCKED — ADR 0008 accepted |
| 050 | Typed presenters    | tech-debt | P1       | L      | HIGH | UI/category GUI                   | TODO                          |
| 051 | Staged change sets  | direction | P2       | L      | HIGH | new domain + services             | TODO                          |
| 052 | Task workspace      | direction | P2       | L      | HIGH | UI shell/pages                    | TODO                          |
| 053 | Stable identities   | migration | P2       | L      | HIGH | model/service/sync                | TODO                          |
| 054 | Conflict center     | direction | P2       | L      | HIGH | sync/service/UI                   | TODO                          |

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

| Plan | Título                                  | Priority | Effort | Depends on | Status                                                                       |
| ---- | --------------------------------------- | -------- | ------ | ---------- | ---------------------------------------------------------------------------- |
| 030  | Hacer durable el ProductStore           | P1       | L      | —          | TODO                                                                         |
| 036  | Decidir una autoridad única de catálogo | P2       | M      | 034        | DONE — ADR 0008 authored, fixtures and goldens captured per Plan 055 Phase 0 |

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
