# Plan 275: Build canónico tree-clean — commitear los assets generados + guard de untracked

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat eb5587c7..HEAD -- assets/ tools/ci/catalog-build-tree-check.mjs test/catalog-build-tree-check.spec.js .github/workflows/ci.yml .github/workflows/product-data-guard.yml`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 239 (assets), 249 (OG printing), 235 (variants)
- **Category**: repo hygiene / CI invariant
- **Planned at**: commit `eb5587c7`, 2026-10-19

## Why this matters

Desde el plan 238, **cada** build canónico deja el árbol sucio:
`assets/images/og/categories/.og_manifest.json` modificado +
`papeleria.og_v3.jpg`, `papeleria.svg` y
`assets/images/snacks_salados/Marco Polo - Papas Caseras 170g.avif`
untracked (ninguno está en `.gitignore`). Los planes tienen que revertirlos
una y otra vez, y un clone fresco no puede usar `build:fast` (falta el
AVIF). El guard de CI existente **no los caza**: corre con
`PREFLIGHT_SKIP_OG=1` y `readTrackedChanges` solo mira **tracked**
(`git diff HEAD`), no untracked.

## Current state

- `tools/ci/catalog-build-tree-check.mjs`: `classifyBuildChanges(paths)` +
  `readTrackedChanges()` (git diff HEAD, NUL-safe); fail-closed salvo los
  11 assets de logo derivados (`DERIVED_LOGO_ASSETS`).
- `product-data-guard.yml`: build con `PREFLIGHT_SKIP_OG=1` → guard →
  falla si `dirty_tree`.
- `ci.yml` "build-and-check": build canónico (con OG) — **sin** chequeo
  de árbol.
- Artefactos del build canónico (no ignorados): el manifest modificado +
  3 untracked (papeleria jpg/svg, AVIF de Marco Polo).

## Commands you will need

| Purpose      | Command                                                                          | Provenance | Expected on success |
| ------------ | -------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install      | `HUSKY=0 npm ci`                                                                 | declared   | exit 0              |
| Build        | `npm run build`                                                                  | declared   | exit 0              |
| Estado árbol | `git status --porcelain`                                                         | declared   | vacío (meta)        |
| Guard        | `node tools/ci/catalog-build-tree-check.mjs`                                     | declared   | exit 0              |
| Guard tests  | `npx vitest run test/catalog-build-tree-check.spec.js`                           | declared   | verde               |
| Fresh clone  | `git clone --shared . /tmp/opencode/fresh-275` + `npm ci` + `npm run build:fast` | declared   | exit 0              |

## Scope

**In scope**:

- Assets generados: `.og_manifest.json` + `papeleria.og_v3.jpg` +
  `papeleria.svg` + el AVIF de Marco Polo (commitear los bytes que produce
  el build canónico).
- `tools/ci/catalog-build-tree-check.mjs` (detectar **untracked** no
  ignorados además de tracked).
- `test/catalog-build-tree-check.spec.js` (casos nuevos).
- `.github/workflows/ci.yml` (step de guard tras el build canónico en
  `build-and-check`, con fallo si hay dirt).
- `.github/workflows/product-data-guard.yml` solo si el paso del guard
  necesita el nuevo output (p.ej. `dirty_tree` ya cubre ambos).

**Out of scope**:

- Cambiar qué genera el build; regenerar variantes; tocar `data/`.

## Git workflow

- Branch: `advisor/275-build-tree-clean`
- Commits: assets (`chore(assets): commit the canonical build outputs (plan 275)`)
  → guard (`feat(ci): fail on untracked build artifacts (plan 275)`).
- No push, no PR.

## Steps

### Step 0: Reproducir

Build canónico; registra `git status --porcelain` exacto (debe listar los
4 caminos). Corre el guard actual → **pasa** (confirmando el agujero).

### Step 1: Commitear los assets

`git add` de los 4 caminos (revisa que los bytes sean los esperados: AVIF
válido, OG jpg/svg del diseño de papeleria, manifest con la entrada
coherente). Commit.

**Verify**: rebuild canónico → `git status --porcelain` **vacío**;
segundo build → sigue vacío (determinismo, no solo idempotencia).

### Step 2: Guard de untracked

Extiende el guard: `readUntrackedFiles()` =
`git ls-files --others --exclude-standard -z` (solo no ignorados);
`checkBuildTree` devuelve también `unexpectedUntracked`; el `dirty_tree`
del `GITHUB_OUTPUT` es true si cualquiera de los dos. Actualiza el spec
con: (a) untracked inesperado → fail; (b) untracked ignorado (p.ej.
`reports/`) → no aparece; (c) el caso tracked existente intacto.

**Verify**: `npx vitest run test/catalog-build-tree-check.spec.js` verde;
sonda negativa: `touch assets/__probe275.avif` → guard falla con el path;
borrar la sonda.

### Step 3: CI

En `ci.yml` (`build-and-check`), tras `npm run build`, añade el guard
(`node tools/ci/catalog-build-tree-check.mjs`) y falla si
`dirty_tree == 'true'` (espejo del patrón de `product-data-guard.yml`).

**Verify**: YAML parsea; el guard corre verde en local sobre el árbol
commiteado.

### Step 4: Clone fresco

`git clone --shared . /tmp/opencode/fresh-275` (o `git worktree` limpio) →
`npm ci` → `npm run build:fast` → **exit 0** (ya no falta el AVIF). Si
falla por OTRO artefacto preflight, repórtalo (STOP parcial) en vez de
ampliar scope sin control.

## Test plan

- Guard: spec extendido (untracked inesperado / ignorado / tracked).
- Determinismo: dos builds canónicos consecutivos → árbol vacío.
- Clone fresco → `build:fast` exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `git status --porcelain` vacío tras **dos** builds canónicos
- [ ] Guard detecta untracked no ignorados (sonda negativa probada)
- [ ] `ci.yml` corre el guard tras el build canónico
- [ ] Clone fresco + `npm ci` + `build:fast` exit 0 (o STOP reportado con el artefacto que falte)
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- Los bytes generados no parecen deterministas entre builds (p.ej. el
  manifest reordena) — reportar antes de commitear basura.
- El clone fresco falla por algo distinto del AVIF — reportar la lista.
- El guard extendido encuentra untracked legítimos del entorno (p.ej.
  `reports/**`) — ajustar el criterio a "no ignorado" y documentar.

## Maintenance notes

- Reviewer: confirma los dos builds limpios, la sonda negativa y que el
  guard de `product-data-guard.yml` sigue funcionando igual.
