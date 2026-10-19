# Plan 259: Canary — env-pass de `needs.*.outputs` (fila 16 del registro)

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat c72f786a..HEAD -- .github/workflows/post-deploy-canary.yml docs/operations/DEFERRALS.md`

## Status

- **Priority**: P3
- **Effort**: XS
- **Risk**: LOW
- **Depends on**: 225 (landed)
- **Category**: ci / hardening
- **Planned at**: commit `c72f786a`, 2026-10-19

## Why this matters

El plan 225 pasó las interpolaciones `${{ needs.artifact-canary.outputs.* }}`
a `env:` en los pasos hermanos, pero **un paso quedó inline** dentro del
`run:` de bash (fila 16 del registro): el probe de browser en vivo
interpola `base_url` y `timeout_ms` directamente en el script — patrón
que el hardening de 225 busca eliminar (inyección de valores a través de
la expansión de expresiones GitHub en bash).

## Current state

En `.github/workflows/post-deploy-canary.yml`:

- Línea ~208: `ref: ${{ needs.artifact-canary.outputs.deploy_sha }}` —
  **no es bash** (es el `ref:` de un checkout); **se queda**.
- Líneas ~218-224 — el candidato:

```yaml
- name: Run live browser contract probe
  shell: bash
  run: |
    mkdir -p reports/canary
    node tools/live-browser-contract.mjs \
      --base-url "${{ needs.artifact-canary.outputs.base_url }}" \
      --timeout-ms "${{ needs.artifact-canary.outputs.timeout_ms }}" \
      --report reports/canary/live-browser.json
```

- Los pasos siguientes (~226+) **ya usan `env:`** (BASE_URL, TIMEOUT_MS,
  CATEGORY_PATH, DEPLOY_SHA) — este es el último inline de bash.

## Commands you will need

| Purpose     | Command                                                                                      | Provenance | Expected on success       |
| ----------- | -------------------------------------------------------------------------------------------- | ---------- | ------------------------- |
| Instalar    | `HUSKY=0 npm ci`                                                                             | declared   | exit 0                    |
| YAML syntax | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/post-deploy-canary.yml'))"` | declared   | OK                        |
| Barrido     | `grep -n '\${{\s*needs\.' .github/workflows/post-deploy-canary.yml`                          | declared   | solo `ref:` fuera de bash |
| actionlint  | (no instalado local; lo corre CI con `raven-actions/actionlint`)                             | declared   | —                         |

## Scope

**In scope**:

- `.github/workflows/post-deploy-canary.yml` (el paso del probe).
- `docs/operations/DEFERRALS.md` (fila 16 → Resolved).

**Out of scope**:

- El `ref:` de la línea 208 y los pasos que ya usan env.
- Otros workflows (si encuentras el mismo patrón en otro archivo, repórtalo
  en vez de ampliar scope).

## Git workflow

- Branch: `advisor/259-canary-env-pass`
- Commits: `ci(canary): pass needs outputs through env in the live probe (plan 259)`
  y `docs(ops): resolve the canary env-pass register row (plan 259)`.
- No push, no PR.

## Steps

### Step 0: Baseline

Instala; valida el YAML con python (OK). Registra el grep inicial: `208`
(ref, fuera de bash) + `221,222` (inline en bash, el objetivo).

### Step 1: Fix

Añade al paso un bloque `env:` con `BASE_URL` y `TIMEOUT_MS` (mismos
valores `${{ needs.artifact-canary.outputs.* }}`), y en el `run:` usa
`"$BASE_URL"` y `"$TIMEOUT_MS"`. No cambies el resto del paso (nombre,
`shell`, `mkdir`, `--report`).

**Verify**:

- `python3 -c "import yaml; yaml.safe_load(...)"` → OK.
- `grep -n '\${{\s*needs\.'` → **solo** la línea 208 (o su nueva
  posición) referenciada desde `ref:`; ninguna interpolación `needs.`
  dentro de bloques `run:`.
- Diff **quirúrgico**: solo el bloque del paso cambió (revisa
  `git diff`).

### Step 2: Registro

Mueve la fila "Canary live-probe `needs.*.outputs` inline interpolation"
a la sección Resolved de `docs/operations/DEFERRALS.md`, citando el
commit del fix de esta rama + "plan 259".

**Verify**: fila en Resolved; `npm run lint:md` 0 issues.

### Step 3: Gates

**Verify**: `npm run lint:md` exit 0; `git status` limpio. (actionlint no
está instalado localmente; lo valida CI en el push.)

## Test plan

No hay unit test para un workflow; las pruebas son el parseo YAML, el
barrido de interpolaciones y el diff quirúrgico. CI correrá actionlint al
aterrizar el cambio.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] El paso del probe usa `env:` + `"$BASE_URL"`/`"$TIMEOUT_MS"`; cero interpolaciones `needs.` en bash
- [ ] YAML parsea; diff solo del bloque del paso
- [ ] Fila 16 movida a Resolved con cita
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- El mismo patrón inline existe en otros `run:` del MISMO archivo más allá
  de 221-222 (reportar el inventario antes de tocar más).
- El parseo YAML falla en el baseline (preexistente) — reportar.

## Maintenance notes

- Reviewer: confirma que la línea `ref:` no se tocó y que el grep final
  no tiene `needs.` dentro de `run:`.
