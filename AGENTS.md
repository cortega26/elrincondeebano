# AGENTS

## Resumen

Este documento coordina a los agentes automatizados y humanos que mantienen **El Rincón de Ébano**, una web estática construida con scripts de Node.js, plantillas EJS y activos precompilados. Establece responsabilidades, comandos verificados y guardrails para preservar la estabilidad de builds, pruebas, seguridad de la cadena de suministro y los flujos de CI/CD actuales.

Última actualización operativa: 2026-02-13 (Prompt 12).

## Arquitectura de agentes

```
                +---------------------+
                |  Repo Cartographer  |
                +----------+----------+
                           |
        +------------------+-------------------+
        |                  |                   |
        v                  v                   v
+---------------+  +------------------+  +-----------------------+
| Docs Steward  |  | Type & Lint      |  | Security / Supply     |
|               |  | Guardian         |  | Chain Agent           |
+-------+-------+  +---------+--------+  +-----------+-----------+
        |                    |                      |
        v                    v                      v
                 +----------------------+            |
                 |    Test Sentinel     |<-----------+
                 +----------+-----------+
                            |
                            v
                     +--------------+
                     |  CI Guardian |
                     +------+-------+
                            |
                            v
                     +--------------+
                     | PR/Release   |
                     | Manager      |
                     +--------------+
```

- **Repo Cartographer:** inventaría scripts (`package.json`), configuraciones y workflows.
- **Docs Steward:** mantiene `AGENTS.md`, `README.md`, `docs/operations/RUNBOOK.md`, `docs/operations/BACKUP.md` y material operativo.
- **Type & Lint Guardian:** valida estilo y calidad de código JavaScript.
- **Security / Supply Chain Agent:** monitoriza dependencias y SARIF antes de publicación.
- **Test Sentinel:** ejecuta suites de pruebas Node y controla flakiness.
- **CI Guardian:** asegura que los workflows de GitHub Actions respeten versiones, cachés y permisos mínimos.
- **PR/Release Manager:** orquesta ramas, PRs, versionado y evidencia de verificación.

## Matriz de comandos por agente

| Agente                        | Comando                                                 | Cuándo se ejecuta                                                                       | Salida esperada                                                                           | Artefactos                                |
| ----------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------- |
| Repo Cartographer             | `node -v`                                               | Antes de cualquier trabajo para verificar Node ≥ 22 tal como consume CI (`images.yml`). | Versión fija compatible con scripts (`22.x`).                                             | Registro en informe de descubrimiento.    |
| Repo Cartographer             | `npm pkg get scripts`                                   | Al actualizar documentación o scripts.                                                  | JSON con scripts de `package.json`.                                                       | Tabla de scripts actualizada en docs.     |
| Docs Steward                  | `npm run build`                                         | Tras cambios en plantillas (`templates/`), datos o herramientas.                        | Build completo sin errores ni warnings críticos; genera `dist/`, `pages/`, `sitemap.xml`. | Artifacts regenerados listos para commit. |
| Docs Steward                  | `npm run lighthouse:audit`                              | Auditorías de rendimiento previas a release.                                            | Reportes en `reports/lighthouse/`.                                                        | Archivos HTML de Lighthouse.              |
| Type & Lint Guardian          | `npm run lint`                                          | En cada PR y antes de merges; ejecutado también localmente.                             | Salida limpia sin errores ESLint usando `eslint.config.cjs`.                              | Logs de lint.                             |
| Type & Lint Guardian          | `npm run format`                                        | En cada PR.                                                                             | Código formateado según `.prettierrc`.                                                    | Archivos modificados.                     |
| Security / Supply Chain Agent | `npm audit --production`                                | Mensual o ante cambios de dependencias.                                                 | Sin vulnerabilidades altas/crit.; documentar hallazgos.                                   | Reporte de auditoría.                     |
| Security / Supply Chain Agent | `npm run security:secret-scan`                          | En cada PR/push (`secret-scan.yml`) y antes de releases.                                | Sin hallazgos de credenciales de alta confianza en archivos versionados.                   | Logs de escaneo de secretos.              |
| Security / Supply Chain Agent | `npx codacy-analysis-cli` (a través de workflow)        | En CI (`codacy.yml`).                                                                   | SARIF sanitizado y subido.                                                                | `results-*.sarif`.                        |
| Test Sentinel                 | `npm ci && npm test`                                    | Ejecuta suite híbrida: `node:test` (legacy) + `Vitest`.                                 | Todas las pruebas pasan (Legacy + Vitest).                                                | Logs de pruebas.                          |
| Test Sentinel                 | `npx stryker run`                                       | Regresión de calidad en lógica crítica (Cart, Fetch).                                   | Mutation Score estable/incremental.                                                       | Reporte HTML en `reports/mutation/`.      |
| Test Sentinel                 | `npx vitest run <file>`                                 | Ejecución rápida de tests modernos (`.spec.js`).                                        | Test pasa aisladamente.                                                                   | Output de Vitest.                         |
| CI Guardian                   | `gh workflow view <name>` (opcional)                    | Revisiones periódicas de pipelines.                                                     | Workflow refleja nodos fijados, permisos mínimos y cachés con lockfile.                   | Informe de revisión.                      |
| PR/Release Manager            | `git status && git diff --stat`                         | Antes de solicitar revisión/merge.                                                      | Árbol limpio y diff reducido (≤400 líneas netas salvo acuerdos).                          | Evidencia en PR.                          |
| PR/Release Manager            | `npx npm-check-updates --target=minor` (en seguimiento) | Evaluar upgrades permitidos.                                                            | Lista de updates patch/minor para próximas iteraciones.                                   | Comentario o issue con plan.              |

## Guardrails CI/tests

- **Checklist de ejecución determinista**
  - [ ] `node -v` coincide con la versión fijada en workflows (`22.x`).
  - [ ] `npm ci` es obligatorio en CI; queda prohibido `npm install` cuando exista `package-lock.json`.
- **Compilación estricta**
  - [ ] `npm run build` finaliza sin warnings críticos ni errores y deja artefactos en `build/`. Atender cualquier fallo en scripts de `tools/` y revisar que el staging contenga todos los archivos esperados.
- **Tests obligatorios**
  - [ ] `npm ci && npm test` deben ejecutarse completos tras modificaciones; repetir suite si algún caso es flaky.
  - [ ] Prohibido introducir `test.skip`, `--forceExit`, `--passWithNoTests` o eliminar asserts sin reemplazo.
- **Cobertura mínima**
  - Baseline objetivo: 80%.
  - **Mutation Testing**: Verificar reportes de Stryker en cambios críticos. No reintroducir survivors en lógica Core (Cart, Analytics, Logger).
- **Linter/formatter**
  - [ ] `npm run lint` debe terminar en verde. Auto-fixes solo locales; los commits deben incluir diff resultante.
  - [ ] `npm run format` debe asegurar estilo consistente.
- **SARIF estable**
  - Reutilizar el sanitizador existente en `.github/workflows/codacy.yml` (`jq` con `with_entries`). Si se generan SARIF manualmente, aplicar:
    ```bash
    jq 'with_entries(select(.key != "")) | if has("$schema") then . else . + {"$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json"} end | .version = "2.1.0"' input.sarif > sanitized.sarif
    ```
  - Prohibido construir JSON mediante `echo` con interpolaciones; usar `jq` o scripts dedicados.
- **Cambios de dependencias**
  - Patch/minor permitidos si pruebas y auditorías están en verde.
  - Major requieren RFC documentado (impacto, plan de migración, pruebas extra).
- **Seguridad/secretos**
  - Nunca registrar valores sensibles en logs ni en `git diff`.
  - En despliegues productivos del Sync API, configurar `SYNC_API_REQUIRE_AUTH=true` y `SYNC_API_TOKEN`; activar `SYNC_API_STRICT_STARTUP=true` para fail-fast ante misconfiguración.
  - Mantener permisos mínimos en workflows (`contents: read`, `pages: write`, etc.).
- **Presupuesto de cambio**
  - Objetivo ≤400 líneas netas por PR. Refactors grandes requieren desglose.
- **Rollback**
  - Documentar `git revert <sha>` en PRs y aplicar feature flags en scripts si se introducen cambios condicionales.

## Políticas de cambio y PR

- Usar ramas `tipo/slug`, p. ej. `docs/agents-refresh-YYYYMMDD`.
- Commits en formato Conventional Commits (`docs(agents): ...`).
- PRs deben incluir evidencia de pruebas (`npm test`, `npm run build`, auditorías relevantes) y la checklist de guardrails marcada.
- Actualizar documentación relacionada (`README.md`, `docs/operations/RUNBOOK.md`, `docs/operations/BACKUP.md`, `docs/`) en el mismo PR cuando cambian comportamientos.
- Adjuntar resultados de `npm audit --production` cuando se toquen dependencias.

## Comandos canónicos (Prompt 12)

- Runtime objetivo local/CI: Node 22.x.
- Instalación determinista: `npm ci`.
- Validación base:
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `npm run test:e2e`
- Smoke manual guiado: `npm run smoke:manual`.
- Auditoría de producción dependencias: `npm audit --omit=dev`.
- Fallback cuando `node` no esté en `PATH`:
  - `npx -y node@22 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run <script>`

## Checklist PR mínimo

- [ ] Alcance acotado y sin cambios públicos breaking no planificados.
- [ ] `npm run lint` en verde.
- [ ] `npm test` en verde.
- [ ] `npm run build` en verde.
- [ ] `npm run test:e2e` en verde o justificado si no aplica.
- [ ] `npm audit --omit=dev` sin vulnerabilidades altas/críticas.
- [ ] Rollback documentado (`git revert <sha>` + pasos de verificación).
- [ ] Documentación operativa actualizada si cambió comportamiento.

## Flujos de trabajo (CI)

- **`Deploy static content to Pages` (`.github/workflows/static.yml`)**
  - Trigger: push a `main` y `workflow_dispatch`.
  - Permisos: `contents: read`, `pages: write`, `id-token: write`.
  - Concurrency: `group: "pages"`, `cancel-in-progress: false`.
  - Artefacto: repo completo desplegado con `actions/deploy-pages@v4`.
- **`Optimize images` (`.github/workflows/images.yml`)**
  - Trigger: cambios en `assets/images/originals/**` o manual.
  - Node fijado con `actions/setup-node@v4` (`node-version: 22.x`). Usa `npm ci` + scripts `images:generate`, `images:rewrite`, `lint:images`. Auto-commitea resultados.
  - Permisos: `contents: write` para subir optimizaciones.
- **`Codacy Security Scan` (`.github/workflows/codacy.yml`)**
  - Trigger: push/PR a `main` y cron semanal.
  - Permisos mínimos (`security-events: write` solo para subir SARIF).
  - Pasos clave: ejecutar Codacy CLI, dividir SARIF, sanitizar con `jq`, subir a Code Scanning.
  - _Missing:_ caché de dependencias; evaluar usar `actions/setup-node` con caché `npm` si se añade instalación de paquetes.
- **`Secret Scan` (`.github/workflows/secret-scan.yml`)**
  - Trigger: push/PR, cron semanal y ejecución manual.
  - Stack: Node.js 22.x.
  - Tarea: ejecutar `npm run security:secret-scan` sobre archivos versionados para detectar credenciales de alta confianza.
- **`Continuous Integration` (`.github/workflows/ci.yml`)**
  - Trigger: push/PR a `main` (excluyendo `admin/**`).
  - Stack: Node.js 22.x.
  - Tareas: `npm ci`, build, unit tests, estilo CSS, tests E2E (Playwright) y auditoría Lighthouse.
- **`Admin Tools CI` (`.github/workflows/admin.yml`)**
  - Trigger: cambios en `admin/**`.
  - Stack: Python 3.12 (pytest).
  - Tareas: Instalación de dependencias y ejecución de suite de pruebas para el gestor de contenido.

## Playbooks

### Cómo añadir un test nuevo

1.  **Lógica compleja/DOM/Async**: Crear archivo `.spec.js` en `test/` usando **Vitest** (`describe`, `it`, `expect`, `vi`).
    - Ejemplo: `test/cart.spec.js` para lógica de negocio o mocks de `window`.
2.  **Scripts simples/Legacy**: Crear archivo `.test.js` usando `node:test`.
3.  **TypeScript**: Se permiten archivos `.mts` en `src/`. `npm test` y Vitest los soportan nativamente.
4.  Ejecutar `npm test` para verificar integración en la suite completa.
5.  Adjuntar logs de ejecución en el PR.

### Cómo actualizar una dependencia

1. Ejecutar `npm pkg get dependencies["<paquete>"]` para conocer versión actual.
2. Para patch/minor: `npm install <paquete>@latest --save` y confirmar que `package-lock.json` se actualiza.
3. Correr `npm audit --production`, `npm test`, `npm run build` y documentar resultados.
4. Para major: preparar RFC (alcance, breaking changes, plan de validación) antes de abrir PR. No mezclar con otros cambios.

### Cómo depurar fallos de CI

1. Identificar workflow fallido (`gh workflow run list` o interfaz web) y revisar logs.
2. Reproducir localmente con `npm ci`, `npm test`, `npm run build` o scripts específicos del job (p.ej. `npm run images:generate`).
3. Si falla Codacy SARIF, ejecutar localmente el sanitizador con `jq` y verificar esquema `2.1.0`.
4. Documentar hallazgos en el PR con pasos reproducibles y solución propuesta.

### Cómo ejecutar smoke manual guiado

1. Ejecutar `npm run build`.
2. Levantar preview local (`npx serve build -l 4173` o equivalente).
3. Imprimir checklist: `npm run smoke:manual`.
4. Completar validación manual usando `docs/operations/SMOKE_TEST.md`.
5. Adjuntar evidencia en el PR.

### Cómo hacer triage y rollback de incidentes

1. Seguir `docs/operations/INCIDENT_TRIAGE.md` para clasificación, impacto y mitigación.
2. Aplicar rollback con `git revert <sha>` según `docs/operations/ROLLBACK.md`.
3. Cerrar con verificación base (`lint`, `test`, `build`, `test:e2e`) y evidencia en PR.

## How to audit again (mini guía)

1. Crear rama de auditoría: `audit/mega-YYYYMMDD`.
2. Levantar baseline:
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `npm run test:e2e`
3. Si hay rojo, priorizar volver a verde antes de mejoras incrementales.
4. Ejecutar auditoría por etapas con checkpoints y evidencia por etapa en `docs/audit/`.
5. Mantener PRs pequeños (objetivo <=400 líneas netas sin lockfile), con rollback explícito.
6. Cerrar cada etapa con:
  - cambios aplicados
  - comandos ejecutados y resultado
  - riesgos restantes
  - siguiente paso propuesto

## Anexos

- `package.json` (scripts y dependencias). [`package.json`](package.json)
- Lockfile para instalaciones deterministas. [`package-lock.json`](package-lock.json)
- Configuración de ESLint. [`eslint.config.cjs`](eslint.config.cjs)
- Workflows de GitHub Actions. [`static.yml`](.github/workflows/static.yml), [`images.yml`](.github/workflows/images.yml), [`codacy.yml`](.github/workflows/codacy.yml), [`secret-scan.yml`](.github/workflows/secret-scan.yml)
- Scripts de build y utilidades. [`tools/`](tools/)
- Suite de pruebas Node. [`test/`](test/)
- Documentación operativa existente. [`README.md`](README.md), [`RUNBOOK`](docs/operations/RUNBOOK.md), [`BACKUP`](docs/operations/BACKUP.md), [`QUALITY_GUARDRAILS`](docs/operations/QUALITY_GUARDRAILS.md), [`SMOKE_TEST`](docs/operations/SMOKE_TEST.md), [`OBSERVABILITY`](docs/operations/OBSERVABILITY.md), [`DEPENDENCY_POLICY`](docs/operations/DEPENDENCY_POLICY.md), [`DEBUGGING`](docs/operations/DEBUGGING.md), [`INCIDENT_TRIAGE`](docs/operations/INCIDENT_TRIAGE.md), [`ROLLBACK`](docs/operations/ROLLBACK.md)
