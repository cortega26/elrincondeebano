# Plan 274: E2E del formulario lazy de productos (frontera del 271)

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat cdf4e124..HEAD -- admin/content-manager/test/e2e/ admin/content-manager/src/web/app/routes/ProductsPage.tsx admin/content-manager/src/web/app/components/ProductForm.tsx`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW–MED (e2e con escritura)
- **Depends on**: 271 (lazy form), 240 (patrón de e2e)
- **Category**: test / e2e
- **Planned at**: commit `cdf4e124`, 2026-10-19

## Why this matters

El plan 271 movió `ProductForm` (y zod) a un chunk lazy; la suite unitaria
cubre la lógica del form, pero **ningún e2e ejerce la frontera lazy en un
navegador real** (nota del 271). Un e2e de alta+edición protege: que el
`Suspense` no rompa la UX, que el chunk cargue al abrir y que el guardado
siga funcionando.

## Current state

- `ProductsPage.tsx`: `ProductForm` lazy + `Suspense` (fallback
  `route-loading` + `role="status"`), renders condicionales en la
  inspectora (`Nuevo producto` / `Editar`).
- E2E admin: `admin/content-manager/test/e2e/` — `content-manager-smoke.spec.ts`
  (15), `operator.spec.ts`, `scope.spec.ts` (matriz con repos temporales),
  helper `e2eCredential.ts`. `playwright.config.ts` con webServer que sirve
  `dist/web`; la suite operadora corre 30 tests.
- Chunks: `dist/web/assets/` incluye el chunk de ProductForm (~8 KB) y
  `schemas-*.js` (lazy).

## Commands you will need

| Purpose   | Command                                                   | Provenance | Expected on success |
| --------- | --------------------------------------------------------- | ---------- | ------------------- |
| Install   | `HUSKY=0 npm ci`                                          | declared   | exit 0              |
| Build web | `npm run admin:build` (raíz)                              | declared   | exit 0              |
| E2E admin | `npx playwright test -c playwright.config.ts` (cwd admin) | declared   | suite verde         |
| Lint      | `npm run admin:lint`                                      | declared   | 0 errors            |

## Scope

**In scope**:

- `admin/content-manager/test/e2e/products-lazy-form.spec.ts` (nuevo).

**Out of scope**:

- Código de producción (ProductsPage/ProductForm ya funcionan; este plan
  solo añade cobertura), otras specs.

## Git workflow

- Branch: `advisor/274-products-lazy-e2e`
- Commit: `test(admin): cover the lazy product form in e2e (plan 274)`.
- No push, no PR.

## Steps

### Step 0: Baseline

`npm run admin:build`; corre la suite e2e existente (`npx playwright test
-c playwright.config.ts` en el workspace) → registra el verde base.
Estudia cómo `content-manager-smoke.spec.ts` / `scope.spec.ts` manejan
credencial + repo (write mode) y **sigue ese mismo patrón**.

### Step 1: Spec nueva

`products-lazy-form.spec.ts` con dos flujos:

1. **Alta**: navega a productos → click en "Nuevo producto" → el form
   aparece (fallback `role="status"` es aceptable si es efímero; espera
   los campos) → rellena los requeridos → guarda → el producto aparece
   en la lista → **cero errores de consola**.
2. **Edición**: click en editar de un producto → form lazy → cambia un
   campo → guarda → la fila refleja el cambio.

**Verificación de la frontera lazy (best-effort, no frágil)**: con un
listener de requests, registra si el chunk del form se pide **después**
del click (no en la carga inicial de `/products`). Si el nombre hasheado
hace la aserción frágil, omítela y documenta — la conducta (form
funciona tras click) es la aserción primaria.

**Verify**: `npx playwright test -c playwright.config.ts
test/e2e/products-lazy-form.spec.ts` verde; consola limpia.

### Step 2: Gates

**Verify**: suite e2e completa del admin verde (30+ tests); `npm run
admin:lint` 0 errors; `git status` limpio (sin artefactos nuevos).

## Test plan

- E2E real de alta + edición con el form lazy; errores de consola
  vigilados.
- Sin cambios de producción → la suite unitaria queda como está (879).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Spec nueva con alta + edición verdes (2 tests)
- [ ] Cero errores de consola en los flujos
- [ ] Suite e2e admin completa verde; lint 0 errors
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- El harness e2e no permite escrituras en el patrón de smoke/scope
  (reportar cómo lo hacen las specs existentes y qué falta).
- La aserción del chunk lazy es inevitable para pasar (reportar; la
  conducta basta).

## Maintenance notes

- Reviewer: confirma que la spec sigue el patrón de las existentes
  (credencial/repo), que no crea artefactos y que cubre alta+edición.
