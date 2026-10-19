# Plan 255: Tools logger batch-2 (diferido del plan 244)

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 7b0cf08a..HEAD -- tools/ eslint.config.cjs`
> (el inventario vive en este plan; si el conjunto de archivos con
> `console.*` cambió, reconcilia antes de proceder).

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW–MED
- **Depends on**: 244 (landed)
- **Category**: dx / chore
- **Planned at**: commit `7b0cf08a`, 2026-10-19

## Why this matters

El plan 244 migró la suite de guardrails y la cadena de preflight al logger
compartido (`tools/utils/logger.mjs`) y dejó diferido el "batch-2 migration
of the remaining ~40 tool files". Verificado hoy: **41 archivos** bajo
`tools/` todavía usan `console.*`. Migrarlos al logger (mensajes JSON con
texto intacto) cierra la consistencia de salida de tooling y permite que el
override `no-console` cubra `tools/**` sin huecos.

## Current state

- Inventario (comando): `grep -rln "console\." tools/ --include="*.mjs" --include="*.js" | grep -v node_modules` → **41 archivos**.
- Exclusiones decididas de antemano (documentadas, no migrar):
  - `tools/utils/logger.mjs` — la implementación del logger (su sink puede
    usar console/`process.stdout`).
  - `tools/utils/stage-runner.mjs` — salida humana + JSON mezclada por
    diseño (plan 206; leer su comentario in-file para confirmar; mantener).
- Auditoría de consumidores **obligatoria por archivo** antes de migrar.
  Señales ya vistas: `tools/post-deploy-canary.mjs:368` imprime el reporte
  JSON del canary (¿lo parsea algún workflow/script?);
  `tools/ci/catalog-build-tree-check.mjs` imprime líneas de logo derivado
  (superficie de job CI); `tools/check-plan-archive.mjs` imprime FAIL/OK
  (consumido por exit code en validate/lint-staged/CI).
- Estilo de la casa (del 244): diagnósticos → `logger` con el texto
  **verbatim**; payloads de máquina → se quedan en `process.stdout.write`;
  mapeo `log→info`, `warn→warn`, `error→error`, `debug→debug`; `meta`
  estructurado se conserva.
- Los archivos CJS cargan el logger vía `require('../utils/logger.mjs')`
  (Node 24 `require(esm)`; ya probado por el 244 en `orphan-assets.js` y
  `preflight.js`).

## Commands you will need

| Purpose       | Command                                                                                   | Provenance | Expected on success           |
| ------------- | ----------------------------------------------------------------------------------------- | ---------- | ----------------------------- |
| Install       | `HUSKY=0 npm ci`                                                                          | declared   | exit 0                        |
| Inventario    | `grep -rln "console\." tools/ --include="*.mjs" --include="*.js" \| grep -v node_modules` | declared   | 41                            |
| Guardrails    | `npm run guardrails && npm run guardrails:assets`                                         | declared   | exit 0                        |
| Secret scan   | `npm run security:secret-scan`                                                            | declared   | exit 0                        |
| Lint raíz     | `npm run lint`                                                                            | declared   | exit 0                        |
| Tests (raíz)  | `CI_SKIP_BUILD_CONTRACT=1 npm test` (o build canónico + `npm test`)                       | declared   | all pass / skips documentados |
| ESLint scoped | `npx eslint tools/`                                                                       | declared   | exit 0                        |

## Scope

**In scope**:

- Los ~39 archivos restantes de la lista (todos menos las 2 exclusiones
  fijas y los que la auditoría conserve por payload de máquina).
- `eslint.config.cjs` (raíz): extender el override `no-console` del 244.

**Out of scope**:

- `tools/utils/logger.mjs`, `tools/utils/stage-runner.mjs` (ver arriba).
- `astro-poc/**`, `admin/**`, workflows.
- Cambios de conducta: el **texto** de cada mensaje queda verbatim; solo
  cambia el canal (logger). Los exit codes no se tocan.

## Git workflow

- Branch: `advisor/255-tools-logger-batch2`
- Commits por área, todos con `(plan 255)`: p.ej.
  `chore(tools): migrate generators/OG tools to the shared logger (plan 255)`.
- No push, no PR. No introducir diferidos nuevos; si aparece uno,
  regístralo en `docs/operations/DEFERRALS.md` en el mismo commit.

## Steps

### Step 0: Baseline

Instala; `npm run guardrails && npm run guardrails:assets &&
npm run security:secret-scan` exit 0; `npx eslint tools/guardrails
tools/preflight.js tools/run-parallel.mjs tools/preflight-hash.mjs` exit 0
(el override del 244 vigente). Rojo → STOP.

### Step 1: Inventario + auditoría de consumidores

Corre el grep; por cada archivo clasifica cada sitio `console.*`:

- diagnóstico → migrar;
- payload de máquina (stdout parseado por un script/workflow) → mantener
  como `process.stdout.write`, migrar solo el resto;
- ambiguo → mantener + documentar.
  Guarda la clasificación (archivo → migrado/excluido + razón) para el
  reporte. **Ningún archivo se migra sin haber leído sus consumidores**
  (scripts de `package.json`, `.github/workflows`, tests).

**Verify**: clasificación 41/41 sin huecos.

### Step 2: Migrar por áreas

Áreas sugeridas (commits separados): (a) generadores de imágenes/OG,
(b) pipeline de imágenes, (c) checks/ci, (d) monitores/contratos, (e)
utils y raíz. Texto verbatim, mapeo de niveles, `meta` conservado.

**Verify** tras cada área: los archivos migrados con `grep -n "console\."`
vacíos; `node` ejecutable de 1-2 de ellos sin error (los que sean seguros).

### Step 3: Override ESLint

Lee el bloque del 244 en `eslint.config.cjs` y **extiéndelo** a
`tools/**/*.{js,mjs}` con `ignores` para `logger.mjs` y `stage-runner.mjs`
(y cualquier excluido por payload). **Verify**: `npx eslint tools` exit 0;
sonda negativa (archivo temporal con `console.log` → error `no-console`;
borrar la sonda).

### Step 4: Corridas de muestra

Ejecuta y confirma exit 0 con texto intacto: `node
tools/check-plan-archive.mjs`; `node tools/check-determinism-paths.mjs`;
`npm run check:e2e-selectors`; `npm run images:logo` dos veces (2.ª →
hash-gate skip); `npm run guardrails`. Añade 2-3 herramientas baratas más
del conjunto migrado que elijas y documenta cuáles.

**Verify**: todas exit 0; los mensajes migrados aparecen con el texto de
antes.

### Step 5: Gates finales

**Verify**: guardrails combo; `npm run lint`; tests según la tabla;
`grep -rn "console\." tools/ --include="*.mjs" --include="*.js"` solo
devuelve las exclusiones documentadas.

## Test plan

- No se añaden tests nuevos (migración de salida, no de contrato); la red
  son los scripts reales ejecutados en Step 4/5 + las suites de guardrails.
- La sonda negativa del override prueba que la regla quedó viva.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "console\." tools/ --include="*.mjs" --include="*.js"` = solo las exclusiones documentadas (logger.mjs, stage-runner.mjs, ± payloads)
- [ ] Override `no-console` extendido con sonda negativa probada
- [ ] Guardrails + secret-scan + lint exit 0; tests verdes (o skips documentados)
- [ ] Clasificación 41/41 registrada en el reporte (migrado/excluido + razón)
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- Un consumidor parsea el stdout de una herramienta migrada de forma que
  `process.stdout.write` no cubra — reportar el consumer con evidencia.
- `stage-runner.mjs` o `logger.mjs` contradicen esa exclusión al leerlos —
  reportar.
- Una herramienta falla en HEAD (preexistente) al ejecutarla de muestra —
  reportar, no arreglar.

## Maintenance notes

- Reviewer: confirma que el glob del override no exime silenciosamente
  `logger.mjs` por accidente, que el texto de los mensajes no cambió
  (diff por archivo) y que la lista de exclusiones del reporte coincide
  con los matches del grep final.
