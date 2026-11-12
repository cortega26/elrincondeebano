# Plan 292: Retirar superficie muerta — tools pre-Astro, el flag CFIMG sin efecto y huérfanos versionados

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 6d0a29af..HEAD -- tools/ .github/actions/setup-node-and-deps/action.yml .github/workflows/static.yml .github/workflows/rollback.yml .github/workflows/post-deploy-canary.yml .env.example .gitignore docs/repo/STRUCTURE.md docs/api/utils.md test/cfimg.config.test.js`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (nada de lo que se borra lo invoca un script, workflow o la app; verificado por referencias)
- **Depends on**: `plans/280-ci-security-hygiene.md` y `plans/284-generated-catalog-copies.md` (ambos tocan workflows/`.gitignore`; serializa para evitar conflictos)
- **Category**: tech-debt
- **Planned at**: commit `6d0a29af`, 2026-11-12 (Auditoría 13)

## Why this matters

Hay ~600 líneas de herramientas del build pre-Astro que ningún script,
workflow ni test invoca, pero que los agentes siguen manteniendo (el plan 255
migró todas al logger compartido el 2026-10-19). Engañan a quien lee el repo
(parece que el sitemap o el JSON-LD salen de `tools/`). El deploy de
producción activa `CFIMG_ENABLE=1` y el log anuncia "CFIMG: rewrite enabled",
pero ningún código del storefront Astro reescribe URLs: el flag no hace nada.
Y hay archivos versionados huérfanos, uno de ellos servido públicamente
(`/data/storefront-bundles.json` con `[]`), más un hueco en `.gitignore` para
la cola de sync real del admin.

## Current state

Archivos sin ninguna referencia (verificado con `git grep` excluyendo `plans/` y `docs/audit/`):

| Archivo                                   | Líneas | Nota                                                                                |
| ----------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `tools/generate-sitemap.js`               | 72     | reemplazado por `astro-poc/scripts/postbuild-sitemap.mjs`                           |
| `tools/inject-resource-hints.js`          | 118    | —                                                                                   |
| `tools/inject-structured-data.js`         | 165    | solo lo menciona un comentario en `astro-poc/src/components/StructuredData.astro:3` |
| `tools/verify-sw-assets.js`               | 65     | único lector de `tools/utils/manifest.js`                                           |
| `tools/utils/manifest.js`                 | 56     | solo `verify-sw-assets.js` lo requiere                                              |
| `tools/convert-avif-fallback.mjs`         | 72     | —                                                                                   |
| `tools/clean-redundant-raster.mjs`        | 35     | —                                                                                   |
| `tools/category_og/render_jpg.mjs`        | 29     | solo un comentario en `tools/utils/category-og.mjs:~370`                            |
| `tools/category_og/render_raster_jpg.mjs` | 34     | —                                                                                   |
| `tools/__init__.py`                       | 1      | marcador Python sobrante del plan 156                                               |

- `tools/preflight.js:182-192` — `ensureManifestExists()` escribe `build/asset-manifest.json` (su único lector era `verify-sw-assets.js`); se llama en `main()` (línea 197) y se exporta (212).
- CFIMG:
  - `tools/preflight.js:166-180` — `logCfimgMode()` (llamada en `main`, exportada); ningún test la usa.
  - `.github/actions/setup-node-and-deps/action.yml:5-8` (input `cfimg`, default `'disable'`) y 26-36 (exporta `CFIMG_ENABLE=1`/`CFIMG_DISABLE=1`).
  - `cfimg: 'enable'` en `.github/workflows/static.yml:49,90`, `rollback.yml:64`, `post-deploy-canary.yml:317`.
  - `.env.example:107-109` (comentario + `# CFIMG_ENABLE=1` / `# CFIMG_DISABLE=1`); `test/env-surface.contract.test.js` exige que toda env leída esté documentada (al quitar el código, quita también la doc).
  - `tools/utils/product-mapper.js` (177 líneas): `shouldDisableCfRewrite`/`cfimg`/`CFIMG_THUMB` (≈14-35) — solo los usa `test/cfimg.config.test.js`. **Conserva** `generateStableId` y `computeDiscountMeta` (los usa `test/shared-contracts-parity.spec.js:2`).
  - `docs/api/utils.md` documenta `cfimg` y `CFIMG_THUMB`.
- Huérfanos versionados:
  - `astro-poc/public/data/storefront-bundles.json` (`[]`, último commit `a68fa292` 2026-07-02; sin escritor ni lector — los bundles reales salen de `astro-poc/src/data/storefront-bundles.json` vía `catalog.ts:7`).
  - `data/sync_queue.json` (83 KB, cola del SyncEngine Python retirado; último commit `19a5790d`); el admin TS usa `data/sync-queue.json` + `data/.sync-queue.lock` (`admin/content-manager/src/server/repositories/syncQueueRepository.ts:56-57`), que **no** están en `.gitignore` (solo `data/sync-config.json`, línea 101).
  - `.playwright-cli/page-2026-05-01T*.yml` (3 snapshots de depuración).
- Guard anti-resurrección existente: `tools/guardrails/legacy-storefront-surface.mjs:15-25` — `LEGACY_ROOT_PATHS` (rutas que no deben volver a existir).
- `docs/repo/STRUCTURE.md:35` — fila `build/` ("Legacy asset manifest artifact").

## Commands you will need

| Purpose     | Command                                                                      | Provenance | Expected on success                     |
| ----------- | ---------------------------------------------------------------------------- | ---------- | --------------------------------------- |
| Install     | `HUSKY=0 npm ci`                                                             | declared   | exit 0                                  |
| Referencias | `git grep -n "<nombre>" -- . ':(exclude)plans/**' ':(exclude)docs/audit/**'` | executed   | sin resultados fuera del propio archivo |
| Suite raíz  | `CI_SKIP_BUILD_CONTRACT=1 npx vitest run`                                    | declared   | verde                                   |
| Guardrails  | `npm run guardrails`                                                         | declared   | exit 0                                  |
| Build       | `npm run build`                                                              | declared   | exit 0                                  |
| Lint        | `npm run lint`                                                               | declared   | exit 0                                  |
| Lint md     | `npm run lint:md`                                                            | declared   | 0                                       |

## Scope

**In scope**: los archivos de la tabla; `tools/preflight.js`; `tools/utils/product-mapper.js` (solo las funciones CFIMG);
`test/cfimg.config.test.js` (borrar); `.github/actions/setup-node-and-deps/action.yml`; las 4 líneas `cfimg: 'enable'`
en `static.yml`/`rollback.yml`/`post-deploy-canary.yml`; `.env.example`; `docs/api/utils.md`;
`astro-poc/public/data/storefront-bundles.json`; `data/sync_queue.json`; `.playwright-cli/`; `.gitignore`;
`tools/guardrails/legacy-storefront-surface.mjs`; `docs/repo/STRUCTURE.md`; los dos comentarios citados.

**Out of scope**:

- `tools/utils/output-dir.js` (lo usan `category-registry.js` y `product-contract.js`, vivos).
- `tools/utils/category-catalog.js` (lo usa `test/category-registry.contract.test.js`).
- `admin/content-manager/scripts/migrate-catalog.mjs` en el preflight (lo pinea `test/preflight-hash-gate.test.js`; ver Deferred).
- `.codex` (marcador de herramienta del dueño: no lo borres).
- `data/categories.json` (formato de compatibilidad; ver Deferred).

## Git workflow

- Branch: `advisor/292-dead-surface-cleanup`.
- Commits: `chore(tools): retire unreferenced pre-Astro build tools (plan 292)`, `chore(ci): drop the no-op CFIMG flag (plan 292)`, `chore: remove tracked orphans and ignore the admin sync queue (plan 292)`.

## Steps

### Step 0: Baseline

Install, suite raíz, guardrails, build, lint. Re-ejecuta el comando "Referencias" para cada archivo de la tabla
(usa el nombre base sin extensión y también la ruta `tools/…`).

**Verify**: verdes; cada archivo sin referencias vivas (las únicas permitidas: los dos comentarios citados).
Si aparece una referencia nueva → STOP para ese archivo (bórralo de tu lista y repórtalo; sigue con el resto).

### Step 1: Borrar los tools muertos

`git rm` de los 10 archivos de la tabla. Elimina `ensureManifestExists` de `tools/preflight.js` (función, llamada y export).
Actualiza los comentarios de `StructuredData.astro:3` y `category-og.mjs:~370` para no nombrar archivos inexistentes.
Añade las 10 rutas a `LEGACY_ROOT_PATHS` en `tools/guardrails/legacy-storefront-surface.mjs`.
En `docs/repo/STRUCTURE.md`, elimina la fila `build/` o márcala "retirado (plan 292)".

**Verify**: suite raíz, `npm run guardrails`, `npm run build` verdes. Sonda: crea temporalmente `tools/verify-sw-assets.js` vacío → `npm run guardrails` falla en `legacy-storefront-surface`; bórralo.

### Step 2: Quitar CFIMG

1. `tools/preflight.js`: borra `logCfimgMode` (función, llamada en `main`, export).
2. `product-mapper.js`: borra `shouldDisableCfRewrite`, `cfimg`, `CFIMG_THUMB` y sus exports; deja `generateStableId` y `computeDiscountMeta` intactos. `git rm test/cfimg.config.test.js`.
3. Composite action: borra el input `cfimg` y las líneas `CFIMG_MODE`/`if…fi` (deja `TZ`, `LC_ALL`, `LANG`, `SOURCE_DATE_EPOCH`). Quita las 4 líneas `cfimg: 'enable'` (y el `with:` si queda vacío).
4. `.env.example`: borra el bloque CFIMG (3 líneas). `docs/api/utils.md`: borra las secciones `cfimg`/`CFIMG_THUMB` y sus anclas.

**Verify**: `git grep -n "CFIMG\|cfimg" -- . ':(exclude)plans/**' ':(exclude)docs/audit/**' ':(exclude)CHANGELOG.md' ':(exclude)docs/adr/**'` → sin match;
`npx vitest run test/env-surface.contract.test.js test/shared-contracts-parity.spec.js` → verde; YAML de workflows parsea (usa el comando "YAML parse" del plan 280 si existe o `node -e` con `require('yaml')`).

### Step 3: Huérfanos y `.gitignore`

`git rm astro-poc/public/data/storefront-bundles.json data/sync_queue.json` y `git rm -r .playwright-cli`.
En `.gitignore`, junto a `data/sync-config.json`, añade `data/sync-queue.json` y `data/.sync-queue.lock`, y `.playwright-cli/`.
Antes de borrar `storefront-bundles.json` público, confirma: `git grep -n "data/storefront-bundles" -- astro-poc tools test` → sin match fuera de `src/data`.

**Verify**: `npm run build` → `ls astro-poc/dist/data/` ya no lista `storefront-bundles.json`; tree check (`node tools/ci/catalog-build-tree-check.mjs`) exit 0; suite raíz verde.

### Step 4: Regresión

`npm run build`, `PLAYWRIGHT_SKIP_BUILD=1 npm run test:e2e`, lint, lint:md, guardrails.

## Test plan

- Sin tests nuevos salvo la sonda del guard (Step 1). Se borra `test/cfimg.config.test.js` (probaba código muerto).
- Suites existentes sin cambios de asserts.

## Done criteria

- [ ] Los 10 archivos de la tabla no existen y están en `LEGACY_ROOT_PATHS`
- [ ] `git grep -n "ensureManifestExists\|logCfimgMode"` → sin match
- [ ] Grep de CFIMG del Step 2 → sin match
- [ ] `git ls-files data/sync_queue.json astro-poc/public/data/storefront-bundles.json .playwright-cli` → vacío; `.gitignore` incluye `data/sync-queue.json`
- [ ] Suite raíz, guardrails, build, E2E, lint, lint:md verdes
- [ ] `git diff --name-only main...HEAD` ⊆ In scope; fila 292 en `plans/README.md`

## STOP conditions

- Un archivo de la tabla tiene una referencia viva nueva (Step 0) — exclúyelo y repórtalo.
- `test/env-surface.contract.test.js` exige documentar una variable que ya no se lee y no puedes satisfacerlo quitando la doc.
- Borrar `astro-poc/public/data/storefront-bundles.json` rompe algún contrato de artefactos (`validate-artifact-contract.mjs`) — reporta.

## Maintenance notes

- `LEGACY_ROOT_PATHS` impide reintroducir estos nombres; si alguno vuelve a necesitarse, quítalo de la lista en el mismo PR con justificación.
- **Deferred:** quitar `migrate-catalog.mjs` del preflight (no-op: `BUILTIN_MIGRATIONS = []`; acopla la raíz al servidor del admin) — requiere ajustar `test/preflight-hash-gate.test.js`; se reabre cuando haya otro cambio al preflight.
- **Deferred:** retirar `data/categories.json` (formato de compatibilidad sin consumidor primario) — confianza media sobre consumidores externos; se reabre con un inventario de lectores.
