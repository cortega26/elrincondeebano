# Plan 276: Doc-gardening post-ciclo — AGENTS, ACTIVE_SURFACES y matriz de validación

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat e67e8488..HEAD -- AGENTS.md docs/repo/ACTIVE_SURFACES.json docs/operations/VALIDATION_MATRIX.md docs/README.md docs/architecture/CODEBASE_MAP.md`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (solo docs)
- **Depends on**: 272 (changesets retirado), 258/274 (gates nuevos)
- **Category**: docs / gardening
- **Planned at**: commit `e67e8488`, 2026-10-19

## Why this matters

Han pasado **22 planes** desde la última edición de `AGENTS.md` (2026-10-18)
y el índice de superficies (`docs/repo/ACTIVE_SURFACES.json`, jul-15) ya
no refleja el árbol: le faltan workflows activos (quality-gates, admin,
product-data-guard, post-deploy-canary, images, dependabot) y no
referencia el registro de diferidos. Un índice desactualizado es peor que ninguno — el
principio del repo es "este archivo es un índice".

## Current state (verificado)

- `AGENTS.md:5` — "Última actualización: 2026-10-18" (stale).
- `AGENTS.md:26` — "planes 001–214 cerrados/archivados; auditoría 12
  (218+) en curso" → **falso**: auditoría 12 (218–253) cerrada y olas
  post-auditoría 254–275 completadas.
- `docs/repo/ACTIVE_SURFACES.json`:
  - `workflows`: `ci`, `static`, `security-audit`, `live-contract-monitor`
    — **faltan** quality-gates, admin, product-data-guard, post-deploy-canary,
    dependabot-auto-merge e images (verifica el set real con
    `ls .github/workflows/*.yml`; `changesets.yml` ya no existe, plan 272).
  - No referencia el registro de diferidos (surface nueva del 250).
- Referencias a superficies retiradas: solo **anotadas** (INCIDENTS:41 y
  CODEBASE_MAP:13 dicen "retired by plan 239"; RELEASE.md:14 documenta la
  decisión del 272) — correctas, no tocar.
- Gates nuevos ya en main que la matriz no menciona: `typecheck` incluye
  `typecheck:e2e` (258), admin e2e `test:e2e:products` (274).

## Commands you will need

| Purpose      | Command                                                                                                                        | Provenance | Expected on success |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------- |
| Install      | `HUSKY=0 npm ci`                                                                                                               | declared   | exit 0              |
| JSON válido  | `node -e "JSON.parse(require('fs').readFileSync('docs/repo/ACTIVE_SURFACES.json','utf8'))"`                                    | declared   | exit 0              |
| Markdownlint | `npm run lint:md`                                                                                                              | declared   | 0 issues            |
| Plan archive | `node tools/check-plan-archive.mjs`                                                                                            | declared   | OK                  |
| Sweep        | `grep -rn "check-css-order\|critical-css\|@changesets\|\.changeset/" AGENTS.md docs/` (excluyendo `docs/audit/` y `DEFERRALS`) | declared   | solo anotaciones    |

## Scope

**In scope**:

- `AGENTS.md` (fecha, rango de planes/estado de auditoría, y cualquier
  línea factualmente falsa que encuentres).
- `docs/repo/ACTIVE_SURFACES.json` (workflows reales + `deferrals`).
- `docs/operations/VALIDATION_MATRIX.md` (gates nuevos ya en main).
- `docs/architecture/CODEBASE_MAP.md` **solo** si el sweep encuentra una
  fila factualmente incorrecta.
- `docs/README.md` solo si el índice omite algo ya existente.

**Out of scope**:

- Historia (`docs/audit/`, `plans/archive/`), prosa de decisiones
  (RELEASE/INCIDENTS), código, workflows.

## Git workflow

- Branch: `advisor/276-doc-gardening`
- Commit: `docs: refresh the post-cycle indexes (plan 276)`.
- No push, no PR.

## Steps

### Step 0: Inventario

1. Set real de workflows: `ls .github/workflows/*.yml`.
2. Verifica cada superficie de `ACTIVE_SURFACES.json` (los paths existen)
   y enumera las que faltan (workflows activos + `DEFERRALS`).
3. Sweep de referencias a superficies retiradas (comando de la tabla) —
   clasifica: anotación histórica (ok) vs stale real (arreglar).
4. Lee `AGENTS.md` completo y marca líneas falsas (rangos, comandos,
   agentes, mapa de docs).

### Step 1: AGENTS.md

- Fecha → 2026-10-19.
- Línea de planes/auditoría → "planes 001–275 cerrados/archivados;
  Auditoría 12 (218–253) **cerrada**; olas post-auditoría 254–275;
  índice en `plans/README.md`".
- Cualquier otra línea falsa detectada (sin reescribir el archivo).

**Verify**: diff mínimo (solo las líneas stale).

### Step 2: ACTIVE_SURFACES.json

- `workflows` → set real de `.github/workflows/*.yml` (todos los activos).
- Añade `"deferrals": "docs/operations/DEFERRALS.md"` al bloque `docs`.
- Mantén el esquema; JSON válido.

**Verify**: `node -e` JSON OK; cada path del JSON existe.

### Step 3: VALIDATION_MATRIX (+ mapa si aplica)

- Menciona que `npm run typecheck` incluye la pata e2e (258) y que el
  admin tiene `test:e2e:products` (274) — en la sección que corresponda.
- Si el sweep marcó una fila falsa en `CODEBASE_MAP.md`, corrígela
  (mínimo).

**Verify**: `npm run lint:md` 0 issues; `node tools/check-plan-archive.mjs`
OK; sweep final = solo anotaciones.

## Test plan

- JSON válido + paths existentes (script de verificación).
- Markdownlint + check-plan-archive.
- Sweep de superficies retiradas.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] AGENTS.md sin líneas falsas (fecha + rango/estado de auditoría)
- [ ] ACTIVE_SURFACES.json = set real de workflows + `deferrals`; JSON válido
- [ ] VALIDATION_MATRIX menciona los gates nuevos (258/274)
- [ ] Sweep final: solo anotaciones históricas
- [ ] lint:md + check-plan-archive verdes
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- El sweep encuentra una referencia stale que requiere cambiar CÓDIGO o
  historia — reportar, no tocar.
- El esquema de ACTIVE_SURFACES tiene consumidores (grep) que se romperían
  al añadir `deferrals` — reportar.

## Maintenance notes

- Reviewer: confirma que el diff es factual (no prosa nueva) y que el set
  de workflows coincide con `ls`.
