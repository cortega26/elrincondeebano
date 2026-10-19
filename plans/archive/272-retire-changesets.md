# Plan 272: Retiro del cableado inerte de changesets (decisión: no adoptar)

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 6e65ff83..HEAD -- .github/workflows/changesets.yml .changeset/ package.json package-lock.json docs/RELEASE.md docs/operations/DEFERRALS.md AGENTS.md docs/operations/DEPENDENCY_POLICY.md docs/architecture/CODEBASE_MAP.md`

## Status

- **Priority**: P3
- **Effort**: XS–S
- **Risk**: LOW
- **Depends on**: 238 (retry en changesets.yml), 145 (wiring original)
- **Category**: chore / proceso
- **Planned at**: commit `6e65ff83`, 2026-10-19
- **Decisión (Sr. Engineer)**: **NO adoptar changesets — retirar el
  cableado inerte.** Racional: no hay consumidores de versiones
  publicadas (sitio estático + admin local), el deploy es continuo en
  cada push, el flujo es direct-to-main (el bot "Version Packages"
  abriría PRs que nadie revisa), y `docs/RELEASE.md` documenta un flujo
  manual suficiente. El cableado está inerte pero **activo** (workflow en
  cada push con `contents: write` + `pull-requests: write` + devDep +
  `.changeset/`): se retira siguiendo la doctrina de superficie muerta
  del plan 239. Reapertura: si el proyecto empieza a publicar artefactos
  versionados para consumidores o aparece expectativa externa de
  changelog.

## Why this matters

La fila "Changesets adoption (A12-DX-10)" pedía un RFC wave-3. La
decisión está tomada con evidencia: el mecanismo no aporta valor hoy y su
presencia tiene coste real (permisos de escritura de un workflow que
corre en cada push, dependencia y directorio muertos, y una promesa en
RELEASE.md que nunca se activa). El repo no mantiene superficie muerta.

## Current state (verificado)

- `.github/workflows/changesets.yml`: `on: push main`, job "Version
  Packages", permisos `contents: write` + `pull-requests: write`
  (~inertes: sin changesets no hace nada, pero corren en cada push).
- `package.json`: script `"changeset": "changeset"` (:27) + devDep
  `"@changesets/cli": "^3.0.3"` (:105).
- `.changeset/config.json` + `.changeset/README.md` (plantilla estándar).
- `docs/RELEASE.md`: "…cableados pero **no adoptados**: la adopción es un
  RFC wave-3…".
- `AGENTS.md`: mención a `@changesets/cli` en 3.x (wave-3).
- Referencias externas: inventariar antes de borrar (grep).

## Commands you will need

| Purpose      | Command                                                                                                                   | Provenance | Expected on success         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------- |
| Install      | `HUSKY=0 npm ci`                                                                                                          | declared   | exit 0                      |
| Inventario   | `grep -rn "changeset" --include="*.yml" --include="*.json" --include="*.md" . \| grep -v node_modules \| grep -v ".git/"` | declared   | lista acotada               |
| Lock         | `npm install` (tras quitar el devDep)                                                                                     | declared   | churn = subárbol changesets |
| Determinismo | `rm -rf node_modules && npm ci && npm ls @changesets/cli`                                                                 | declared   | ausente                     |
| Lint         | `npm run lint`                                                                                                            | declared   | exit 0                      |
| Markdownlint | `npm run lint:md`                                                                                                         | declared   | 0 issues                    |

## Scope

**In scope**:

- Borrar `.github/workflows/changesets.yml` y `.changeset/`.
- `package.json` (quitar script + devDep) y `package-lock.json`.
- `docs/RELEASE.md` (párrafo del flujo: "retirado el 2026-10-19; decisión:
  el flujo manual queda; reabrir si se publican artefactos versionados…").
- `AGENTS.md` (mención wave-3 → actualizar).
- `docs/operations/DEFERRALS.md` (fila → Resolved con la decisión).
- `docs/architecture/CODEBASE_MAP.md` (R1: borrar la fila `changesets.yml`
  del mapa de workflows, ~:111 — hallada por el inventario).

**Out of scope**:

- Flujo de release en sí (`RELEASE.md` se mantiene, solo cambia el
  párrafo de changesets); CI de otras workflows; versionado.

## Git workflow

- Branch: `advisor/272-retire-changesets`
- Commit: `chore(process): retire the inert changesets wiring (plan 272)`.
- No push, no PR.

## Steps

### Step 0: Inventario

Grep completo de referencias (workflows, scripts, docs, código). Cualquier
referencia FUERA del inventario conocido (RELEASE.md, AGENTS.md, config,
workflow, package) → STOP y reporta.

### Step 1: Retiro

> **R1 (2026-10-19)**: el inventario encontró una referencia viva fuera
> del scope original — la fila `changesets.yml` del mapa de workflows
> (`docs/architecture/CODEBASE_MAP.md:111`). Ya está en scope: bórrala
> en este mismo paso (la tabla debe quedar consistente).

- `git rm .github/workflows/changesets.yml`; `git rm -r .changeset/`.
- `package.json`: quita el script `changeset` y el devDep `@changesets/cli`.
- `npm install` → lock actualizado; verifica que el churn es solo el
  subárbol de changesets (+ su grafo, p.ej. `@changesets/*`).

**Verify**: `npm ls @changesets/cli` → vacío/no instalado; `git diff
package-lock.json` contenido (lista de paquetes).

### Step 2: Docs

- `RELEASE.md`: reescribe el párrafo "cableados pero no adoptados" →
  decisión 2026-10-19: no adoptado y retirado (racional en 1-2 líneas +
  condición de reapertura). El resto del flujo manual intacto.
- `AGENTS.md`: actualiza la mención.
- `DEFERRALS.md`: fila "Changesets adoption" → Resolved citando el commit
  - la decisión + reapertura.

**Verify**: `npm run lint:md` 0 issues; grep de "changeset" post-retiro =
solo las menciones históricas/decididas.

### Step 3: Gates

**Verify**: `rm -rf node_modules && npm ci` exit 0 + `npm ls` reproducible;
`npm run lint` exit 0; smoke `npx vitest run test/seo.spec.js` verde;
`git status` limpio. (CI validará al push: la workflow "Changesets" ya no
existirá.)

## Test plan

- La verificación es el inventario + determinismo del lock + lint.
- Smoke de vitest para constancia.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Workflow y `.changeset/` borrados; script + devDep fuera; lock contenido
- [ ] `RELEASE.md`/`AGENTS.md` actualizados; fila → Resolved con reapertura
- [ ] `npm ci` reproducible; lint/lint:md/smoke verdes
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- Referencias a changesets fuera del inventario (código, otras workflows,
  scripts de CI) — reportar antes de borrar.
- `npm install` arrastra cambios fuera del subárbol — reportar.

## Maintenance notes

- Reviewer: confirma el grep post-retiro, el churn del lock y que
  RELEASE.md conserva el flujo manual completo.
