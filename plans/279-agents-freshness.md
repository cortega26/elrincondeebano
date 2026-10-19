# Plan 279: Frescura final de índices — rangos de AGENTS.md

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 74325697..HEAD -- AGENTS.md`

## Status

- **Priority**: P3
- **Effort**: XS
- **Risk**: LOW (solo docs)
- **Depends on**: 276 (refresh previo), 277, 278 (planes nuevos)
- **Category**: docs / gardening
- **Planned at**: commit `74325697`, 2026-10-19

## Why this matters

El plan 276 puso `AGENTS.md` al día hasta el plan 275; después se
cerraron **276, 277 y 278**. El rango quedó stale otra vez:
"planes 001–275" y "olas post-auditoría 254–275". Es el último índice
desactualizado de la sesión (el resto se verificó hoy: links del repo 0
rotos, `plans/README` en 24/24, superficies 15 workflows, matrix al día).

## Current state

`AGENTS.md:26` (verificado):

```
planes 001–275 cerrados/archivados; Auditoría 12 (218–253) cerrada; olas
post-auditoría 254–275 — el README es la fuente de estado
```

## Commands you will need

| Purpose      | Command                                                | Provenance | Expected on success |
| ------------ | ------------------------------------------------------ | ---------- | ------------------- |
| Install      | `HUSKY=0 npm ci`                                       | declared   | exit 0              |
| Markdownlint | `npm run lint:md`                                      | declared   | 0 issues            |
| Plan archive | `node tools/check-plan-archive.mjs`                    | declared   | OK                  |
| Contrato     | `npx vitest run test/active-surfaces.contract.test.js` | declared   | 22/22               |

## Scope

**In scope**:

- `AGENTS.md` (solo la línea de rango/olas).

**Out of scope**:

- Todo lo demás (el resto de índices se verificó al día hoy).

## Git workflow

- Branch: `advisor/279-agents-freshness`
- Commit: `docs: refresh the AGENTS plan range through 278 (plan 279)`.
- No push, no PR.

## Steps

### Step 1: Fix

`AGENTS.md`: "planes 001–275" → "planes 001–278" y "olas post-auditoría
254–275" → "olas post-auditoría 254–278". Sin tocar el resto de la línea
ni el archivo.

**Verify**: `git diff` = una línea (o dos, por el wrap).

### Step 2: Gates + re-sweep

**Verify**: `npm run lint:md` 0 issues; `node tools/check-plan-archive.mjs`
OK; contrato de superficies 22/22; y re-sweep de stale:
`grep -rn "001–275\|254–275\|254–277\|23/23" AGENTS.md plans/README.md docs/ --include="*.md" | grep -v docs/audit/`
→ sin hits (las únicas menciones aceptables son históricas dentro de filas
DONE/archivos archivados).

## Test plan

- Los gates de docs + el re-sweep.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] AGENTS.md con 001–278 / 254–278
- [ ] lint:md 0 · check-plan-archive OK · contrato 22/22
- [ ] Re-sweep sin hits en docs vivos
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- El re-sweep encuentra otro contador stale fuera de lo listado — reportar
  (no ampliar sin revisión).

## Maintenance notes

- Reviewer: confirma el diff mínimo y el re-sweep limpio.
