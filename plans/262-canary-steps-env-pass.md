# Plan 262: Canary — env-pass de `steps.*.outputs` inline en los bloques bash

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat f758af72..HEAD -- .github/workflows/post-deploy-canary.yml`

## Status

- **Priority**: P3
- **Effort**: XS
- **Risk**: LOW
- **Depends on**: 259 (mismo patrón), 225 (hardening original)
- **Category**: ci / hardening
- **Planned at**: commit `f758af72`, 2026-10-19

## Why this matters

El plan 259 cerró el env-pass de `needs.*.outputs` en el probe, y de paso
quedó **observado** (fila DONE del 259) que el job `artifact-canary`
todavía interpola expresiones `${{ steps.* }}` / `${{ job.status }}`
dentro de bloques `run:` de bash — misma clase de superficie que el
hardening del 225 busca eliminar. Este plan completa el barrido del
archivo (gemelo del 259).

## Current state

`.github/workflows/post-deploy-canary.yml` — usos verificados hoy:

- **Bloques bash con interpolación inline (a arreglar)**:
  - "Write artifact canary report" (~140-160): dentro de un heredoc
    `cat > ... <<JSON` — `${{ steps.meta.outputs.base_url }}`,
    `${{ steps.meta.outputs.deploy_sha }}`,
    `${{ steps.browser_canary.outcome }}` (dos sitios).
  - "Write canary summary" (~185-195): en `echo` — `deploy_sha`,
    `base_url`, `browser_canary.outcome`, y además
    `if [ "${{ job.status }}" = "success" ]`.
- **Usos legítimos fuera de bash (no tocar)**: `outputs:` del job
  (~~:78-81), `ref:` de un checkout (~~:123), `url:` de un paso de deploy
  (~:296).

## Commands you will need

| Purpose      | Command                                                                                      | Provenance | Expected on success |
| ------------ | -------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install      | `HUSKY=0 npm ci`                                                                             | declared   | exit 0              |
| YAML syntax  | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/post-deploy-canary.yml'))"` | declared   | OK                  |
| Sweep        | script YAML-aware que parsea el doc y revisa cada `run:`                                     | declared   | cero `${{`          |
| Markdownlint | `npm run lint:md`                                                                            | declared   | 0 issues            |

## Scope

**In scope**:

- `.github/workflows/post-deploy-canary.yml` (los DOS pasos de arriba).

**Out of scope**:

- Los usos YAML legítimos; otros workflows (si encuentras el patrón en
  otro archivo, repórtalo, no lo toques).

## Git workflow

- Branch: `advisor/262-canary-steps-env-pass`
- Commit: `ci(canary): pass step/job expressions through env in bash blocks (plan 262)`.
- No push, no PR. Sin cambios de registro (la observación vive en la fila
  DONE del 259; este plan la ejecuta, no la difiere).

## Steps

### Step 0: Baseline

Instala; valida YAML; inventario **completo** de `${{` en el archivo,
clasificado en bash / no-bash. El sweep del 259 solo miraba `needs.`;
extiéndelo aquí para reportar **cualquier** `${{` dentro de strings de
`run:` (los `$(date …)` de shell NO son `${{` y quedan).

### Step 1: Fix del bloque del reporte JSON

Añade `env:` al paso "Write artifact canary report"
(`BASE_URL`, `DEPLOY_SHA`, `BROWSER_CANARY_OUTCOME`) y usa
`"$BASE_URL"` etc. dentro del heredoc (el heredoc no está citado, así que
expande variables; el JSON debe quedar **idéntico** en forma — compara el
contenido del archivo generado por construcción).

### Step 2: Fix del bloque de resumen

Igual para "Write canary summary": `env:` con `DEPLOY_SHA`, `BASE_URL`,
`BROWSER_CANARY_OUTCOME`, `JOB_STATUS`, y en el script
`"$JOB_STATUS"` en el `if`. Mantén cada `echo` byte-equivalente (solo
cambia la fuente del valor).

### Step 3: Verificación

- YAML parse OK.
- Sweep YAML-aware: **cero** `${{` dentro de cualquier string de `run:`
  (reporta el inventario final).
- `git diff` quirúrgico: solo los dos pasos.
- `npm run lint:md` exit 0; `git status` limpio.

**Verify**: los cuatro puntos, con salida en el reporte.

### Step 4: (Nada de registro)

No hay fila del registro que resolver; la observación del 259 se cierra
en la fila del README de este plan (la mantiene el reviewer).

## Test plan

Sin unit tests para workflows: la red es el parseo YAML + el sweep
`${{`-en-`run:` + diff quirúrgico. actionlint corre en CI al push.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Cero `${{ … }}` dentro de strings de `run:` en todo el archivo (sweep YAML-aware)
- [ ] Los dos pasos usan `env:` + variables de shell; JSON/echo byte-equivalentes en forma
- [ ] YAML parsea; diff solo de los dos bloques
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- El sweep encuentra `${{` inline en OTROS `run:` fuera de los dos pasos
  (reporta el inventario antes de tocar más).
- El heredoc requiere reestructuración (p.ej. citado `<<'JSON'`) para
  escapar comillas — reportar en vez de reescribir el formato.

## Maintenance notes

- Reviewer: confirma que el contenido generado del JSON/reporte mantiene
  misma forma (sin comillas rotas) y que los usos YAML legítimos (78-81,
  123, 296) quedaron intactos.
