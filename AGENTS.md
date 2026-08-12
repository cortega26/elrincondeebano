# AGENTS

**El Rincón de Ébano** — storefront estático Astro + Content Manager local.
Runtime: Node 24.x únicamente (`engines: >=24 <25`, Volta 24.0.0).
Última actualización: 2026-08-11.

**Content Manager**: la aplicación canónica es `admin/content-manager/`
(TypeScript: Fastify + React + Vite + TS7). El manager Python/Tkinter
(`admin/product_manager/`) fue retirado de forma reversible el 2026-08-11
(plan 069; frontera de rollback: tag `v1.x-python-final`, el commit de retiro
es revertible). El prototipo Streamlit (`admin/web/`) está retirado (aunque
los archivos persisten).

## Estructura (npm workspaces)

- **`astro-poc/`** — storefront de producción: Astro 7 estático, vanilla JS
  (sin framework de UI), salida en `astro-poc/dist/`. `npm run build` lo
  construye; el deploy es GitHub Pages + Cloudflare edge (ADR 0004).
- **`admin/content-manager/`** — Content Manager TS. Todo se maneja con
  `npm run admin:*` (dev, build, test, parity, shadow-read, certify, doctor,
  drills de rollback con `scripts/rollback-drill.ts`).
- **`data/` + `assets/`** — catálogo autoritativo (ADR 0009). El admin escribe
  en el repo; el storefront lo consume en build. Cualquier cambio de catálogo,
  taxonomía o assets obliga a `guardrails:assets`.
- **`plans/`** — planes de implementación activos (índice: `plans/README.md`,
  planes numerados 001–085 con estado reconciliado). `docs/audit/` conserva
  auditorías antiguas, no el estado actual.

## Comandos clave

| Comando                    | Qué hace / gotcha                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`              | Astro dev del storefront. El admin es `npm run admin:dev`.                                                                                                          |
| `npm run build`            | **Preflight completo** (categories:sync → generación de imágenes → validación) + build Astro. Lento; usa `npm run build:fast` para iterar sin preflight.            |
| `npm test`                 | **Dos runners vitest**: root (`test/`) + `npm run admin:test`.                                                                                                      |
| `npm run typecheck`        | Único comando que cubre los tres paquetes: legacy + astro + admin.                                                                                                  |
| `npm run lint`             | **NO cubre `admin/content-manager`** (root eslint lo ignora, igual que `astro-poc/`). El admin se lint-ea en pre-commit (lint-staged) y en CI `admin.yml`.          |
| `npm run test:e2e`         | Playwright sobre `test/e2e-astro/` (config `playwright.astro.config.ts`). **Hace un build completo primero**; con `PLAYWRIGHT_SKIP_BUILD=1` reusa `astro-poc/dist`. |
| `npm run validate`         | lint → typecheck → check:e2e-selectors → test → build → guardrails:assets.                                                                                          |
| `npm run validate:release` | Gate de release (añade e2e + monitor:share-preview + security audit).                                                                                               |
| `npm run admin:certify`    | Gate del cutover del Content Manager (certification report).                                                                                                        |

## Gotchas

- `node test/run-all.js` ya no existe: el plan 024 unificó todo en Vitest.
  `CLAUDE.md` está desactualizado en este punto; **AGENTS.md manda**.
- `test/e2e/` fue retirado (plan 110): los scripts `test:e2e:visual*`,
  `test:e2e:media` y `test:e2e:storefront` fueron eliminados del manifest.
  La suite E2E viva vive en `test/e2e-astro/` (storefront) y
  `admin/content-manager/test/e2e/` (admin).
- Pre-commit: husky + lint-staged (ESLint + Prettier, `--concurrent false`).
  Nunca uses `--no-verify`.
- ESLint root aplica sonarjs con límites estrictos (p. ej. `max-lines-per-function`
  warn a 80); `tools/` y `scripts/` tienen exenciones.
- E2E/Playwright usa variables de `.env.example` (`PORT=8081`,
  `PLAYWRIGHT_SKIP_BUILD`); no hay secretos requeridos en local.

## Principios

- **El repositorio es el sistema de registro.** Lo que no está versionado no existe para el agente.
- **Este archivo es un índice, no una enciclopedia.** Las instrucciones detalladas viven en `docs/`.
- **Divulgación progresiva.** Empieza aquí; ve a `docs/` para el detalle.
- **Los planes son artefactos de primera categoría.** Efímeros para cambios pequeños; versionados en `plans/` para trabajo complejo.
- **Invariantes mecánicos > microgestión.** Los linters incluyen instrucciones de remediación en su mensaje de error.
- **Entropía proactiva.** Doc-gardening recurrente mantiene docs alineados con el código.

## Método de trabajo (planes y tareas M+)

Cambios pequeños (S-effort) usan el flujo ligero habitual. Para planes y tareas
M+, el trío spec/todo/tests es obligatorio. No preguntar aclaraciones que la
spec y los tests resuelvan.

0. **Regla de archivo fija**: un plan solo se marca `DONE` cuando su archivo
   ya está en `plans/archive/` (mismo commit, `git mv`). El checker
   `node tools/check-plan-archive.mjs` falla si un plan DONE está en la raíz
   de `plans/` — corre en `npm run validate`, lint-staged y CI. No aplicar
   `git mv` hacia afuera de `archive/`.
1. **Spec primero.** Para trabajo en `plans/`, el plan ES la spec. Para tareas
   sin plan, escribir `spec.md` en la carpeta del plan + `todo.md` con
   sub-tareas verificables. El `spec.md`/`todo.md` de raíz son históricos del
   cart UX (2026-04) — no se reutilizan.
2. **Tests en las suites vivas.** E2E en `test/e2e-astro/`, unit en `test/`,
   admin en `admin/content-manager/`. Nunca carpetas de tests nuevas.
3. **Bucle de verificación.** Consultar la spec antes de cada cambio; marcar
   `todo.md`; correr `npm test` (vitest) tras cada commit; E2E al cierre o con
   `PLAYWRIGHT_SKIP_BUILD=1`; gates finales `npm run lint` + `npm run typecheck`
   - `npm run build`.
4. **Revisión fresca.** Trabajo largo (~20 iteraciones): un agente nuevo revisa
   spec vs implementación (patrón `/improve deep`) y se cierran sus hallazgos
   antes de continuar.
5. **Cierre.** Fila actualizada en `plans/README.md`; al marcar `DONE`, `git mv`
   el plan a `plans/archive/`.

## Agentes

| Agente                  | Responsabilidad                                           |
| ----------------------- | --------------------------------------------------------- |
| Repo Cartographer       | Inventaría scripts (`package.json`), configs y workflows. |
| Docs Steward            | Mantiene `docs/`, ejecuta doc-gardening.                  |
| Type & Lint Guardian    | `npm run lint`, `typecheck`, `format`.                    |
| Security / Supply Chain | Dependencias, SARIF, secret-scan.                         |
| Test Sentinel           | Suite completa, mutation testing, flakiness.              |
| CI Guardian             | Workflows: versiones fijadas, permisos mínimos.           |
| PR/Release Manager      | Ramas, PRs, versionado, evidencia.                        |

## Validación base

Node 24.x · instalación determinista: `npm ci` (nunca `npm install`).

```bash
npm run validate
npm run validate:release
```

## Checklist PR mínimo

- [ ] `lint` + `typecheck` en verde. Nota: el lint root ignora `astro-poc/` y
      `admin/content-manager/`; esos paquetes los cubren sus propios configs
      (lint-staged y CI).
- [ ] `test` en verde (root vitest + admin vitest).
- [ ] `build` en verde.
- [ ] `guardrails:assets` en verde si cambia catálogo, taxonomía o assets.
- [ ] `test:e2e` en verde o justificado.
- [ ] `monitor:share-preview` en verde si cambia SEO/OG/share-preview.
- [ ] `npm audit --omit=dev` sin vulnerabilidades altas/críticas.
- [ ] Rollback documentado (`git revert <sha>`).
- [ ] Docs actualizadas si cambió comportamiento.

## Mapa de documentación

| Qué                                              | Dónde                                                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Bootstrap / cold start                           | [`BOOTSTRAP`](docs/onboarding/BOOTSTRAP.md)                                                         |
| Punto de entrada por tarea                       | [`START_HERE`](docs/START_HERE.md)                                                                  |
| Matriz de validación                             | [`VALIDATION_MATRIX`](docs/operations/VALIDATION_MATRIX.md)                                         |
| Guardrails, cobertura, política de cambios y PRs | [`QUALITY_GUARDRAILS`](docs/operations/QUALITY_GUARDRAILS.md)                                       |
| Performance, escalabilidad y mantenibilidad      | [`ENGINEERING_PRIORITIES`](docs/architecture/ENGINEERING_PRIORITIES.md)                             |
| Runbook, workflows CI, playbooks, comandos       | [`RUNBOOK`](docs/operations/RUNBOOK.md)                                                             |
| Planes activos (índice en README.md)             | [`plans/`](plans/)                                                                                  |
| Auditorías históricas y planes completados       | [`docs/audit/`](docs/audit/)                                                                        |
| Cutover / certificación Content Manager          | [`CUTOVER`](docs/operations/CUTOVER.md)                                                             |
| Smoke manual                                     | [`SMOKE_TEST`](docs/operations/SMOKE_TEST.md)                                                       |
| Share preview                                    | [`SHARE_PREVIEW`](docs/operations/SHARE_PREVIEW.md)                                                 |
| Incidentes y rollback                            | [`INCIDENT_TRIAGE`](docs/operations/INCIDENT_TRIAGE.md) · [`ROLLBACK`](docs/operations/ROLLBACK.md) |
| Observabilidad                                   | [`OBSERVABILITY`](docs/operations/OBSERVABILITY.md)                                                 |
| Política de dependencias                         | [`DEPENDENCY_POLICY`](docs/operations/DEPENDENCY_POLICY.md)                                         |
| Headers de seguridad edge                        | [`EDGE_SECURITY_HEADERS`](docs/operations/EDGE_SECURITY_HEADERS.md)                                 |
| Scripts y utilidades                             | [`tools/`](tools/)                                                                                  |
| Suite de pruebas                                 | [`test/`](test/)                                                                                    |
