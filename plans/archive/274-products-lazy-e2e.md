# Plan 274: E2E del formulario lazy de productos (frontera del 271)

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat cdf4e124..HEAD -- admin/content-manager/test/e2e/ admin/content-manager/playwright*.ts admin/content-manager/package.json admin/content-manager/src/web/app/routes/ProductsPage.tsx .github/workflows/admin.yml`
>
> **Revisión (2026-10-19, R1)**: el STOP de la ronda 0 fue correcto — el
> config default (`playwright.config.ts`) sirve el server **read-only**
> (mutaciones 405) y el patrón de escritura real es config dedicado +
> server temp-repo (`playwright.scope.config.ts` +
> `scripts/e2e-scope-server.mjs`). El harness de escritura entra ahora en
> scope.

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: LOW–MED (e2e con escritura sobre repo temporal)
- **Depends on**: 271 (lazy form), 240 (patrón de e2e)
- **Category**: test / e2e
- **Planned at**: commit `cdf4e124`, 2026-10-19 (R1: harness en scope)

## Why this matters

El plan 271 movió `ProductForm` (y zod) a un chunk lazy; la suite unitaria
cubre la lógica, pero **ningún e2e ejerce create-save / edit-save en el
navegador** (nota del 271). `scope.spec.ts:313` prueba que el form _abre_
(Ctrl+N) en write mode; lo que falta es el guardado real tras el lazy
load.

## Current state

- Configs: `playwright.config.ts` (default) → server **read-only** y
  `testIgnore` de las specs de escritura; `playwright.scope.config.ts` →
  `PORT=3105 node scripts/e2e-scope-server.mjs` (copia
  `test/fixtures/scope-e2e-repo` a `tmpdir()`, `REPO_ROOT=tmpRepo`,
  `ADMIN_MODE=operator`, credencial por corrida) — patrón a espejar.
- Credencial: `test/e2e/e2eCredential.ts` + `dismissCredentialPrompt`
  (ver `scope.spec.ts:7-13`).
- Chunks del 271: `ProductForm-*.js` (~8 KB) y `schemas-*.js` (lazy),
  entry 58.45 kB.
- Suites: default 30, scope 17, changes/media/import/operator verdes.

## Commands you will need

| Purpose      | Command                                                   | Provenance | Expected on success |
| ------------ | --------------------------------------------------------- | ---------- | ------------------- |
| Install      | `HUSKY=0 npm ci`                                          | declared   | exit 0              |
| Build web    | `npm run admin:build` (raíz)                              | declared   | exit 0              |
| E2E default  | `npx playwright test -c playwright.config.ts` (cwd admin) | declared   | 30 verde            |
| E2E scope    | `npx playwright test -c playwright.scope.config.ts`       | declared   | 17 verde            |
| E2E products | `npx playwright test -c playwright.products.config.ts`    | declared   | spec nueva verde    |
| Lint         | `npm run admin:lint`                                      | declared   | 0 errors            |

## Scope

**In scope**:

- `admin/content-manager/test/e2e/products-lazy-form.spec.ts` (nuevo).
- `admin/content-manager/playwright.products.config.ts` (nuevo; espejo
  del scope config, puerto propio p.ej. 3106, mismo
  `scripts/e2e-scope-server.mjs`).
- `admin/content-manager/playwright.config.ts` (añadir la spec nueva al
  `testIgnore` del default).
- `admin/content-manager/package.json` (script `test:e2e:products` si el
  patrón de scripts lo pide; espejo de `test:e2e:scope`).
- `.github/workflows/admin.yml` (entrada en la matriz E2E, espejo de la
  de scope).
- `scripts/e2e-scope-server.mjs` SOLO si el reuso exige un puerto
  parametrizable (cambio mínimo, documentado).

**Out of scope**:

- Código de producción (ProductsPage/ProductForm ya funcionan); otras
  specs; tocar el catálogo real (SIEMPRE repo temporal).

## Git workflow

- Branch: `advisor/274-products-lazy-e2e`
- Commits: harness (`test(admin): add a writable e2e config for the products flow (plan 274)`)
  → spec (`test(admin): cover the lazy product form create/edit e2e (plan 274)`).
- No push, no PR.

## Steps

### Step 0: Baseline

`npm run admin:build`; default suite 30 verde; scope suite 17 verde.
Lee `playwright.scope.config.ts`, `scripts/e2e-scope-server.mjs`,
`scope.spec.ts:1-40` y `playwright.base.ts` y **espeja** el patrón.

### Step 1: Harness de escritura

- `playwright.products.config.ts`: `defineAdminConfig` + webServer
  `PORT=3106 node scripts/e2e-scope-server.mjs` (o el puerto libre que
  elijas), mismo temp-repo/fixtures; `testDir`/`testMatch` solo la spec
  nueva.
- Si el server script no acepta puerto por env, parametrízalo
  (`PORT`/`E2E_PORT`) con cambio mínimo.
- Añade la spec al `testIgnore` del config default; script npm y entrada
  CI espejo de scope.

**Verify**: `npx playwright test -c playwright.products.config.ts` corre
(0 tests aún o placeholder) sin tocar `data/` real; default sigue 30.

### Step 2: Spec

`products-lazy-form.spec.ts` con dos flujos (bootstrap como
`scope.spec.ts`):

1. **Alta**: ir a productos → click "Nuevo producto" → el form lazy
   aparece (espera campos; el fallback `role="status"` es efímero) →
   rellena requeridos → guarda → el producto aparece → **cero errores de
   consola**.
2. **Edición**: editar un producto → form → cambia un campo → guarda →
   la fila refleja el cambio.

**Frontera lazy (best-effort)**: listener de requests — registra si el
chunk `ProductForm-*.js` se pide **después** del click, no en la carga
inicial; si el hash lo hace frágil, omítelo y documenta (la conducta es
la aserción primaria).

**Verify**: spec verde; consola limpia.

### Step 3: Gates

**Verify**: default 30, scope 17, products nueva, y `npm run admin:lint`
0 errors; `git status` limpio (sin artefactos; el repo real intacto).

## Test plan

- E2E real de alta + edición con el form lazy, sobre repo temporal.
- Las suites existentes quedan intactas (default ignora la nueva spec).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Config nueva + spec verdes; default 30 y scope 17 intactos
- [ ] Alta y edición funcionan; cero errores de consola
- [ ] `data/` real sin cambios; lint 0 errors
- [ ] Script + entrada CI espejo de scope
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- El fixture `scope-e2e-repo` no sirve para productos (p.ej. falta la
  página/fixtures) y haría falta otro fixture — reportar.
- El server de scope no es reutilizable ni parametrizable con un cambio
  mínimo — reportar.
- Errores de consola preexistentes en HEAD — reportar, no arreglar.

## Maintenance notes

- Reviewer: confirma que la suite nueva corre contra un repo temporal
  (nunca el real), que el default no se ralentiza y que los flujos
  asertan guardado real.
