# AGENTS

**El Rincón de Ébano** — web estática servida desde Astro. Runtime: Node 22.x.
Última actualización: 2026-04-16 (Docs refresh: engineering priorities).

## Principios

- **El repositorio es el sistema de registro.** Lo que no está versionado no existe para el agente.
- **Este archivo es un índice, no una enciclopedia.** Las instrucciones detalladas viven en `docs/`.
- **Divulgación progresiva.** Empieza aquí; ve a `docs/` para el detalle.
- **Los planes son artefactos de primera categoría.** Efímeros para cambios pequeños; versionados en `docs/audit/` para trabajo complejo.
- **Invariantes mecánicos > microgestión.** Los linters incluyen instrucciones de remediación en su mensaje de error.
- **Entropía proactiva.** Doc-gardening recurrente mantiene docs alineados con el código.

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

Node 22.x · instalación determinista: `npm ci`

```bash
npm run validate
npm run validate:release
```

## Checklist PR mínimo

- [ ] `lint` + `typecheck` en verde.
- [ ] `test` en verde.
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
| Punto de entrada por tarea                       | [`START_HERE`](docs/START_HERE.md)                                                                  |
| Matriz de validación                             | [`VALIDATION_MATRIX`](docs/operations/VALIDATION_MATRIX.md)                                         |
| Guardrails, cobertura, política de cambios y PRs | [`QUALITY_GUARDRAILS`](docs/operations/QUALITY_GUARDRAILS.md)                                       |
| Performance, escalabilidad y mantenibilidad      | [`ENGINEERING_PRIORITIES`](docs/architecture/ENGINEERING_PRIORITIES.md)                             |
| Runbook, workflows CI, playbooks, comandos       | [`RUNBOOK`](docs/operations/RUNBOOK.md)                                                             |
| Planes activos y completados                     | [`docs/audit/`](docs/audit/)                                                                        |
| Smoke manual                                     | [`SMOKE_TEST`](docs/operations/SMOKE_TEST.md)                                                       |
| Share preview                                    | [`SHARE_PREVIEW`](docs/operations/SHARE_PREVIEW.md)                                                 |
| Incidentes y rollback                            | [`INCIDENT_TRIAGE`](docs/operations/INCIDENT_TRIAGE.md) · [`ROLLBACK`](docs/operations/ROLLBACK.md) |
| Observabilidad                                   | [`OBSERVABILITY`](docs/operations/OBSERVABILITY.md)                                                 |
| Política de dependencias                         | [`DEPENDENCY_POLICY`](docs/operations/DEPENDENCY_POLICY.md)                                         |
| Headers de seguridad edge                        | [`EDGE_SECURITY_HEADERS`](docs/operations/EDGE_SECURITY_HEADERS.md)                                 |
| Scripts y utilidades                             | [`tools/`](tools/)                                                                                  |
| Suite de pruebas                                 | [`test/`](test/)                                                                                    |
