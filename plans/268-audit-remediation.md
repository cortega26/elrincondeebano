# Plan 268: Remediation de audit dev-tooling (qs fix + gaps upstream aceptados)

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 80de6e79..HEAD -- package.json package-lock.json docs/operations/DEFERRALS.md`

## Status

- **Priority**: P3
- **Effort**: XS–S
- **Risk**: LOW (dev-tooling; sin runtime)
- **Depends on**: 266 (dedupe), 261/263/267 (cierres)
- **Category**: deps / security hygiene
- **Planned at**: commit `80de6e79`, 2026-10-19

## Why this matters

Revisión de vulnerabilidades del 2026-10-19 (`npm audit` sobre el lock
post-266): **producción 0** (el gate del repo sigue verde); **dev 10**
(5 high, 2 moderate, 3 low), todas transitivas de tooling. De esas:

- **1 resoluble ahora sin breaking**: `qs` moderate (6.15.2 vía
  `@stryker-mutator/core` → `typed-rest-client`); `npm audit` marca
  `fixAvailable=true` (qs 6.16.1 existe).
- **9 sin fix upstream**: la cadena `braces@3.0.3` (¡es la última!) ←
  `micromatch`/`fast-glob`/`globby`/`markdownlint-cli2` high; `katex`
  low (última 0.19.0, pero `markdownlint@0.41.1` pinnea la extensión);
  `smol-toml@1.8.0` moderate (pinneado por `markdownlint-cli2@0.23.3`,
  que **es la última**). La única "fix" que ofrece npm es un **downgrade**
  de `markdownlint-cli2` a 0.21.0 — rechazado por política (no se bajan
  pins de herramientas).

## Current state

- Audit dev: 5 high (`braces`, `fast-glob`, `globby`, `markdownlint-cli2`,
  `micromatch`), 2 moderate (`qs`, `smol-toml`), 3 low (`katex`,
  `markdownlint`, `micromark-extension-math`).
- Versiones latest verificadas: braces **3.0.3** (= instalada),
  micromatch **4.0.8** (=), markdownlint-cli2 **0.23.3** (=),
  markdownlint 0.42.0 (nueva, pero cli2 la pinnea), katex 0.19.0,
  qs **6.16.1**, smol-toml **1.9.1**, typed-rest-client 3.1.2,
  @stryker-mutator/core **10.0.0** (=).

## Commands you will need

| Purpose  | Command                              | Provenance | Expected on success |
| -------- | ------------------------------------ | ---------- | ------------------- |
| Install  | `HUSKY=0 npm ci`                     | declared   | exit 0              |
| Audit    | `npm audit --json`                   | declared   | baseline 10         |
| Fix      | `npm audit fix` (**sin** `--force`)  | declared   | solo no-breaking    |
| Re-audit | `npm audit --omit=dev --json`        | declared   | 0                   |
| Lint     | `npm run lint && npm run lint:astro` | declared   | exit 0              |
| Smoke    | `npx vitest run test/seo.spec.js`    | declared   | green               |

## Scope

**In scope**:

- `package-lock.json` (y `package.json` solo si un rango semver-compatible
  debe ampliarse — documentar).
- `docs/operations/DEFERRALS.md` (fila nueva: findings dev aceptados).

**Out of scope**:

- `--force`, downgrades de `markdownlint-cli2`, cambios major de
  `@stryker-mutator/core`/`typed-rest-client`.
- Código, workflows.

## Git workflow

- Branch: `advisor/268-audit-remediation`
- Commit: `chore(deps): fix the resolvable dev audit finding and register the upstream gaps (plan 268)`.
- No push, no PR.

## Steps

### Step 0: Baseline

`npm ci`; `npm audit --json` → registra los 10 y sus cadenas.

### Step 1: Fix no-breaking

`npm audit fix` (sin `--force`). Inspecciona el output y el diff del lock:

- **Debe** resolver `qs` (→ 6.16.1 dentro de rango) y puede arrastrar
  `smol-toml` del subárbol de astro (1.9.0→1.9.1).
- **NO debe** tocar `markdownlint-cli2` ni cambiar majors. Si lo intenta,
  revierte y reporta (STOP parcial: aplica solo lo seguro).

**Verify**: `npm audit --json` → el conteo baja (esperado: 10→9);
`git diff package-lock.json` contenido (lista los paquetes cambiados).

### Step 2: Re-audit y determinismo

- `npm audit --omit=dev --json` → **0**.
- `rm -rf node_modules && npm ci` → mismo árbol; `npm audit` → mismo
  conteo residual.
- `npm run lint` + `npm run lint:astro` verdes; smoke vitest verde.

### Step 3: Registrar el riesgo aceptado

Añade una fila al registro (`docs/operations/DEFERRALS.md`) en la tabla
Open: "Dev-tooling audit findings (9 residuales: braces-chain,
katex/markdownlint, smol-toml@1.8)" con:

- cadena y severidad,
- evidencia de que **no hay versión parcheada upstream** (últimas
  versiones verificadas siguen vulnerables; la única propuesta de npm es
  un downgrade),
- condición de reapertura: **"cuando cualquiera de los padres publique
  una versión con la dependencia parcheada"** / próxima ola de deps,
- `OPEN — accepted (dev-only)`.

**Verify**: `npm run lint:md` 0 issues; la fila cita la evidencia.

## Test plan

- La verificación es `npm audit` antes/después + determinismo (`npm ci`).
- Smoke de vitest para confirmar que el árbol sigue sano.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm audit --omit=dev` → 0
- [ ] El conteo dev bajó (qs resuelto) o STOP documentado si npm no lo permite
- [ ] Cero downgrades/major changes aplicados; lock churn contenido (lista)
- [ ] `npm ci` reproducible; lint/lint:astro/smoke verdes
- [ ] Fila de riesgo aceptado con evidencia + condición de reapertura
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- `npm audit fix` quiere downgradear `markdownlint-cli2` o tocar majors —
  aplicar SOLO lo seguro, revertir el resto y reportar.
- `qs` no se resuelve con un patch dentro de rango — reporta.

## Maintenance notes

- Reviewer: confirma 0 en producción, el diff del lock, y que la fila de
  riesgo aceptado cita versiones latest verificadas.
