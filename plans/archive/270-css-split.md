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

## Completion note — REJECTED (measure-only, 2026-10-19)

Worktree `advisor/270-css-split` @ `5bc448dc` (base `fe2392d3`); drift check
(`git diff --stat fe2392d3..HEAD -- astro-poc/src/styles/ astro-poc/src/layouts/BaseLayout.astro astro-poc/src/pages/ docs/operations/DEFERRALS.md`) vacío;
`HUSKY=0 npm ci` exit 0; `npm run build` canónico exit 0.

**Decisión: REJECTED — la masa extraíble no compensa.** El ahorro proyectado
en `/impresiones/` es **2,83 KB gzip (< 5 KB de gate)** y el split empeoraría
**+1,57 KB gzip todas las páginas de catálogo** (dos recursos HTTP en vez de
uno). Sin implementación: `BaseLayout.astro`, `global.css`,
`storefront-refinement.css` y `printing.css` quedan intactos.

### Medición (CDP `CSS.startRuleUsageTracking` + Playwright, throwaway en `/tmp/opencode/plan270`)

Páginas: `/`, `/c/bebidas/`, `/p/p-00770236729335/`, `/combos/`, `/buscar/`,
`/impresiones/`, `/404`, `/pages/bebidas.html`; carga limpia y —para el
offcanvas— con carrito de 2 ítems y el offcanvas abierto. CDP sólo devuelve
reglas _matcheadas_ (`used=true`): se comparan **sets**, nunca porcentajes.
`fonts.css` no tiene reglas de estilo; el resto de hojas ya son por página.

**Corrección de clasificación del plan:** `dist/pages/bebidas.html` es
byte-idéntico a `dist/c/bebidas/index.html` (49711 B, `diff` limpio): trae
`#product-container`, 27 product-cards y el formulario de pedido completo.
`pages/[slug]` es, por tanto, **catálogo** (debe importar el trozo extraído),
no página de contenido como asumía la línea del set-diff. Contenido =
`/impresiones/` + `/404` (`/offline.html` no carga ninguna hoja).

| página                 | hojas CSS                        | CSS raw | CSS gzip -9 | reglas base-sheet | bytes base-sheet (%) |
| ---------------------- | -------------------------------- | ------: | ----------: | ----------------: | -------------------: |
| `/`                    | fonts+base+index+CategoryStrip   |  227376 |       35708 |               331 |        45783 (20.9%) |
| `/c/bebidas/`          | fonts+base                       |  219905 |       33538 |               295 |        43112 (19.7%) |
| `/p/p-00770236729335/` | fonts+base+CategoryStrip+`_sku_` |  231838 |       36548 |               259 |        37996 (17.4%) |
| `/combos/`             | fonts+base                       |  219905 |       33538 |               232 |        34696 (15.8%) |
| `/buscar/`             | fonts+base                       |  219905 |       33538 |               299 |        43530 (19.9%) |
| `/impresiones/`        | fonts+base+impresiones           |  228778 |       35805 |               213 |        32771 (15.0%) |
| `/404`                 | fonts+base                       |  219905 |       33538 |               204 |        31708 (14.5%) |
| `/pages/bebidas.html`  | fonts+base                       |  219905 |       33538 |               295 |        43112 (19.7%) |

La cifra 15.0% de `/impresiones/` reproduce exactamente la medición del 247.
Con el carrito poblado: `/impresiones/` 246 reglas / 16.8%, `/404` 237 / 16.3%.

**Set-diff** (base sheet): unión catálogo 430 reglas matcheadas; unión
contenido 259; **183 reglas candidatas = 18134 B raw** (reglas completas;
5 registros de preludio `@media` excluidos del splice). Composición: bootstrap
6105 B · `global.css` 9648 B · `storefront-refinement.css` 2381 B. El 60%
(259/430) de las reglas matcheadas en catálogo también matchea en contenido
(navbar/offcanvas/footer compartidos) — es el STOP condition del set-diff
pequeño. La masa candidata es el 8.3% de los 218993 B de la hoja base.

**Proyección** (splice de las reglas candidatas sobre el bundle construido,
gzip -9): original raw 218993 / gz 33280 / br 25005 → recortado raw
200858 / gz 30450 / br 22844 = **−2830 B gz / −2161 B br** en
`/impresiones/` y `/404`; hoja extraída raw 18135 / gz 4395. En catálogo:
30450 + 4395 = 34845 vs 33280 → **+1565 B gz de regresión en cada página de
catálogo** (home, categoría, producto, combos, búsqueda, legacy).

**Gate:** ≥5120 B gz → NO (55% del gate). «Ninguna otra página empeora» →
NO (+1565 B gz en catálogo). **REJECTED.** El offcanvas no infló candidatas
(las reglas de líneas de carrito nunca fueron candidatas: también matchean en
catálogo sólo con carrito poblado); el pase poblado retiró 2 variantes
`.btn-outline-secondary` (−780 B raw, −45 B gz).

### Verificación en HEAD (sin cambios de código)

- `PORT=8111 PLAYWRIGHT_SKIP_BUILD=1 npm run test:e2e` → 84 passed / 2 skipped.
- `storefront-visual-refinement.spec.ts` + `mobile-home-visual.spec.ts` → 7 passed.
- LH mobile `/impresiones/` → 85/100/100/100 (baseline 247: 86; LCP 3,4 s, TBT 0 ms);
  home mobile 68/97/100/100, desktop 69/97/100/100 (a11y 97 =
  `color-contrast` preexistente). Sin «after»: no hay implementación.
- `npm test` → 115 files / 879 tests passed. `npm run lint` → exit 0 (263
  warnings preexistentes, 0 errors).

### Reapertura

Reabrir sólo si: las páginas de contenido dejan de compartir el chrome
navbar/offcanvas/carrito, o la masa catalog-only matcheada crece hasta ~33 KB
raw (≈5 KB gz tras el coste de fichero extra), o `/impresiones/` pasa a ser
landing primaria y el trabajo se re-scope a **quitar chrome** de las páginas
de contenido (otro problema, no este split).

Override del despacho: `plans/README.md` lo mantiene el reviewer (no se tocó).
