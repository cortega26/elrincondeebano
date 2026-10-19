# Plan 256: Housekeeping micro — recheck del 235 (allowlist) + docs del 239

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 7b0cf08a..HEAD -- tools/guardrails/orphan-assets.allowlist.json tools/guardrails/orphan-assets.js docs/INCIDENTS.md docs/repo/STRUCTURE.md docs/operations/DEFERRALS.md`

## Status

- **Priority**: P3
- **Effort**: XS–S
- **Risk**: LOW
- **Depends on**: 235 (landed), 239 (landed)
- **Category**: chore / docs
- **Planned at**: commit `7b0cf08a`, 2026-10-19

## Why this matters

Dos ítems quedaron con su condición de reapertura ya cumplida:
(a) el plan 235 difirió "re-checking the orphan-guard allowlist for
`variants` once the prune owns recursion (allowlist entry can stay; it
guards the guard)" — el prune recursivo ya aterrizó (235);
(b) el plan 239 dejó dos menciones de docs stale (fila abierta del
registro: "Docs micro-grooming del plan 239").

## Current state

- `tools/guardrails/orphan-assets.allowlist.json`:
  `{"ignoredDirectories": ["originals", "variants", "og/icons"], "allowedOrphans": ["assets/images/web/logo.avif"]}`.
  El deferred del 235 dice que la entrada **puede quedarse** ("guards the
  guard": evita falsos positivos del guard sobre variantes legítimas); el
  recheck debe producir un veredicto **con evidencia**, no un cambio por
  defecto.
- `docs/INCIDENTS.md` (playbook de CLS, ~líneas 41-43): la línea de
  sospechosos ya anota "(legacy `assets/css/` split retired by plan 239)",
  pero la mitigación sigue diciendo "Align critical CSS with main CSS for
  affected selectors" — stale: desde el 239 hay **una sola** hoja
  (`astro-poc/src/styles/global.css`).
- `docs/repo/STRUCTURE.md` (~línea 83): la lista de scripts operadores aún
  nombra `check-css-order.mjs` — borrado por el plan 239.
- `docs/operations/DEFERRALS.md`: fila abierta "Docs micro-grooming"
  (notas del plan 239) → se resolverá en este plan.

## Commands you will need

| Purpose      | Command                                           | Provenance | Expected on success |
| ------------ | ------------------------------------------------- | ---------- | ------------------- |
| Install      | `HUSKY=0 npm ci`                                  | declared   | exit 0              |
| Guardrails   | `npm run guardrails && npm run guardrails:assets` | declared   | exit 0              |
| Markdownlint | `npm run lint:md`                                 | declared   | 0 issues            |
| Plan archive | `node tools/check-plan-archive.mjs`               | declared   | OK                  |

## Scope

**In scope**:

- `tools/guardrails/orphan-assets.allowlist.json` (± el comentario/lógica
  del guard si el veredicto lo requiere — mínimo).
- `docs/INCIDENTS.md`, `docs/repo/STRUCTURE.md` (solo las líneas stale).
- `docs/operations/DEFERRALS.md` (resolver la fila del 239).

**Out of scope**:

- Cualquier otro consumidor de la allowlist, el prune, e2e, CSS.

## Git workflow

- Branch: `advisor/256-housekeeping-micro`
- Commits: `chore(guardrails): record the variants-allowlist recheck (plan 256)`
  y `docs: drop the stale post-239 mentions + resolve the register row (plan 256)`.
- No push, no PR.

## Steps

### Step 0: Baseline

Instala; `npm run guardrails && npm run guardrails:assets` exit 0. Rojo →
STOP (preexistente; reportar). Lee el deferred del 235 (plan archivado) y
la lógica de `ignoredDirectories` en `orphan-assets.js`.

### Step 1: Recheck de la entrada `variants` (empírico + conceptual)

1. Quita temporalmente `"variants"` de `ignoredDirectories`; corre
   `npm run guardrails:assets`.
2. Interpreta junto con el diseño del 235: la entrada protege al guard de
   falsos positivos sobre variantes; que pase hoy no garantiza que no
   vuelva a fallar mañana (variantes generadas y aún no referenciadas).
3. **Veredicto**: mantener (esperado, con razón registrada) o quitar (solo
   si el análisis muestra que ya es innecesaria). Si se quita, el cambio
   va con su verificación; si se mantiene, el commit message registra:
   recheck 2026-10-19 + resultado empírico + razón.

**Verify**: `npm run guardrails:assets` exit 0 en el estado final elegido;
veredicto explícito en el reporte.

### Step 2: Docs stale

- `INCIDENTS.md`: actualizar la mitigación al mundo post-239 (una sola
  hoja `astro-poc/src/styles/global.css`; alinear las reglas de los
  selectores afectados con esa hoja — preservar la forma del playbook).
- `STRUCTURE.md`: quitar `check-css-order.mjs` de la lista canónica de
  scripts operadores (verificar que no quede otra mención en ese archivo).

**Verify**: `grep -n "check-css-order" docs/repo/STRUCTURE.md` vacío;
`npm run lint:md` 0 issues.

### Step 3: Resolver la fila del registro

Mueve la fila "Docs micro-grooming" (notas del plan 239) a la sección
**Resolved** de `docs/operations/DEFERRALS.md`, citando el commit de fix
de esta rama + "plan 256" (misma forma de tabla; los resolved se mueven,
nunca se borran en silencio).

**Verify**: fila presente en Resolved con su cita; `npm run lint:md` 0
issues.

### Step 4: Gates finales

**Verify**: guardrails combo; `node tools/check-plan-archive.mjs` OK;
`npm run lint:md` 0 issues; `git status` limpio.

## Test plan

No aplican tests nuevos: los gates son guardrails + markdownlint +
archive-check, y el recheck es empírico (corridas del guard en ambos
estados).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Veredicto del recheck registrado (mantener/quitar + razón + fecha) en commit y reporte
- [ ] `grep -rn "check-css-order" docs/repo/STRUCTURE.md docs/INCIDENTS.md` → vacío
- [ ] Fila del 239 movida a Resolved con cita
- [ ] `npm run guardrails && npm run guardrails:assets` y `npm run lint:md` exit 0
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- Guardrails falla en el baseline (Step 0) — preexistente; reportar.
- Quitar `variants` rompe algún otro guard/test — restaurar y reportar.

## Maintenance notes

- Reviewer: confirma que el veredicto del allowlist está evidenciado (no
  es solo "pasó hoy") y que la fila movida conserva su forma y su cita.
