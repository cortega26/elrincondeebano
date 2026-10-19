# Plan 277: Retirar la entrada stale del allowlist de huérfanos

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 4dd55f80..HEAD -- tools/guardrails/orphan-assets.allowlist.json`

## Status

- **Priority**: P3
- **Effort**: XS
- **Risk**: LOW
- **Depends on**: 256 (recheck del allowlist), 275 (assets)
- **Category**: chore / guardrails
- **Planned at**: commit `4dd55f80`, 2026-10-19

## Why this matters

`npm run guardrails` (y `validate`) emiten en cada corrida:

```
warning  Orphan asset allowlist contains stale entries (can be removed):
warning  - assets/images/web/logo.avif
```

El guard mismo afirma que la entrada ya no hace falta (el asset está
referenciado). Es el último warning accionable de la gate canónica; una
entrada stale en un allowlist es deuda silenciosa que puede enmascarar
huérfanos futuros.

## Current state

- `tools/guardrails/orphan-assets.allowlist.json`:
  `{"ignoredDirectories": ["originals", "variants", "og/icons"], "allowedOrphans": ["assets/images/web/logo.avif"]}`.
- El scan actual: 0 huérfanos, 1070 referencias; `logo.avif` referenciado.
- La lógica del guard (~`orphan-assets.js`) marca `allowedOrphans` no
  vistos como stale (warn, no fail).

## Commands you will need

| Purpose    | Command                                                                                                    | Provenance | Expected on success       |
| ---------- | ---------------------------------------------------------------------------------------------------------- | ---------- | ------------------------- |
| Install    | `HUSKY=0 npm ci`                                                                                           | declared   | exit 0                    |
| Guardrails | `npm run guardrails && npm run guardrails:assets`                                                          | declared   | exit 0, sin warning stale |
| JSON       | `node -e "JSON.parse(require('fs').readFileSync('tools/guardrails/orphan-assets.allowlist.json','utf8'))"` | declared   | exit 0                    |

## Scope

**In scope**:

- `tools/guardrails/orphan-assets.allowlist.json` (quitar la entrada).

**Out of scope**:

- La lógica del guard, otros allowlists, assets.

## Git workflow

- Branch: `advisor/277-stale-allowlist`
- Commit: `chore(guardrails): drop the stale orphan-allowlist entry (plan 277)`.
- No push, no PR.

## Steps

### Step 0: Baseline

`npm run guardrails` → reproduce el warning (exit 0 igualmente).

### Step 1: Quitar la entrada

Deja `allowedOrphans: []` (mantén `ignoredDirectories` intacto; JSON
válido, mismo formato — sin reformatear el archivo más allá de la línea).

**Verify**: `npm run guardrails && npm run guardrails:assets` → exit 0 y
**cero** warnings de stale; el scan sigue con 0 huérfanos.

### Step 2: Gates

**Verify**: JSON válido; `git status` limpio; `node tools/check-plan-archive.mjs` OK.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `allowedOrphans` vacío; JSON válido
- [ ] Guardrails verdes **sin** el warning stale
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- Al quitar la entrada el guard pasa a **fallar** (logo.avif sí es
  huérfano según una corrida distinta) — restaurar y reportar con la
  salida.

## Maintenance notes

- Reviewer: confirma el warning desaparecido y que `logo.avif` sigue
  siendo un asset vivo.
