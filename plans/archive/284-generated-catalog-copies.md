# Plan 284: Las copias derivadas del catálogo se generan, no se versionan — una PR de catálogo edita un solo archivo

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 6d0a29af..HEAD -- astro-poc/scripts/sync-data.mjs astro-poc/package.json vitest.config.mts .gitignore .github/workflows/ci.yml docs/adr/0009-catalog-data-authority.md admin/content-manager/README.md test/catalog-copy-quality.spec.js`
> (Cambios en `astro-poc/src/data/products.json` / `data/product_data.json` por PRs de catálogo son esperados y no son drift.)

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (todo consumidor que lea las copias sin build debe recibir un paso previo)
- **Depends on**: `plans/280-ci-security-hygiene.md` (borra el job de auto-commit que hacía `git add` de estas copias)
- **Category**: tech-debt (y bug del admin: publicación siempre roja)
- **Planned at**: commit `6d0a29af`, 2026-11-12 (Auditoría 13). Decisión del dueño (2026-11-12): **generar las copias, no versionarlas**.

## Why this matters

Hay tres copias derivadas del catálogo versionadas en git:
`astro-poc/src/data/products.json`, `astro-poc/src/data/categories.json` y
`astro-poc/public/data/product_data.json`. Las regenera
`astro-poc/scripts/sync-data.mjs` en cada build y CI falla si difieren de lo
commiteado. Consecuencias medidas:

- Desde el 2026-09-01, 19 de 19 commits que tocaron `data/product_data.json`
  tuvieron que tocar también las copias; las PRs de catálogo del operador
  (#525, #527, #536, #540 — hechas por un agente remoto vía API de GitHub, sin
  shell) **reimplementan a mano** la sincronización en commits extra.
- Una publicación desde el Content Manager **nunca** pasa CI: su manifiesto
  (`publicationService.ts:28-35`) no incluye las copias y su validación no corre
  `data:sync`; el build de CI las reescribe y el guard de árbol falla.
- El propio ADR 0009 ("Migration prerequisites", punto 2) pedía que estas
  copias se eliminaran o quedaran como no autoritativas.

Generarlas (gitignore + paso previo en cada consumidor) hace que una PR de
catálogo edite **un archivo**, que la publicación del admin pase CI sin
cambios en el admin, y elimina toda una clase de drift.

## Current state

- `astro-poc/scripts/sync-data.mjs` — `createSyncPaths()` (líneas 21-44) define
  los destinos `targetProductsPath` (`src/data/products.json`),
  `targetCategoriesPath` (`src/data/categories.json`) y
  `targetPublicProductDataPath` (`public/data/product_data.json`), además de
  `public/assets` (espejo incremental de ~116 MB), `robots.txt`,
  `app.webmanifest`, `service-worker.js` y `pages/offline.html`. `runSync(options)`
  (338-376) copia/valida JSON y luego hace el espejo de assets. Al final:
  ```js
  const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
  if (isDirectRun) {
    runSync();
  }
  ```
  Lo testea `test/sync-data.script.test.js` (carga el módulo por URL y usa fixtures en tmp).
- Consumidores que leen las copias **sin** pasar por `npm run build`:
  1. `astro-poc/src/content.config.ts:7` — `file('src/data/products.json', …)` y
     `file('src/data/categories.json', …)` (usados por `astro check` y `astro dev`).
  2. `astro-poc/src/lib/catalog.ts:4-5` — `import rawProducts from '../data/products.json'; import rawCategories from '../data/categories.json';`
     (lo importan tests de vitest: `test/catalog-queries.spec.js`,
     `test/astro-responsive-images.spec.js`, `test/astro-catalog-image-url.spec.js`;
     y `test/cart-price-index.spec.js` si el plan 282 ya aterrizó).
  3. `test/catalog-copy-quality.spec.js:7-8` — lee `astro-poc/src/data/products.json` y `astro-poc/public/data/product_data.json` con `fs`.
  4. `astro-poc/scripts/validate-data-schemas.mjs:25,48` — avisa si faltan (corre dentro de `build`, después de `data:sync`: OK).
- Scripts de `astro-poc/package.json:9-17`:
  ```json
  "data:sync": "node scripts/sync-data.mjs",
  "dev": "astro dev",
  "typecheck": "astro check",
  "build": "npm run clean && npm run data:sync && npm run data:validate && astro build && ..."
  ```
  `package.json` raíz: `"typecheck:astro": "npm -w astro-poc run typecheck"`, `"test": "vitest run && npm run admin:test"`.
- `vitest.config.mts` (raíz, 29 líneas): sin `globalSetup`; `include: ['test/**/*.{spec,test}.{js,mjs,ts}']`.
- CI `.github/workflows/ci.yml`: job `lint-and-typecheck` corre `npm run lint` y
  `npm run typecheck` (línea ~43); job `unit-tests-root` corre `npx vitest run`
  con `CI_SKIP_BUILD_CONTRACT: '1'` (línea ~61); `build-and-check` corre
  `npm run build` y `node tools/ci/catalog-build-tree-check.mjs` (que reporta
  cambios rastreados respecto de HEAD **y** archivos no rastreados no ignorados
  — `git ls-files --others --exclude-standard`).
- `.gitignore:138` ya ignora `astro-poc/public/assets/` (precedente: el espejo
  de assets ya es generado y no versionado). `.gitignore:87`: `astro-poc/src/data/*.backup_*`.
- `astro-poc/eslint.config.mjs` no usa reglas con información de tipos (sin `parserOptions.project`): el lint no depende de los JSON.
- Docs que describen las copias como "build-synced copies" versionadas:
  `docs/adr/0009-catalog-data-authority.md` decisiones 4 y 6 (líneas 86-102) y la
  matriz de escritores (líneas ~51-68, con filas Python/Streamlit retiradas);
  `admin/content-manager/README.md:72-73`.
- Archivos de la carpeta que **siguen siendo fuente** (NO se ignoran):
  `astro-poc/src/data/storefront-experience.json` y `astro-poc/src/data/storefront-bundles.json`
  (los escribe el admin). `astro-poc/public/data/storefront-bundles.json` es un
  huérfano que borra el plan 292 — no lo toques aquí.

## Commands you will need

| Purpose     | Command                                            | Provenance       | Expected on success          |
| ----------- | -------------------------------------------------- | ---------------- | ---------------------------- |
| Install     | `HUSKY=0 npm ci`                                   | declared         | exit 0                       |
| Sync JSON   | `node astro-poc/scripts/sync-data.mjs --json-only` | declared (nuevo) | exit 0, sin espejo de assets |
| Typecheck   | `npm run typecheck`                                | declared         | exit 0                       |
| Suite raíz  | `CI_SKIP_BUILD_CONTRACT=1 npx vitest run`          | declared         | verde                        |
| Suite admin | `npm run admin:test`                               | declared         | verde                        |
| Lint        | `npm run lint`                                     | declared         | exit 0                       |
| Build       | `npm run build`                                    | declared         | exit 0                       |
| Tree check  | `node tools/ci/catalog-build-tree-check.mjs`       | declared         | exit 0 tras build            |
| E2E         | `PLAYWRIGHT_SKIP_BUILD=1 npm run test:e2e`         | declared         | verde                        |
| Lint md     | `npm run lint:md`                                  | declared         | 0                            |

## Scope

**In scope**:

- `astro-poc/scripts/sync-data.mjs` (opción `jsonOnly` + flag CLI `--json-only`)
- `astro-poc/package.json` (scripts `typecheck`, `dev`, nuevo `data:sync:json`)
- `vitest.config.mts` + `test/setup/catalog-sync.global.mjs` (crear)
- `.gitignore`; `git rm --cached` de las 3 copias
- `test/sync-data.script.test.js` (casos de `jsonOnly`)
- `docs/adr/0009-catalog-data-authority.md` (enmienda), `admin/content-manager/README.md` (2 líneas)
- `test/catalog-copy-quality.spec.js` SOLO si falla por ausencia de archivos (ver Step 4)

**Out of scope**:

- `admin/content-manager/src/**` — la publicación del admin queda correcta sin tocarla (commitea solo `data/`; el build de CI genera el resto).
- Copias de `robots.txt`, `app.webmanifest`, `service-worker.js`, `offline.html` en `astro-poc/public/` — siguen versionadas (decisión previa: rechazado por diseño).
- `product-data-guard.yml` y `catalog-build-tree-check.mjs` — siguen funcionando (los archivos ignorados son invisibles para el guard).
- Asserts de calidad de copy y pins de valores en tests: plan 285.
- Runbook de cambios de catálogo y AGENTS.md: plan 288.

## Git workflow

- Branch: `advisor/284-generated-catalog-copies`.
- Commits estilo `build(catalog): generate the Astro catalog copies instead of tracking them (plan 284)`.

## Steps

### Step 0: Baseline

Install, typecheck, suite raíz, suite admin, lint, build, tree check y E2E en el checkout limpio.

**Verify**: todo verde. Si algo falla → STOP.

### Step 1: Modo `--json-only` en `sync-data.mjs`

1. `runSync(options)` acepta `jsonOnly` (default `false`). Con `jsonOnly: true`
   ejecuta SOLO: `copyJson` de productos y categorías, las tres validaciones y
   `writeJson(targetPublicProductDataPath, …)`; omite el espejo de assets y las
   copias de robots/manifest/SW/offline. Mensaje de log:
   `Synced Astro catalog JSON (json-only): N products, M categories.`
2. Exporta una función `runJsonSync(options = {})` que llama `runSync({ ...options, jsonOnly: true })`.
3. Bloque CLI: `runSync({ jsonOnly: process.argv.includes('--json-only') })`.
4. `astro-poc/package.json`: añade `"data:sync:json": "node scripts/sync-data.mjs --json-only"`.
5. Tests en `test/sync-data.script.test.js` (usa su fixture de tmp existente):
   con `jsonOnly: true` se escriben los 3 JSON y **no** se crea `public/assets`
   ni `public/robots.txt`; sin la opción, el comportamiento actual (asserts existentes) sigue.

**Verify**: `npx vitest run test/sync-data.script.test.js` → verde;
`time node astro-poc/scripts/sync-data.mjs --json-only` → exit 0 y < 3 s.

### Step 2: Pasos previos en cada consumidor

1. `astro-poc/package.json`:
   - `"typecheck": "node scripts/sync-data.mjs --json-only && astro check"`
   - `"dev": "node scripts/sync-data.mjs && astro dev"` (dev necesita también el espejo de assets; es incremental).
2. Crea `test/setup/catalog-sync.global.mjs`:
   ```js
   // Plan 284: the Astro catalog copies are generated (gitignored). Root vitest
   // imports astro-poc/src/lib/catalog.ts, which reads them, so regenerate the
   // JSON projections once per run (no asset mirror).
   import { runJsonSync } from '../../astro-poc/scripts/sync-data.mjs';
   export default function setup() {
     runJsonSync();
   }
   ```
   y en `vitest.config.mts` añade `globalSetup: ['./test/setup/catalog-sync.global.mjs'],` dentro de `test`.
   Confirma que `test/setup/` no cae en el `include` de tests (`*.{spec,test}.*`): el nombre `.global.mjs` no coincide.
3. Busca otros consumidores que se te hayan escapado:
   `git grep -n -E "src/data/(products|categories)\.json|public/data/product_data\.json" -- . ':(exclude)plans/**' ':(exclude)docs/audit/**'`
   Cada resultado debe ser: (a) `sync-data.mjs` (escritor), (b) `content.config.ts`/`catalog.ts`
   (cubiertos por typecheck/dev/build/globalSetup), (c) un test bajo `test/` (cubierto por globalSetup),
   (d) `validate-data-schemas.mjs` (corre tras sync en build), (e) docs. Cualquier otro → STOP.
4. Busca también los importadores **indirectos** (módulos que importan
   `astro-poc/src/lib/catalog.ts`, que a su vez lee las copias) fuera de vitest y de Astro:
   `git grep -n -E "lib/(catalog|seo|product-card-helpers|structured-product)" -- test/e2e-astro 'playwright*.ts' tools astro-poc/scripts scripts .github`
   y sigue la cadena de imports de cada resultado (`seo.ts` importa de `catalog.ts`?
   compruébalo). El advisor verificó en `6d0a29af` que este grep da **0 resultados**
   (las specs e2e importan `lib/product-identity.ts` y leen `data/product_data.json`
   directamente). Cualquier resultado nuevo en el job `e2e-tests` o `lighthouse`
   de CI (que **no** corren `data:sync`: hacen checkout y descargan `dist`) → STOP,
   o añade un paso previo `npm -w astro-poc run data:sync:json` en ese job, documentándolo.

**Verify**: borra a mano las 3 copias (`rm astro-poc/src/data/products.json astro-poc/src/data/categories.json astro-poc/public/data/product_data.json`)
y ejecuta: `npm run typecheck` → exit 0; `CI_SKIP_BUILD_CONTRACT=1 npx vitest run` → verde;
las 3 copias existen de nuevo después.

### Step 3: Dejar de versionarlas

1. `.gitignore`, junto a la línea 138, añade:
   ```
   # Plan 284: generated by astro-poc/scripts/sync-data.mjs (data:sync / data:sync:json)
   astro-poc/src/data/products.json
   astro-poc/src/data/categories.json
   astro-poc/public/data/product_data.json
   ```
2. `git rm --cached astro-poc/src/data/products.json astro-poc/src/data/categories.json astro-poc/public/data/product_data.json`.

**Verify**: `git ls-files astro-poc/src/data astro-poc/public/data` → solo
`storefront-experience.json`, `storefront-bundles.json` (src) y
`storefront-bundles.json` (public); `git check-ignore astro-poc/src/data/products.json` → imprime la ruta.

### Step 4: CI y tests en clon limpio

Simula un clon fresco: `git stash -u` no aplica (ya commiteaste); en su lugar
`git clone --no-hardlinks . /tmp/plan284-clone && cd /tmp/plan284-clone && HUSKY=0 npm ci`
y luego, en ese clon: `npm run lint`, `npm run typecheck`,
`CI_SKIP_BUILD_CONTRACT=1 npx vitest run`, `npm run admin:test`, `npm run build`,
`node tools/ci/catalog-build-tree-check.mjs`. Todos deben pasar sin pasos manuales.

`test/catalog-copy-quality.spec.js` lee las copias con `fs` en el nivel del
módulo: con el `globalSetup` existen antes de que el archivo se importe. Si
aun así falla por ENOENT, cambia SOLO esas dos lecturas a perezosas dentro
de los `it` (no cambies sus asserts — el plan 285 los reescribe).

Simula también el **job `e2e-tests` de CI**, que hace un checkout limpio, descarga
`dist` y **no** hace build ni `data:sync`: en un segundo clon fresco
(`git clone --no-hardlinks . /tmp/plan284-e2e && cd /tmp/plan284-e2e && HUSKY=0 npm ci`)
copia el `astro-poc/dist` del primer clon (`cp -r /tmp/plan284-clone/astro-poc/dist astro-poc/dist`),
confirma que `astro-poc/src/data/products.json` **no** existe, y ejecuta
`npx playwright install --with-deps chromium` (si hace falta) y
`PLAYWRIGHT_SKIP_BUILD=1 npm run test:e2e`. Debe pasar sin ENOENT. Si falla por la falta de copias → STOP (o aplica el paso previo del Step 2.4).

**Verify**: los 6 comandos verdes en el clon y el e2e verde en el segundo clon. Borra `/tmp/plan284-clone` y `/tmp/plan284-e2e` al terminar.

### Step 5: Simular una PR de catálogo de un archivo

En tu rama: cambia el `price` de un producto en `data/product_data.json`
(cualquiera, +10) en un commit temporal; corre `npm run build` y
`node tools/ci/catalog-build-tree-check.mjs` → exit 0 (antes de este plan
habría fallado pidiendo commitear las copias). Revierte el commit temporal
(`git revert --no-edit HEAD` o `git reset --hard HEAD~1` si aún no lo empujaste).

**Verify**: tree check exit 0 con el cambio de un solo archivo; commit temporal revertido.

### Step 6: Enmendar el ADR 0009 y el README del admin

1. En `docs/adr/0009-catalog-data-authority.md` añade al final una sección
   `## Amendment — 2026-11 (plan 284)` que diga:
   - Decisión 4 y 6 reemplazadas: `astro-poc/src/data/products.json`,
     `astro-poc/src/data/categories.json` y `astro-poc/public/data/product_data.json`
     son **salidas generadas, no versionadas** (gitignored); su único escritor es
     `sync-data.mjs` (`data:sync` / `data:sync:json`), que corre antes de `build`,
     `typecheck`, `dev` y de la suite vitest raíz (`globalSetup`).
   - Una PR de catálogo edita solo `data/product_data.json` / `data/category_registry.json`.
   - Matriz de escritores vigente (tabla corta): `data/product_data.json` ← Content Manager TS
     y PRs de catálogo; `data/category_registry.json` ← Content Manager TS;
     `data/categories.json` ← `tools/sync-category-catalog.js` (forma de compatibilidad);
     las 3 copias Astro ← `sync-data.mjs`. Las filas Python/Streamlit/Tk quedan **retiradas** (planes 069/155).
     No reescribas el texto histórico de arriba; la enmienda manda.
2. `admin/content-manager/README.md:72-73`: reemplaza por "`astro-poc/src/data/products.json`
   y `public/data/product_data.json` son salidas generadas (gitignored) por
   `astro-poc/scripts/sync-data.mjs`; no existen en un clon fresco hasta correr build/typecheck/tests."

**Verify**: `npm run lint:md` → 0.

### Step 7: Regresión completa

En tu rama: build, E2E completo, suite raíz, suite admin, typecheck, lint.

**Verify**: todo verde.

## Test plan

- `test/sync-data.script.test.js`: modo `jsonOnly` (escribe 3 JSON, no espejo ni copias legacy).
- Demostración de clon fresco (Step 4) y de PR de un archivo (Step 5) en el informe.
- Suites existentes sin cambios de asserts.

## Done criteria

- [ ] `git ls-files astro-poc/src/data/products.json astro-poc/src/data/categories.json astro-poc/public/data/product_data.json` → vacío
- [ ] `git check-ignore` devuelve las 3 rutas
- [ ] `grep -n "globalSetup" vitest.config.mts` → 1 match
- [ ] `grep -n '"typecheck": "node scripts/sync-data.mjs --json-only && astro check"' astro-poc/package.json` → 1 match
- [ ] Clon fresco: lint, typecheck, vitest raíz, admin, build, tree check verdes (informe)
- [ ] PR simulada de un archivo → tree check exit 0 (informe)
- [ ] ADR 0009 con sección `Amendment — 2026-11 (plan 284)`; `npm run lint:md` → 0
- [ ] E2E completo verde
- [ ] `git diff --name-only main...HEAD` ⊆ In scope; fila 284 en `plans/README.md`

## STOP conditions

- El `git grep` del Step 2.3 encuentra un consumidor fuera de las categorías (a)–(e).
- `astro check` falla en clon fresco aun con el paso previo (p. ej. la caché `.astro/` exige los archivos en otro momento).
- El tree check marca como "untracked" algún archivo generado que no sea de los 3 (reporta la lista; no amplíes `.gitignore` por tu cuenta).
- Algún workflow (`images.yml`, `static.yml`, `post-deploy-canary.yml`, `rollback.yml`) hace `git add`/`git diff` de estas rutas y cambiaría de comportamiento — reporta.
- El build de producción (`static.yml`) dejaría de publicar `/data/product_data.json` (lo consumen el canary y el live-contract monitor): verifica `ls astro-poc/dist/data/product_data.json` tras `npm run build`.

## Maintenance notes

- Cualquier herramienta nueva que lea las copias Astro debe correr `data:sync:json` antes (o leer `data/` directamente). El `git grep` del Step 2.3 es la auditoría a repetir.
- Los agentes que editan catálogo vía API ya no deben tocar las copias: lo documenta el runbook del plan 288.
- Rollback: `git revert <merge>` restaura el tracking; luego `npm -w astro-poc run data:sync` y commitear las 3 copias.
- **Deferred:** retirar el workflow `product-data-guard.yml` (duplica el build+tree check de `ci.yml`) — bajo valor; se reabre si su costo de minutos importa o confunde a operadores.
