# AGENTS

## Resumen
Este documento coordina a los agentes automatizados y humanos que mantienen **El Rincón de Ébano**, una web estática construida con scripts de Node.js, plantillas EJS y activos precompilados. Establece responsabilidades, comandos verificados y guardrails para preservar la estabilidad de builds, pruebas, seguridad de la cadena de suministro y los flujos de CI/CD actuales.

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
| Agente | Comando | Cuándo se ejecuta | Salida esperada | Artefactos |
| --- | --- | --- | --- | --- |
| Repo Cartographer | `node -v` | Antes de cualquier trabajo para verificar Node ≥ 22 tal como consume CI (`images.yml`). | Versión fija compatible con scripts (`22.x`). | Registro en informe de descubrimiento. |
| Repo Cartographer | `npm pkg get scripts` | Al actualizar documentación o scripts. | JSON con scripts de `package.json`. | Tabla de scripts actualizada en docs. |
| Docs Steward | `npm run build` | Tras cambios en plantillas (`templates/`), datos o herramientas. | Build completo sin errores ni warnings críticos; genera `dist/`, `pages/`, `sitemap.xml`. | Artifacts regenerados listos para commit. |
| Docs Steward | `npm run lighthouse:audit` | Auditorías de rendimiento previas a release. | Reportes en `reports/lighthouse/`. | Archivos HTML de Lighthouse. |
| Type & Lint Guardian | `npx eslint .` | En cada PR y antes de merges; ejecutado también localmente. | Salida limpia sin errores ESLint usando `.eslintrc.json`. | Logs de lint. |
| Type & Lint Guardian | `Missing: Prettier config/dependency` | Registrar TODO en PR hasta que se incorpore Prettier. | N/A | Issue/seguimiento abierto. |
| Security / Supply Chain Agent | `npm audit --production` | Mensual o ante cambios de dependencias. | Sin vulnerabilidades altas/crit.; documentar hallazgos. | Reporte de auditoría. |
| Security / Supply Chain Agent | `npx codacy-analysis-cli` (a través de workflow) | En CI (`codacy.yml`). | SARIF sanitizado y subido. | `results-*.sarif`. |
| Test Sentinel | `npm ci && npm test` | Después de tocar código fuente o utilidades. Repetir si se detecta flakiness. | Todas las pruebas Node pasan dos veces cuando aplique. | Logs de pruebas. |
| Test Sentinel | `node test/<name>.test.js` | Depuración puntual al aislar fallos. | Test individual pasa consistentemente. | Log focalizado. |
| CI Guardian | `gh workflow view <name>` (opcional) | Revisiones periódicas de pipelines. | Workflow refleja nodos fijados, permisos mínimos y cachés con lockfile. | Informe de revisión. |
| PR/Release Manager | `git status && git diff --stat` | Antes de solicitar revisión/merge. | Árbol limpio y diff reducido (≤400 líneas netas salvo acuerdos). | Evidencia en PR. |
| PR/Release Manager | `npx npm-check-updates --target=minor` (en seguimiento) | Evaluar upgrades permitidos. | Lista de updates patch/minor para próximas iteraciones. | Comentario o issue con plan. |

## Guardrails CI/tests
- **Checklist de ejecución determinista**
  - [ ] `node -v` coincide con la versión fijada en workflows (`22.x`).
  - [ ] `npm ci` es obligatorio en CI; queda prohibido `npm install` cuando exista `package-lock.json`.
- **Compilación estricta**
  - [ ] `npm run build` finaliza sin warnings críticos ni errores. Atender cualquier fallo en scripts de `tools/`.
- **Tests obligatorios**
  - [ ] `npm ci && npm test` deben ejecutarse completos tras modificaciones; repetir suite si algún caso es flaky.
  - [ ] Prohibido introducir `test.skip`, `--forceExit`, `--passWithNoTests` o eliminar asserts sin reemplazo.
- **Cobertura mínima**
  - Baseline objetivo: 80%. *Missing:* instrumentación de cobertura; abrir seguimiento para integrar `c8` o similar y reportar métricas.
- **Linter/formatter**
  - [ ] `npx eslint .` debe terminar en verde. Auto-fixes solo locales; los commits deben incluir diff resultante.
  - *Missing:* `prettier --check` hasta incorporar configuración y dependencia.
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

## Flujos de trabajo (CI)
- **`Deploy static content to Pages` (`.github/workflows/static.yml`)**
  - Trigger: push a `main` y `workflow_dispatch`.
  - Permisos: `contents: read`, `pages: write`, `id-token: write`.
  - Concurrency: `group: "pages"`, `cancel-in-progress: false`.
  - Artefacto: repo completo desplegado con `actions/deploy-pages@v4`.
- **`Optimize images` (`.github/workflows/images.yml`)**
  - Trigger: cambios en `assets/img/originals/**` o manual.
  - Node fijado con `actions/setup-node@v4` (`node-version: 22.x`). Usa `npm ci` + scripts `images:generate`, `images:rewrite`, `lint:images`. Auto-commitea resultados.
  - Permisos: `contents: write` para subir optimizaciones.
- **`Codacy Security Scan` (`.github/workflows/codacy.yml`)**
  - Trigger: push/PR a `main` y cron semanal.
  - Permisos mínimos (`security-events: write` solo para subir SARIF).
  - Pasos clave: ejecutar Codacy CLI, dividir SARIF, sanitizar con `jq`, subir a Code Scanning.
  - *Missing:* caché de dependencias; evaluar usar `actions/setup-node` con caché `npm` si se añade instalación de paquetes.

## Playbooks
### Cómo añadir un test nuevo
1. Crear archivo en `test/` siguiendo convención `<feature>.test.js` y usar `node:test`/`assert` como en los existentes.
2. Ejecutar `npm ci` si es la primera vez y luego `npm test` dos veces consecutivas para asegurar estabilidad.
3. Actualizar documentación si el test cubre nueva funcionalidad o corrige regresiones.
4. Adjuntar logs de ambas ejecuciones en el PR.

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

## Anexos
- `package.json` (scripts y dependencias). [`package.json`](package.json)
- Lockfile para instalaciones deterministas. [`package-lock.json`](package-lock.json)
- Configuración de ESLint. [`.eslintrc.json`](.eslintrc.json)
- Workflows de GitHub Actions. [`static.yml`](.github/workflows/static.yml), [`images.yml`](.github/workflows/images.yml), [`codacy.yml`](.github/workflows/codacy.yml)
- Scripts de build y utilidades. [`tools/`](tools/)
- Suite de pruebas Node. [`test/`](test/)
- Documentación operativa existente. [`README.md`](README.md), [`RUNBOOK`](docs/operations/RUNBOOK.md), [`BACKUP`](docs/operations/BACKUP.md)
