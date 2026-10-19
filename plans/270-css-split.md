# Plan 270: CSS split de páginas de contenido — medir cobertura y extraer (A12-PERF-04)

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat fe2392d3..HEAD -- astro-poc/src/styles/ astro-poc/src/layouts/BaseLayout.astro astro-poc/src/pages/ docs/operations/DEFERRALS.md`
>
> **Coordinación**: el plan 269 corre en paralelo (cart-controller). NO
> toques `scripts/storefront/**` ni `test/storefront.cart-controller.spec.js`.
> Para tus corridas de Playwright usa **`PORT=8111`** (el 269 usa el 8081).

## Status

- **Priority**: P3
- **Effort**: M–L
- **Risk**: MED (cascade CSS; la red es e2e + visual + LH)
- **Depends on**: 239 (CSS legacy retirado), 247 (medición base), 251/265 (n/a directo)
- **Category**: perf / css
- **Planned at**: commit `fe2392d3`, 2026-10-19
- **Gate del registro (PERF-04)**: la fila "Entry-split / content-page
  JS+CSS budget" está REJECTED-with-numbers para el JS (247) y su
  reapertura nombra **el split de CSS como el costo real** (15% de la hoja
  base usado en `/impresiones/`). Este plan mide la masa extraíble y
  ejecuta solo si el gate pasa.

## Why this matters

`BaseLayout` importa `global.css` (3338 líneas / 63 KB) y
`storefront-refinement.css` (418 líneas) en **todas** las páginas —
incluidas las de contenido (`impresiones`, `404`, `pages/[slug]`), que
usan ~15% de esa hoja (medición del 247). El precedente per-página ya
existe: `printing.css` lo importa solo `impresiones.astro`. Extraer las
reglas que solo consumen las páginas de catálogo/carrito debería bajar
drásticamente el CSS de las páginas de contenido sin coste para las
demás.

## Current state

- Estilos: `global.css` (3338 líneas), `storefront-refinement.css` (418),
  `printing.css` (609, solo impresiones).
- `BaseLayout.astro:3-4` importa global + refinement (siempre).
- Páginas: `index`, `c/[category]`, `p/[sku]`, `combos`, `buscar`,
  `impresiones`, `404`, `pages/[slug].html`.
- El offcanvas del carrito/quick-links vive en `Navbar.astro` (presente
  en todas las páginas) — **ojo**: cobertura CDP cuenta reglas que
  _matchean elementos aunque estén ocultos_; la medición debe separar
  "matchea" de "visible/necesario" y comparar SETS entre páginas.
- Barra: LH home 70/100/96/100 (187); `/impresiones/` 86/100/100/100 (247).

## Commands you will need

| Purpose    | Command                                                                                      | Provenance | Expected on success      |
| ---------- | -------------------------------------------------------------------------------------------- | ---------- | ------------------------ |
| Install    | `HUSKY=0 npm ci`                                                                             | declared   | exit 0                   |
| Build      | `npm run build` (canónico)                                                                   | declared   | exit 0                   |
| Cobertura  | script throwaway `/tmp/opencode` (Playwright + CDP, como 247)                                | declared   | set de reglas por página |
| E2E        | `PORT=8111 PLAYWRIGHT_SKIP_BUILD=1 npm run test:e2e`                                         | declared   | 84 passed / 2 skip       |
| Visual/LH  | `PORT=8111 LH_SKIP_BUILD=1 npm run lighthouse:audit` (+ driver para /impresiones/, como 247) | declared   | ≥ baseline               |
| Root tests | `npm test` (o `CI_SKIP_BUILD_CONTRACT=1`)                                                    | declared   | all pass                 |
| Lint       | `npm run lint`                                                                               | declared   | exit 0                   |

## Scope

**In scope**:

- `astro-poc/src/styles/**` (partir hojas; p.ej. nuevo
  `catalog-cart.css` — nombre final a elección, siguiendo el estilo).
- `astro-poc/src/layouts/BaseLayout.astro` y las páginas que deban
  importar el trozo extraído (c/[category], p/[sku], combos, buscar,
  pages/[slug] si corresponde… la clasificación decide).
- `docs/operations/DEFERRALS.md` (fila PERF-04: veredicto).

**Out of scope**:

- `scripts/storefront/**` (plan 269), componentes JS, fuentes, behavior.

## Git workflow

- Branch: `advisor/270-css-split`
- Commits: medición (nota) → split (si el gate pasa) → verificación.
  Todos con `(plan 270)`.
- No push, no PR.

## Steps

### Step 0: Baseline

Instala; build; e2e (`PORT=8111`) 84/2 verde; LH home + `/impresiones/`
baselines registrados; tamaños gz actuales por página (parsear el HTML
construido: `<link rel="stylesheet">` por página — como el 247).

### Step 1: MEDIR (antes de tocar CSS)

Script throwaway (Playwright + CDP `Profiler.takePreciseCoverage`):

1. Por página (`/`, `/c/bebidas/` o similar, `/p/<sku>/`, `/combos/`,
   `/buscar/`, `/impresiones/`, `/404`): set de reglas CSS **matcheadas**
   y **usadas**, y bytes usados/no-usados por hoja (como 247).
2. **Set-difference entre páginas**: reglas que aparecen usadas en las
   páginas de catálogo/carrito pero **nunca** en las de contenido
   (`impresiones`, `404`, `pages/[slug]`) → candidatas a extraer.
3. Estima el ahorro gz por página de contenido si esas reglas se mueven a
   una hoja que solo importan las páginas de catálogo.

**Gate**: implementa SOLO si el ahorro proyectado en `/impresiones/` es
**≥ 5 KB gz** y ninguna otra página empeora. Si no → **REJECTED con
números** (documenta y resuelve/actualiza la fila; termina).

### Step 2: Implementar (solo si el gate pasa)

- Mueve los bloques clasificados a la(s) hoja(s) nueva(s), **preservando
  el orden relativo** para las páginas que las importan (global →
  catalog/cart → page) y sin tocar las reglas compartidas.
- Ajusta los imports en el/los punto(s) mínimo(s): p.ej. un componente
  compartido de catálogo, o las páginas directamente — lo que la
  clasificación indique (documenta la decisión).
- `printing.css` intacto (precedente).

**Verify**: build; tamaños gz por página ANTES/DESPUÉS (las de contenido
bajan; las de catálogo no empeoran materialmente); e2e (`PORT=8111`)
84/2; LH home y `/impresiones/` sin regresión.

### Step 3: Verificación visual/diferencial

- `test/e2e-astro/storefront-visual-refinement.spec.ts` y
  `mobile-home-visual.spec.ts` verdes.
- Diferencias de cascade: si el split reordena reglas para alguna página,
  STOP (no forzar).

### Step 4: Registro

Resuelve "Entry-split / content-page JS+CSS budget" citando el commit +
el delta medido (implementado: X KB gz menos en /impresiones/; o
REJECTED: por qué no compensa — actualiza la condición de reapertura).

## Test plan

- Medición CDP por página (sets + bytes) antes/después.
- e2e completo + specs visuales + LH (home y /impresiones/).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Medición por página registrada (sets usados/no usados + bytes) y veredicto del gate
- [ ] Si implementado: `/impresiones/` baja ≥ 5 KB gz; catálogo no empeora; cascade sin cambios observables
- [ ] e2e 84/2 + visuales verdes; LH sin regresión; root tests/lint verdes
- [ ] Fila PERF-04 resuelta (o actualizada con números)
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- El set-diff es pequeño (la mitad de la hoja “matchea” en todas partes
  por el offcanvas/global chrome) — REJECTED + números, sin implementar.
- El split exige reordenar cascade más allá de bloques contiguos —
  reportar.
- Regresión visual/e2e/LH no reproducible en HEAD — reportar.

## Maintenance notes

- Reviewer: confirma los tamaños por página antes/después y que
  `printing.css` y el layout de catálogo no cambiaron de orden.
