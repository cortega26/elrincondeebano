# Plan 019: Reducir CSS de Bootstrap no utilizado

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 633eeb8..HEAD -- astro-poc/src/layouts/BaseLayout.astro astro-poc/src/styles/global.css`
> If files changed, compare excerpts against live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 013 (Astro version correct for build)
- **Category**: perf
- **Planned at**: commit `633eeb8`, 2026-07-14

## Why this matters

`BaseLayout.astro:2` importa `bootstrap/dist/css/bootstrap.min.css` — el CSS completo de Bootstrap 5.3.3 (~200KB sin minimizar). Componentes como carousel, accordion, tooltips, popovers, modals, spinners, placeholders, toasts, progress bars, y breadcrumb nunca se usan en este catálogo. Estimación conservadora: 30-50% del CSS es código muerto que cada visitante descarga y parsea. En dispositivos móviles con conexiones lentas, cada KB cuenta. Además, `global.css` tiene 3446 líneas como un solo archivo monolítico.

Dado que este es un proyecto Astro, la opción más limpia es mover CSS específico de componentes a sus bloques `<style>` (Astro los scopes automáticamente), dejando solo estilos globales (variables, reset, tipografía, grid, botones) en `global.css`.

## Current state

- `astro-poc/src/layouts/BaseLayout.astro:2` — `import 'bootstrap/dist/css/bootstrap.min.css';`
- `astro-poc/src/styles/global.css` — 3446 líneas, monolítico
- `astro-poc/astro.config.mjs:10` — `inlineStylesheets: 'never'`
- Componentes Astro: 13 archivos en `astro-poc/src/components/`
- No hay PostCSS, PurgeCSS, o CSS tree-shaking configurado

## Commands you will need

| Purpose    | Command                   | Expected on success |
| ---------- | ------------------------- | ------------------- |
| Build      | `npm run build`           | exit 0              |
| Dev        | `npm run dev`             | server starts       |
| Typecheck  | `npm run typecheck`       | exit 0, no errors   |
| Lint       | `npm run lint`            | exit 0              |
| Test       | `npm test`                | all pass            |
| E2E        | `npm run test:e2e`        | all pass            |
| E2E visual | `npm run test:e2e:visual` | all pass            |

## Scope

**In scope**:

- `astro-poc/src/layouts/BaseLayout.astro` — cambiar import de Bootstrap
- `astro-poc/src/styles/global.css` — solo eliminar reglas que se movieron a componentes
- Archivos `.astro` en `astro-poc/src/components/` — añadir bloques `<style>` con CSS movido desde global.css

**Out of scope** (do NOT touch):

- `astro-poc/astro.config.mjs` — `inlineStylesheets: 'never'` se mantiene
- Bootstrap JS (`@popperjs/core`, `bootstrap/js/dist/*`) — no se modifica
- Componentes de terceros que dependen de clases Bootstrap globales
- Plan 006 (SW cache TTL + CSS externo) — diferente scope

## Git workflow

- Branch: `advisor/019-reduce-bootstrap-css`
- Commit message: `perf(css): move component styles from global.css to Astro scoped blocks, audit Bootstrap usage`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Auditar uso de componentes Bootstrap

Buscar qué clases/componentes de Bootstrap se usan realmente:

```bash
grep -rn "class=" astro-poc/src/components/*.astro astro-poc/src/pages/*.astro | grep -oP 'class="[^"]*"' | sort -u > /tmp/bootstrap-classes-used.txt
```

Inspeccionar `/tmp/bootstrap-classes-used.txt` e identificar qué módulos de Bootstrap se necesitan:

- `grid` (container, row, col-*)
- `buttons` (btn, btn-*)
- `forms` (form-_, input-_)
- `navbar` (navbar, navbar-*)
- `offcanvas` (offcanvas, offcanvas-*)
- `dropdown` (dropdown, dropdown-*)
- `alert` (alert, alert-*)
- `badge` (badge)
- `card` (card, card-*)
- `close` (btn-close)
- `utilities` (d-_, text-_, mb-_, mt-_, etc.)

**NO se usan**: carousel, accordion, tooltips, popovers, modals, spinners, placeholders, toasts, progress bars, breadcrumb, pagination, list-group.

### Step 2: Reemplazar import de Bootstrap

Dado que el proyecto ya depende de `bootstrap` como paquete npm, cambiar el import en `BaseLayout.astro` de:

```astro
import 'bootstrap/dist/css/bootstrap.min.css';
```

a importar solo los partials SCSS necesarios. Esto requiere compilación SCSS, que Bootstrap soporta nativamente. Alternativa más simple: crear un archivo CSS custom que importe solo los módulos necesarios desde `bootstrap/dist/css/` si están disponibles como archivos separados.

**Opción A (recomendada)**: Usar el enfoque de `@import` con archivos CSS individuales de Bootstrap o compilar desde SCSS:

```bash
npm ls bootstrap  # verificar que bootstrap está instalado en root o astro-poc
```

Si Bootstrap está en `node_modules/bootstrap/`, los partials SCSS están en `node_modules/bootstrap/scss/`. Astro soporta SCSS nativamente. Crear `astro-poc/src/styles/bootstrap-needed.scss`:

```scss
// Solo los módulos realmente usados
@import 'bootstrap/scss/functions';
@import 'bootstrap/scss/variables';
@import 'bootstrap/scss/maps';
@import 'bootstrap/scss/mixins';
@import 'bootstrap/scss/utilities';
@import 'bootstrap/scss/root';
@import 'bootstrap/scss/reboot';
@import 'bootstrap/scss/type';
@import 'bootstrap/scss/images';
@import 'bootstrap/scss/containers';
@import 'bootstrap/scss/grid';
@import 'bootstrap/scss/buttons';
@import 'bootstrap/scss/forms';
@import 'bootstrap/scss/navbar';
@import 'bootstrap/scss/nav';
@import 'bootstrap/scss/offcanvas';
@import 'bootstrap/scss/dropdown';
@import 'bootstrap/scss/alert';
@import 'bootstrap/scss/badge';
@import 'bootstrap/scss/card';
@import 'bootstrap/scss/close';
@import 'bootstrap/scss/transitions';
@import 'bootstrap/scss/helpers';
@import 'bootstrap/scss/utilities/api';
```

Cambiar el import en `BaseLayout.astro` de:

```astro
import 'bootstrap/dist/css/bootstrap.min.css';
```

a:

```astro
import '../styles/bootstrap-needed.scss';
```

**Verify**: `npm run build` → exit 0. El CSS generado debe ser visiblemente más pequeño.

### Paso 3: Verificar build y estilos visuales

```bash
npm run build && npm run test:e2e:visual
```

**Verify**: build exit 0, E2E visual regression tests pasan (o mostrar diff aceptable).

### Step 4: (Opcional, futuro) Mover CSS de componentes a scoped styles

Este paso puede dejarse como mejora futura. Implica extraer las secciones de `global.css` que son específicas de un componente (`.navbar-custom`, `.hero-section`, `.catalog-controls`, etc.) a bloques `<style>` dentro del `.astro` correspondiente. Beneficio: CSS solo se carga cuando el componente se renderiza.

## Test plan

- `npm run test:e2e:visual` — verificar que no hay cambios visuales no intencionados.
- `npm run test:e2e` — verificar que la funcionalidad de la tienda no se rompe.
- Prueba manual en `npm run dev`: navegar home, categorías, producto detalle, estacionamiento, 404 — verificar que todos los estilos se aplican correctamente.

## Done criteria

All must hold:

- [ ] `npm run build` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run test:e2e` exits 0
- [ ] `npm run test:e2e:visual` exits 0 (sin regresiones visuales)
- [ ] El archivo CSS generado en `astro-poc/dist/` es más pequeño que antes (comparar `ls -la` del CSS bundle)
- [ ] `BaseLayout.astro` ya no importa `bootstrap/dist/css/bootstrap.min.css`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Los imports SCSS de Bootstrap fallan porque la ruta a `node_modules/bootstrap/scss/` no se resuelve correctamente desde Astro.
- `npm run test:e2e:visual` muestra regresiones visuales significativas que no pueden explicarse por cambios de layout intencionales.
- Componentes de Bootstrap que sí se usan pero no fueron incluidos en `bootstrap-needed.scss` causan estilos rotos — añadir el módulo faltante y re-ejecutar.
- La compilación SCSS añade más de 5 segundos al tiempo de build.

## Maintenance notes

- Si en el futuro se añade un nuevo componente Bootstrap (ej. tooltips para ayuda contextual), añadir su partial SCSS a `bootstrap-needed.scss`.
- La lista de módulos en `bootstrap-needed.scss` debe mantenerse como documentación viva de qué partes de Bootstrap usa el proyecto.
- Considerar migrar completamente a Tailwind o CSS Modules en una refactorización futura si Bootstrap se convierte en un lastre (fuera del scope de este plan).
