# Plan 254: CategoriesPage → useResource/useFeedback (diferido del plan 242)

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 7b0cf08a..HEAD -- admin/content-manager/src/web/app/routes/CategoriesPage.tsx admin/content-manager/src/web/app/hooks/ admin/content-manager/src/web/app/components/statusLabels.ts admin/content-manager/test/web/categoriesPage.test.tsx`
> Si algún archivo in-scope cambió desde que se escribió este plan, compara
> los extractos de "Current state" contra el código vivo antes de
> proceder; ante una divergencia, trátalo como STOP.

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: LOW–MED
- **Depends on**: 242 (landed), 239 (landed)
- **Category**: refactor
- **Planned at**: commit `7b0cf08a`, 2026-10-19

## Why this matters

El plan 242 migró Media/History/Publication/Diagnostics a los hooks de
página pero difirió explícitamente `CategoriesPage` ("largest churn; do it
right after this plan or fold into its next feature"). Hoy es la **única**
página del admin que re-implementa a mano el boilerplate de carga/error/
feedback (21 `useState`), y los hooks ya existen y están probados.

## Current state

- `admin/content-manager/src/web/app/routes/CategoriesPage.tsx` — 942
  líneas, 21 `useState`, `new ContentManagerClient()` a nivel de módulo.
- Conductas que **deben sobrevivir intactas**:
  - Búsqueda + filtro de estado (plan 096).
  - Expandir-todo (`expandedCategories` Set).
  - Auto-slug con `foldAccents` (plan 239).
  - Diálogo de delete-con-reasignación y sus mensajes exactos.
  - Flujos de edición/alta/alta-de-subcategoría.
  - **Undo/redo** vía `./categoryUndo.ts` (`loadStack`/`saveStack`/
    `moveEntryOnSuccess`, claves `CATEGORY_UNDO_KEY`/`CATEGORY_REDO_KEY`).
- Hooks disponibles: `src/web/app/hooks/useResource.ts` (60 líneas) y
  `useFeedback.ts` (31), con los desvíos documentados del 242
  (`actionError ?? resource.error`; `reload` devuelve la promesa en
  runtime; `mounted` ref).
- Tests: `test/web/categoriesPage.test.tsx` (6 tests: search, status,
  expand-all, auto-slug, delete reassignment, delete plain).

## Commands you will need

| Purpose      | Command                                                                              | Provenance | Expected on success       |
| ------------ | ------------------------------------------------------------------------------------ | ---------- | ------------------------- |
| Install      | `HUSKY=0 npm ci`                                                                     | declared   | exit 0                    |
| Admin tests  | `npm run admin:test`                                                                 | declared   | all pass (≈115 files/877) |
| Web suite    | `npx vitest run test/web` (cwd `admin/content-manager`)                              | declared   | all pass (≈66)            |
| Typecheck    | `npm run admin:typecheck`                                                            | declared   | exit 0                    |
| Lint         | `npm run admin:lint`                                                                 | declared   | 0 errors                  |
| Web build    | `npm run admin:build` (root) o `npm run build:web` (workspace)                       | declared   | exit 0                    |
| E2E smoke    | `npx playwright test -c playwright.config.ts test/e2e/content-manager-smoke.spec.ts` | declared   | all pass                  |
| E2E operador | `npm run admin:test:e2e` (root)                                                      | declared   | all pass                  |

## Scope

**In scope**:

- `admin/content-manager/src/web/app/routes/CategoriesPage.tsx`
- `admin/content-manager/src/web/app/components/statusLabels.ts` **solo**
  si la página re-declara un mapa de estados (verificar primero; si las
  etiquetas son inline y únicas, no tocar).

**Out of scope**:

- `categoryUndo.ts`, el cliente API, schemas, otras páginas, specs e2e.
- Cambios de conducta visibles: strings, markup y orden de requests quedan
  idénticos.

## Git workflow

- Branch: `advisor/254-categories-page-hooks`
- Commit: `refactor(admin): migrate CategoriesPage to useResource/useFeedback (plan 254)`
- No push, no PR. No introducir diferidos nuevos; si la ejecución descubre
  uno, regístralo en `docs/operations/DEFERRALS.md` en el mismo commit que
  el fix (regla del registro).

## Steps

### Step 0: Baseline verde

Instala y corre `npm run admin:test` + `npx vitest run test/web`. Rojo →
STOP.

### Step 1: Mapa de estado (antes de tocar nada)

Lee la página y los hooks. Clasifica los 21 estados:

- candidatos a `useResource`: data/loading/error de la carga principal;
- `useFeedback`: slots de feedback/errores de acción;
- quedan locales: `editing`, `adding`, `addingGroup`, `addingSub`,
  `expandedCategories`, `categorySearch`, `categoryStatus`, dialog state y
  **todo** el aparato de undo/redo.

Registra el mapa en el reporte.

**Verify**: el mapa cubre 21/21 estados sin sobras.

### Step 2: Migrar

- `useResource` para la carga y sus refresh (lista de disparadores: alta,
  edición, borrado, toggle, undo/redo).
- `useFeedback` para los slots de acción sin cambiar strings.
- Preservar el timing del undo/redo (`loadStack`/`saveStack`/
  `moveEntryOnSuccess`) exactamente como está.
- Si alguna dependency array debe cambiar para compilar, **STOP**.

**Verify**: `npx vitest run test/web` verde con el archivo de tests
**sin modificar**; `npm run admin:typecheck` exit 0.

### Step 3: Recuento y suite

**Verify**: `grep -c "useState"` antes/después (registrar ambos);
`npm run admin:test` verde.

### Step 4: E2E + gates finales

**Verify**: build de web; `content-manager-smoke.spec.ts` y la suite
operadora verdes; `npm run admin:lint` exit 0.

## Test plan

La red de conducta son los tests existentes (`test/web/categoriesPage.test.tsx`

- e2e smoke/operador) — no requieren cambios. No se añaden tests nuevos:
  la migración es de forma, no de contrato.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "useState"` reducido (reportar antes/después; esperado ≤ ~15)
- [ ] `test/web` verde **con el archivo de tests intacto**; `admin:test` verde
- [ ] E2E smoke + operador verdes
- [ ] `admin:typecheck` y `admin:lint` exit 0
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- Una dependency array debe cambiar para compilar.
- El timing de undo/redo no puede preservarse exactamente.
- Un fallo de test/e2e no reproducible en HEAD (preexistente) — reportar,
  no arreglar.

## Maintenance notes

- Reviewer: confirma que la lista de refresh del resource cubre **todos**
  los caminos de mutación (alta/edición/borrado/toggle/undo/redo) y que el
  undo/redo conserva su persistencia propia (no se movió al hook).
