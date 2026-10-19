# Plan 273: A11y — color-contrast a AA + audit page-aware (restaurar la barra 187)

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat cdf4e124..HEAD -- astro-poc/src/styles/ tools/lighthouse-audit.mjs package.json`

## Status

- **Priority**: P2 (accesibilidad user-facing)
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: 187 (barra grabada), 239 (CSS único)
- **Category**: a11y / perf-tooling
- **Planned at**: commit `cdf4e124`, 2026-10-19

## Why this matters

La barra del plan 187 es **LH 70/100/96/100** (home). Hoy, medido dos
veces en esta sesión (269/270), el home está en **68-69/97/100/100**: la
pérdida de a11y es **`color-contrast=0`** (fallo determinista, no ruido
de sandbox). Además, `lighthouse:audit` **solo audita home** (targetUrl
hardcodeado `${origin}/index.html`), por lo que `/impresiones/` y otras
páginas exigieron drivers throwaway en 247/270. Este plan arregla el
contraste (WCAG AA) y hace la herramienta page-aware.

## Current state

- `tools/lighthouse-audit.mjs`: `main()` fija `const targetUrl =
\`${origin}/index.html\``y`port = 4173`; presets `desktop`y`mobile`;
reportes en `reports/lighthouse/`. Sin argumentos.
- Estilos: `astro-poc/src/styles/global.css` (3338 líneas) +
  `storefront-refinement.css` (418) — hojas únicas post-239.
- LH home (sandbox): 68-69/97/100/100; `/impresiones/` mobile 85/100/100/100;
  `/404` 86/96/100/100 (color-contrast también).
- La barra 187 incluye a11y **100**.

## Commands you will need

| Purpose   | Command                                                              | Provenance | Expected on success |
| --------- | -------------------------------------------------------------------- | ---------- | ------------------- |
| Install   | `HUSKY=0 npm ci`                                                     | declared   | exit 0              |
| Build     | `npm run build`                                                      | declared   | exit 0              |
| LH home   | `npm run lighthouse:audit`                                           | declared   | a11y 100 (meta)     |
| LH página | `node tools/lighthouse-audit.mjs --path /impresiones/` (tras Step 1) | declared   | a11y 100            |
| E2E       | `PLAYWRIGHT_SKIP_BUILD=1 npm run test:e2e`                           | declared   | 84/2                |
| Lint      | `npm run lint`                                                       | declared   | exit 0              |

## Scope

**In scope**:

- `tools/lighthouse-audit.mjs` (`--path`, report label).
- `astro-poc/src/styles/**` (solo pares de color que fallen contraste).
- `plans/README.md` NO (lo mantiene el reviewer).

**Out of scope**:

- Cambiar la identidad de marca más allá de tokens de color; perf/LCP
  (solo se registra el número, no se persigue ruido de sandbox).

## Git workflow

- Branch: `advisor/273-a11y-contrast`
- Commits: tool (`feat(tools): page-aware lighthouse audit (plan 273)`) →
  contraste (`fix(a11y): meet AA contrast on the flagged pairs (plan 273)`).
- No push, no PR.

## Steps

### Step 0: Baseline con detalle

Build; `npm run lighthouse:audit`; guarda el JSON y extrae
`audits['color-contrast'].details.items` (selector, colores fg/bg,
ratio, snippet) — esa es la lista de fallos a corregir. Registra scores.

### Step 1: Herramienta page-aware

Añade soporte `--path <ruta>` (default `/index.html` = comportamiento
actual). El label del reporte debe distinguir la página (p.ej. `home`,
`impresiones`). Mantén presets, puerto y salida.

**Verify**: default idéntico al actual (mismos ficheros); `--path
/impresiones/` audita esa página (el server estático ya resuelve
directorios → `index.html`).

### Step 2: Contraste AA

Para cada par flaggeado: ajusta el color **mínimo** para alcanzar
**4.5:1** (texto normal) / **3:1** (texto grande ≥24px o ≥19px bold),
prefiriendo tokens (`--bs-*`/variables propias) sobre reglas sueltas.
Documenta cada cambio: selector, antes → después, ratio calculado.

**Verify**: `npm run lighthouse:audit` → a11y **100**; `--path
/impresiones/` → a11y **100**; `--path /c/bebidas/` → a11y **100**.

### Step 3: Gates

**Verify**: e2e completa 84/2 + specs visuales (`storefront-visual-refinement`,
`mobile-home-visual`) verdes; perf del home **sin regresión** en la misma
máquina (reporta el número; el sandbox es ruidoso — no persigas LCP);
`npm run lint` exit 0.

## Test plan

- LH a11y 100 en 3 páginas (home, impresiones, categoría).
- E2E + visuales como red de regresión; sin tests nuevos de unidad (CSS).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] LH a11y **100** en home, `/impresiones/`, `/c/bebidas/`
- [ ] `--path` funciona y el default no cambia
- [ ] Lista de pares corregidos con ratios antes/después
- [ ] e2e 84/2 + visuales + lint verdes; perf sin regresión
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- Un par exige cambiar colores de marca (fuera de tokens) — reportar la
  lista y la opción de tokens antes de tocar.
- El score de contraste sigue <100 y el detalle viene vacío — reportar.
- LH no es estable en el sandbox para el delta de perf — reportar números.

## Maintenance notes

- Reviewer: confirma a11y 100 ×3, el diff de color (solo pares
  flaggeados) y que el default de la herramienta no cambió.
