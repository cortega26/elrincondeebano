# Plan 266: DEP-05 — dedupe de `@astrojs/compiler-rs` (condición cumplida)

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat b1fd2eba..HEAD -- package.json package-lock.json docs/operations/DEFERRALS.md`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (tooling de dev; sin runtime)
- **Depends on**: — (condición upstream cumplida)
- **Category**: deps / hygiene
- **Planned at**: commit `b1fd2eba`, 2026-10-19

## Why this matters

La fila DEP-05 del registro ("duplicado de `@astrojs/compiler-rs` —
revisar cuando `astro-eslint-parser` adopte 0.5.x") **ya cumplió su
condición**: `astro-eslint-parser@3.2.0` declara
`@astrojs/compiler-rs: ^0.4.0 || ^0.5.0` (verificado en npm hoy), y el
astro del repo pide `^0.5.1` → ambos rangos intersectan en `^0.5.1` y el
duplicado puede colapsar a una sola versión.

## Current state (lock verificado)

- `node_modules/@astrojs/compiler-rs` → **0.3.2** (top-level; de
  `astro-eslint-parser@3.0.0`, que pincha `^0.3.1`).
- `node_modules/astro/node_modules/@astrojs/compiler-rs` → **0.5.1**
  (nested bajo `astro@7.3.6`, que pide `^0.5.1`).
- `eslint-plugin-astro@3.2.1` (declarada `^3.2.1` en `package.json`) →
  `astro-eslint-parser: ^3.0.0` → el lock resolvió **3.0.0**.
- Público hoy: `astro-eslint-parser@3.2.0` (dentro de `^3.0.0`) → con
  `^0.4.0 || ^0.5.0`. `npm view` verificado.

## Commands you will need

| Purpose           | Command                              | Provenance | Expected on success  |
| ----------------- | ------------------------------------ | ---------- | -------------------- |
| Install           | `npm ci` (worktree fresco)           | declared   | exit 0               |
| Estado árbol      | `npm ls @astrojs/compiler-rs`        | declared   | antes: 0.3.2 + 0.5.1 |
| Update            | `npm update astro-eslint-parser`     | declared   | lock re-resuelve     |
| Dedupe (si queda) | `npm dedupe`                         | declared   | una sola copia       |
| Lint              | `npm run lint && npm run lint:astro` | declared   | exit 0               |
| Determinismo      | `npm ci` de nuevo + `npm ls`         | declared   | misma foto           |

## Scope

**In scope**:

- `package-lock.json` (y `package.json` SOLO si npm exige un spec
  explícito — documentar).
- `docs/operations/DEFERRALS.md` (fila DEP-05 → Resolved).

**Out of scope**:

- Bumps de `astro`, `eslint-plugin-astro` u otros paquetes fuera de lo
  necesario para el dedupe.
- Cualquier código.

## Git workflow

- Branch: `advisor/266-dep05-compiler-rs`
- Commit: `chore(deps): dedupe @astrojs/compiler-rs via astro-eslint-parser 3.2 (plan 266)`.
- No push, no PR.

## Steps

### Step 0: Baseline

`npm ci`; `npm ls @astrojs/compiler-rs` → registra el duplicado
(0.3.2 + 0.5.1). `npm run lint && npm run lint:astro` verdes.

### Step 1: Update

`npm update astro-eslint-parser` → ¿subió el lock a 3.2.0?
`npm ls @astrojs/compiler-rs` → ¿quedó una sola versión (0.5.1)?
Si queda duplicado → `npm dedupe` y re-verifica. Si npm no mueve el pin
del lock, prueba `npm install --package-lock-only astro-eslint-parser@^3.2.0`
(documenta la vía usada; si termina añadiendo el parser como devDep
directa, déjalo y justifícalo en el commit).

**Verify**: `npm ls @astrojs/compiler-rs` → **una sola 0.5.1**, sin
`invalid`/`deduped` raros. Revisa `git diff package-lock.json`: churn
**contenido** (solo el subárbol afectado: parser, compiler-rs, y deps
nuevas del parser si las hay — p.ej. `tinyglobby`/`eslint-scope@9`).

### Step 2: Determinismo + lint

`rm -rf node_modules && npm ci` → re-corre `npm ls @astrojs/compiler-rs`
(la misma foto) — el lock debe ser reproducible tal cual.

**Verify**: `npm run lint` y `npm run lint:astro` verdes (el parser es el
que consumen las reglas astro; cero cambios de diagnóstico esperados);
smoke de tests raíz: `npx vitest run test/seo.spec.js` verde (los tests
no dependen del lock, pero deja constancia).

### Step 3: Registro

Mueve la fila DEP-05 ("`@astrojs/compiler-rs` duplicate in the lockfile")
a Resolved citando el commit de este branch + "plan 266" + la matriz
(0.3.2+0.5.1 → 0.5.1 única).

## Test plan

- No hay test unitario para el lock: la verificación es `npm ls` (una
  copia), `npm ci` reproducible y lint verde.
- Smoke de vitest para constancia de que el árbol instalado funciona.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm ls @astrojs/compiler-rs` → **una sola** versión (0.5.1)
- [ ] `npm ci` fresco reproduce la misma foto
- [ ] `npm run lint` + `npm run lint:astro` exit 0; smoke vitest verde
- [ ] Diff del lock contenido (lista de cambios en el reporte)
- [ ] Fila DEP-05 movida a Resolved
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- El dedupe no es posible sin bumpear `astro`/`eslint-plugin-astro` fuera
  de rango — reporta la matriz de versiones y detente.
- Aparecen diagnósticos de lint nuevos/cambiados atribuibles al parser —
  reportar con muestra.
- `npm ci` deja de reproducir el árbol (lock inconsistente) — reportar.

## Maintenance notes

- Reviewer: confirma la foto única, el `npm ci` reproducible y que el
  churn del lock no tocó paquetes ajenos al subárbol.
