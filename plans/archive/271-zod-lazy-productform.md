# Plan 271: Zod fuera del bundle inicial del admin — ProductForm lazy (decisión)

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 6e65ff83..HEAD -- admin/content-manager/src/web/app/routes/ProductsPage.tsx admin/content-manager/src/web/app/App.tsx admin/content-manager/test/web/ admin/content-manager/src/web/app/components/ProductForm.tsx docs/operations/DEFERRALS.md`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW–MED
- **Depends on**: 241 (lazy routes + análisis), 240 (CommsPage split)
- **Category**: perf / bundle
- **Planned at**: commit `6e65ff83`, 2026-10-19
- **Decisión (Sr. Engineer)**: **perseguir la remoción por LAZY-LOAD**, no
  borrando validación (regresión de UX) ni reimplementando validadores a
  mano (duplicaría los schemas compartidos y crearía drift
  cliente/servidor). La fila del registro lo anticipa: "when these runtime
  validation paths are revisited **or made lazy**".

## Why this matters

El plan 241 dejó zod fuera de las constantes pero **dentro del bundle
inicial**: `ProductsPage` (ruta **eager**, es el index) importa
`ProductForm` (eager) que hace `productSchema.safeParse` en el submit; los
schemas de comms comparten el mismo zod hoisteado al entry. El form solo
se renderiza **tras un click** (`ProductsPage.tsx:797` edición, `:801`
alta) → es el candidato perfecto para `React.lazy`: zod migra a chunks
lazy y el entry baja de peso sin tocar una línea de validación.

## Current state

- `ProductsPage.tsx:12` — `import { ProductForm } from '../components/ProductForm.tsx'` (estático).
- `ProductsPage.tsx:797/:801` — `<ProductForm .../>` condicional (editing/creating).
- `App.tsx` — precedente de lazy + Suspense con fallback accesible
  (`routePage()` / `div.route-loading role="status"` "Cargando…", plan 241).
- Evidencia 241: `grep -l ZodError dist/web/assets/*.js` matchea el entry
  `index-*.js` (+ chunk de comms).
- Tests: `test/web/productsPage.test.tsx` (y otros) importan
  `ProductsPage` (la conversión a lazy puede exigir `findBy*`/`waitFor`
  en el test — permitido, documentado; SIN cambios de conducta).

## Commands you will need

| Purpose     | Command                                 | Provenance | Expected on success |
| ----------- | --------------------------------------- | ---------- | ------------------- |
| Install     | `HUSKY=0 npm ci`                        | declared   | exit 0              |
| Web build   | `npm run admin:build` (raíz)            | declared   | exit 0              |
| Grep chunks | `grep -l ZodError dist/web/assets/*.js` | declared   | solo chunks lazy    |
| Admin tests | `npm run admin:test`                    | declared   | all pass            |
| Typecheck   | `npm run admin:typecheck`               | declared   | exit 0              |
| Lint        | `npm run admin:lint`                    | declared   | 0 errors            |
| E2E         | `npm run admin:test:e2e`                | declared   | all pass            |

## Scope

**In scope**:

- `ProductsPage.tsx` (lazy + Suspense alrededor de los dos renders).
- `test/web/**` (solo ajustes de asincronía si un test lo exige).
- `docs/operations/DEFERRALS.md` (fila zod → Resolved).

**Out of scope**:

- `ProductForm.tsx` (el componente NO cambia: mismo export named, mismo
  comportamiento), schemas, server, otros componentes eager.

## Git workflow

- Branch: `advisor/271-zod-lazy-productform`
- Commits: conversión → (tests si aplica) → registro. `(plan 271)`.
- No push, no PR.

## Steps

### Step 0: Baseline

Instala; `npm run admin:build` exit 0; registra:

- tamaños de chunks (`ls -la dist/web/assets/*.js` resumido),
- `grep -l ZodError dist/web/assets/*.js` → **entry incluido** (estado actual).

### Step 1: Conversión

- `const ProductForm = lazy(() => import('../components/ProductForm.tsx').then((m) => ({ default: m.ProductForm })));`
  (preserva el export named para los tests).
- Envuelve los DOS renders condicionales en `<Suspense fallback={...}>`
  con el fallback del 241 (`route-loading` + `role="status"` + "Cargando…").

**Verify**: `npm run admin:build` exit 0; `grep -l ZodError dist/web/assets/*.js`
→ **ya no matchea el entry** (matchea el chunk nuevo de ProductForm y el de
comms); registra el delta de bytes del entry.

### Step 2: Tests

`npm run admin:test`. Si algún test de `ProductsPage` falla por la
asincronía del lazy, ajusta SOLO timing (`findBy`/`waitFor`), no
aserciones de conducta; documenta cada ajuste.

**Verify**: admin:test verde; `npm run admin:typecheck` exit 0;
`npm run admin:lint` 0 errors.

### Step 3: E2E + registro

**Verify**: `npm run admin:test:e2e` (suite operadora; cubre la página de
productos) verde. Resuelve la fila "Full zod removal from the admin
browser bundle" citando el commit + el número (entry −X KB; zod solo en
chunks lazy) + la nota de que zod sigue siendo la validación compartida
(solo cambió de chunk).

## Test plan

- La evidencia fuerte es el grep de chunks + tamaños antes/después.
- Suites web + e2e como red de conducta.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -l ZodError dist/web/assets/*.js` **sin** el entry/vendor
- [ ] Entry más liviano (reportar antes/después)
- [ ] admin:test/typecheck/lint/e2e verdes
- [ ] Fila zod → Resolved
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- Aparece OTRO importador eager de zod distinto de ProductForm/comms
  (grep del grafo eager) — reportar antes de forzar.
- La conversión exige cambiar `ProductForm.tsx` o su conducta — STOP.
- Un test falla por algo que no sea asincronía del lazy — reportar.

## Maintenance notes

- Reviewer: confirma el grep de chunks, que `ProductForm.tsx` quedó
  byte-idéntico y que el fallback sigue el patrón del 241.
