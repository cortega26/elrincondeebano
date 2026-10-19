# Plan 267: Phantoms OpenAPI — dirección inversa (doc→rutas) + guard bidireccional (fila 12)

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat ac391a32..HEAD -- admin/content-manager/src/server/openapi.ts admin/content-manager/src/web/api/__generated__/openapi.d.ts admin/content-manager/test/contract/routeDocumentCompleteness.test.ts admin/content-manager/test/contract/openapi.test.ts docs/operations/DEFERRALS.md`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 252 (guard routes→doc), 229 (guard del cliente)
- **Category**: docs / contract / dx
- **Planned at**: commit `ac391a32`, 2026-10-19
- **Coordinación**: el plan 263 está tocando `test/**` del admin —
  **verificado que NO toca** `routeDocumentCompleteness.test.ts` ni
  `openapi.test.ts` (no están en su inventario de 38 archivos). Aun así,
  no edites otros archivos de `test/`.

## Why this matters

El guard del 252 es **routes→doc** (cada ruta registrada debe estar
declarada). La dirección inversa tiene **phantoms** (declarado pero no
registrado) que nadie caza — fila 12 del registro. Además, dirección
inversa sin allowlist explícita invitaría a "arreglar" borrando
declaraciones legítimas condicionales; el guard debe whitelistear solo lo
deliberado.

## Current state (verificado hoy)

Phantoms (declarados sin registro GET):

- `GET /api/v1/nav-groups` (`openapi.ts:27,302`; solo POST/PATCH/DELETE
  registrados). El cliente solo llama POST/PATCH/DELETE
  (`src/web/api/categories.ts:87,102`).
- `GET /api/v1/publications` (`openapi.ts:545`). El cliente solo usa
  `POST` (`src/web/api/publications.ts:12-15,104`).
- `GET /api/v1/categories/{id}/subcategories` (`openapi.ts:26,249-251`).
  Sin llamadas del cliente (grep vacío fuera de `__generated__`).

Condicional legítimo (NO phantom):

- `POST /api/v1/preview/build` (`openapi.ts:599`): registrado solo con
  `PREVIEW_BUILD_ENABLED=1`; el cliente lo usa
  (`src/web/api/publications.ts:129`). → **se queda + allowlist del
  guard**.

Infra: `npm run codegen:openapi` (workspace admin) regenera
`src/web/api/__generated__/openapi.d.ts`. El guard del 252 vive en
`test/contract/routeDocumentCompleteness.test.ts` (usa `app.printRoutes`)
y el del cliente en `test/contract/openapi.test.ts`.

## Commands you will need

| Purpose     | Command                                            | Provenance | Expected on success |
| ----------- | -------------------------------------------------- | ---------- | ------------------- |
| Install     | `HUSKY=0 npm ci`                                   | declared   | exit 0              |
| Codegen     | `npm -w admin/content-manager run codegen:openapi` | declared   | types regenerados   |
| Admin tests | `npm run admin:test`                               | declared   | all pass            |
| Typecheck   | `npm run admin:typecheck`                          | declared   | exit 0              |
| Lint        | `npm run admin:lint`                               | declared   | 0 errors            |

## Scope

**In scope**:

- `admin/content-manager/src/server/openapi.ts` (quitar 3 declaraciones).
- `admin/content-manager/src/web/api/__generated__/openapi.d.ts`
  (regenerado).
- `admin/content-manager/test/contract/routeDocumentCompleteness.test.ts`
  (guard inverso + allowlist).
- `admin/content-manager/test/contract/openapi.test.ts` (solo si el
  cambio lo exige — p.ej. conteos).
- `docs/operations/DEFERRALS.md` (fila 12 → Resolved).

**Out of scope**:

- Registrar handlers nuevos; el flag-gate del preview; otros tests.

## Git workflow

- Branch: `advisor/267-openapi-phantoms`
- Commits: `chore(contract): drop the phantom GET declarations (plan 267)`
  y `test(contract): guard the reverse direction with a documented allowlist (plan 267)`.
- No push, no PR.

## Steps

### Step 0: Baseline

`npm ci`; `npm run admin:test` verde. Re-sweep con `app.printRoutes`
(inventario) para confirmar que los 3 GETs no están registrados y que
`POST /preview/build` sí aparece con el flag activo (o no aparece sin él
— documenta cómo lo tratas).

### Step 1: Quitar los phantoms

Elimina las 3 declaraciones GET de `openapi.ts` (usa las constantes
`CATEGORY_SUBS`, `NAV_GROUPS` si quedan huérfanas — límpialas solo si no
se usan en otro lado). Regenera: `npm -w admin/content-manager run codegen:openapi`.

**Verify**: `npm run admin:typecheck` exit 0 (si el cliente referenciaba
alguna de esas rutas, saltará aquí → STOP y reporta);
`git diff` del generado: solo las entradas retiradas.

### Step 2: Guard bidireccional

En `routeDocumentCompleteness.test.ts`, añade el barrido inverso: cada
`(method, path)` de `buildOpenApi()` debe estar registrado **o** estar en
una allowlist explícita y documentada. Allowlist inicial: solo
`POST /api/v1/preview/build` (flag-gated — cita el archivo y la razón en
el comentario). Deja el conteo del sweep en el aserto (p.ej.
`expect(unregistered).toEqual(ALLOWLIST)`).

**Verify**: `npx vitest run test/contract/routeDocumentCompleteness.test.ts`
verde; y una **sonda negativa**: re-añade temporalmente una declaración
dummy en un scratch (p.ej. en el objeto del doc dentro del propio test vía
spread, sin tocar `openapi.ts`) y comprueba que el barrido la reporta —
bórrala después.

### Step 3: Gates + registro

**Verify**: `npm run admin:test`; `npm run admin:lint`;
`npx vitest run test/contract/openapi.test.ts` verde. Mueve la fila
"OpenAPI \"reverse phantoms\"" a Resolved citando el commit final +
"plan 267" + el inventario (3 retiradas, 1 allowlist).

## Test plan

- Guard inverso nuevo con allowlist exacta + sonda negativa del propio
  barrido.
- Suites existentes (routes→doc, cliente↔doc) intactas.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Los 3 GETs phantom eliminados del doc; tipos regenerados; typecheck exit 0
- [ ] Guard inverso presente; allowlist = solo `POST /preview/build`; sonda negativa probada
- [ ] `admin:test` + `admin:lint` verdes
- [ ] Fila 12 movida a Resolved
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- El sweep muestra que alguno de los 3 GETs **sí** está registrado (ya
  no es phantom) — reporta antes de tocar.
- Aparecen **más** phantoms que los 3 del inventario — reporta la lista
  completa antes de retirar nada (el alcance podría crecer).
- `typecheck` del cliente rompe por una referencia inesperada a esas
  rutas — reporta el consumidor.

## Maintenance notes

- Reviewer: confirma el diff del generado (solo entradas retiradas), la
  allowlist mínima documentada y la sonda negativa en el reporte.
