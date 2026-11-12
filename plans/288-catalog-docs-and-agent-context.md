# Plan 288: Runbook de cambios de catálogo, RUNBOOK sin ficción y CLAUDE.md que importa AGENTS.md

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 6d0a29af..HEAD -- docs/operations/RUNBOOK.md docs/START_HERE.md AGENTS.md CLAUDE.md docs/operations/CATALOG_CHANGES.md`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (solo docs)
- **Depends on**: `plans/284-generated-catalog-copies.md` (el runbook describe el flujo de un archivo), `plans/285-catalog-tests-rules-not-values.md` (la regla de descripciones ya se hace cumplir), `plans/281-main-branch-ruleset.md` (el runbook menciona el check requerido)
- **Category**: docs
- **Planned at**: commit `6d0a29af`, 2026-11-12 (Auditoría 13)

## Why this matters

El canal real de cambios de catálogo (5 de 5 desde el 2026-10-19) son PRs
hechas por un agente remoto vía la API de GitHub — y no está documentado en
ningún lado. Cada agente re-deriva la sincronización de copias, la convención
de metadatos (`rev`, `field_last_modified{by:"git"}`) y el manejo de imágenes;
la PR #526 llegó a crear un workflow de un solo uso con `contents: write` para
subir una foto. Además, `docs/operations/RUNBOOK.md` describe en su sección de
"staleness" un componente de error, un `initApp` y un fetch de
`/data/product_data.json` que **no existen** (durante un incidente, el
responsable perseguiría un endpoint y un botón inexistentes). Y `CLAUDE.md`
se declara espejo de `AGENTS.md` pero no lo importa: ya derivó (dice "9-stage
suite (… CSS …)"; son 8 etapas y el chequeo CSS se retiró en el plan 239) y no
contiene la regla de descripciones que el operador añadió a `AGENTS.md`.

## Current state

- **No existe** `docs/operations/CATALOG_CHANGES.md`. La única guía es
  `docs/operations/RUNBOOK.md:155-161` (flujo del admin local: "abre la app →
  realiza ediciones → guarda… commit/push") y la fila de `docs/START_HERE.md`
  "Product data or category taxonomy" → `npm run admin:dev` / `admin:validate && build && guardrails:assets`.
- Tras el plan 284: una PR de catálogo edita **solo** `data/product_data.json`
  (o `data/category_registry.json`); las copias `astro-poc/src/data/products.json`,
  `astro-poc/src/data/categories.json` y `astro-poc/public/data/product_data.json`
  son generadas y gitignored.
- Convención de metadatos que usan las PRs (verificada en `data/product_data.json`, p. ej. producto `p-7a7d9d85683f`):
  al editar el campo `X` de un producto → `product.rev += 1`;
  `product.field_last_modified.X = { "ts": "<ISO>", "by": "git", "rev": <nuevo rev>, "base_rev": <rev anterior>, "changeset_id": null }`;
  raíz `rev += 1` y `last_updated = "<ISO>"`. El admin escribe `by: "admin"` (`admin/content-manager/src/domain/products/productService.ts:175`).
- Validaciones que corren en cada PR (CI `ci.yml`): contrato de producto
  (`test/product-data.contract.test.js`: `price > 0`, `discount <= price`),
  calidad de copy (`test/catalog-copy-quality.spec.js`, tras el plan 285: sin
  adjetivos promocionales), build + guard de árbol
  (`tools/ci/catalog-build-tree-check.mjs`). Check requerido para fusionar
  (plan 281): `CI Verification Summary`.
- Imágenes: el pipeline canónico es `npm run images:avif && npm run images:gap-fill`
  (o la página Medios del admin); `images.yml` solo corre en `main` para
  `assets/images/originals/**` y (tras el plan 280) abre un PR. **No hay**
  camino soportado para agregar una foto desde una PR sin shell — el plan 295
  (spike) lo diseña.
- `docs/operations/RUNBOOK.md:67-110`, sección "Product data staleness": la
  nota del plan 206 (líneas 69-73) dice correctamente que no hay fetch en
  runtime, pero el resto contradice: líneas 83-86 (componente de error
  "Error al cargar los productos…" / "Intentar nuevamente"), paso 5 (líneas
  95-97: "first catalog batch is inlined in `#product-data`; the rest streams
  from `/data/product_data.json`"), y "Recovery steps" 1-3 (líneas 99-106:
  "The retry action in the UI calls `initApp`"; bump de `ebano-products-v*`).
  `git grep -n "initApp\|Error al cargar los productos\|product-data" astro-poc/src` → sin resultados.
- `CLAUDE.md` (50 líneas): dice "este archivo se re-sincronizó con `AGENTS.md`
  (que es la fuente canónica)"; tabla de comandos duplicada; línea 24:
  "`npm run guardrails` | 9-stage suite (manifest-compat, secrets, SW, tree, CSS, legacy surface, images, orphans…)".
  `tools/guardrails/run.mjs:9-18` define 8 etapas, sin CSS.
- `AGENTS.md` (en `origin/main`, línea 61): la regla de descripciones está
  como párrafo en negrita **encima** de la lista de "Principios" (que son
  principios de ingeniería), en un archivo que se declara "un índice, no una
  enciclopedia" (línea 64).
- Idioma de la casa para docs operativas: español neutral (sin voseo).

## Commands you will need

| Purpose              | Command                                                           | Provenance | Expected on success              |
| -------------------- | ----------------------------------------------------------------- | ---------- | -------------------------------- |
| Install              | `HUSKY=0 npm ci`                                                  | declared   | exit 0                           |
| Lint md              | `npm run lint:md`                                                 | declared   | 0 errores                        |
| Contrato superficies | `npx vitest run test/active-surfaces*.test.js test/docs*.test.js` | declared   | verde (omite los que no existan) |
| Suite raíz           | `CI_SKIP_BUILD_CONTRACT=1 npx vitest run`                         | declared   | verde                            |
| Check plans          | `node tools/check-plan-archive.mjs`                               | declared   | exit 0                           |

## Scope

**In scope**:

- `docs/operations/CATALOG_CHANGES.md` (crear)
- `docs/operations/RUNBOOK.md` (sección "Product data staleness" y un enlace en "Content Manager")
- `docs/START_HERE.md` (fila "Product data or category taxonomy")
- `AGENTS.md` (mover la regla; fila en "Mapa de documentación")
- `CLAUDE.md`

**Out of scope**:

- `admin/content-manager/README.md` y ADR 0009 (los actualizó el plan 284).
- Cualquier código o workflow.
- `docs/audit/**` (histórico).

## Git workflow

- Branch: `advisor/288-catalog-docs`.
- Commit: `docs: catalog change runbook, truthful staleness section, CLAUDE imports AGENTS (plan 288)`.

## Steps

### Step 0: Baseline

Confirma 284 y 285: `git ls-files astro-poc/src/data/products.json` → vacío;
`grep -n "promotional" test/catalog-copy-quality.spec.js` → match. Si no → STOP.
`npm run lint:md` → 0.

### Step 1: `docs/operations/CATALOG_CHANGES.md`

Crea el runbook (español neutral, ≤ 120 líneas) con estas secciones:

1. **Qué archivo editar** — `data/product_data.json` (productos) o `data/category_registry.json` (categorías). Nunca las copias de `astro-poc/` (generadas; no existen en git).
2. **Cambiar un precio / descripción / stock** — pasos para una PR (rama `catalog/<slug>` o `fix/<slug>`), con la convención de metadatos exacta de "Current state" (copiala con un ejemplo JSON de un `field_last_modified`).
3. **Reglas de descripción** — mueve aquí el texto íntegro de la regla de `AGENTS.md:61` y di qué la hace cumplir (`test/catalog-copy-quality.spec.js`).
4. **Agregar un producto** — campos requeridos (lee `tools/utils/product-contract.js` y `admin/content-manager/src/shared/schemas/product.ts` para listarlos; no inventes campos), `id` explícito, `order`.
5. **Agregar o cambiar una foto** — hoy requiere shell local (`npm run images:avif && npm run images:gap-fill`, commitear `assets/images/**`) o la página Medios del admin; prohibido crear workflows ad hoc con permisos de escritura; referencia al plan 295.
6. **Qué valida CI y cómo fusionar** — checks listados en "Current state"; fusionar solo con `CI Verification Summary` verde.
7. **Revertir** — `git revert <sha del merge>` y nueva PR.

**Verify**: `npm run lint:md` → 0.

### Step 2: RUNBOOK veraz

En "Product data staleness": elimina las líneas del componente de error (83-86),
el paso 5 (95-97) y los "Recovery steps" 1-3 (99-106). Reemplázalos por:
"**Recovery**: 1) verificar que el SHA desplegado (`static.yml`) incluye el commit de datos; 2) si no, re-ejecutar `static.yml` (workflow_dispatch) o fusionar el pendiente; 3) solo si el HTML servido está cacheado por el service worker, bumpear `CACHE_CONFIG.version` en `service-worker.js` (raíz) y redeployar."
En "Content Manager (modo offline)" añade una línea: "Para cambios vía PR sin admin, ver [`CATALOG_CHANGES`](CATALOG_CHANGES.md)."

**Verify**: `grep -n "initApp\|Intentar nuevamente\|#product-data" docs/operations/RUNBOOK.md` → sin match; lint:md 0.

### Step 3: START_HERE y AGENTS

- `docs/START_HERE.md`, fila "Product data or category taxonomy": "Start in…" → `data/` (PR de un archivo: ver `docs/operations/CATALOG_CHANGES.md`) o `admin/content-manager/`; "Read next…" añade `docs/operations/CATALOG_CHANGES.md`. Mantén el ancho de tabla que Prettier/markdownlint acepten.
- `AGENTS.md`: elimina el párrafo de la regla de descripciones de "Principios" y añade en "Mapa de documentación" la fila `| Cambios de catálogo (precios, descripciones, fotos) | [`CATALOG_CHANGES`](docs/operations/CATALOG_CHANGES.md) |`. Actualiza "Última actualización" a la fecha de ejecución.

**Verify**: `grep -n "Descripciones del catálogo" AGENTS.md` → sin match; `grep -n "CATALOG_CHANGES" AGENTS.md docs/START_HERE.md` → match en ambos; lint:md 0.

### Step 4: CLAUDE.md importa AGENTS.md

Reescribe `CLAUDE.md` a ≤ 20 líneas:

```markdown
# CLAUDE.md

Guía para Claude Code en este repo. **`AGENTS.md` es la fuente canónica** y se importa aquí:

@AGENTS.md

## Notas específicas de Claude Code

- Idioma: español neutral en respuestas, docs y comentarios.
- Para cambios de catálogo vía PR, sigue `docs/operations/CATALOG_CHANGES.md`.
```

Antes de borrar la tabla de comandos de `CLAUDE.md`, compárala con la de `AGENTS.md`:
si `CLAUDE.md` tiene una fila verdadera que `AGENTS.md` no tiene (verifica el script en `package.json`),
muévela a `AGENTS.md` (sin la afirmación "9-stage"/"CSS"). No copies afirmaciones que no verifiques.

**Verify**: `grep -n "^@AGENTS.md" CLAUDE.md` → 1 match; `grep -n "9-stage" CLAUDE.md AGENTS.md` → sin match; lint:md 0.

### Step 5: Contratos de docs

Corre los tests de contratos de docs/superficies que existan
(`ls test | grep -i -E "surface|docs|agents"` y ejecútalos) y la suite raíz.

**Verify**: verdes.

## Test plan

- Sin código: verificación por `lint:md`, greps de los Done criteria y tests de contrato de docs existentes.

## Done criteria

- [ ] `docs/operations/CATALOG_CHANGES.md` existe con las 7 secciones
- [ ] `grep -rn "initApp\|Intentar nuevamente" docs/operations/RUNBOOK.md` → sin match
- [ ] `grep -n "^@AGENTS.md" CLAUDE.md` → 1; `grep -n "9-stage" CLAUDE.md` → 0
- [ ] La regla de descripciones vive en `CATALOG_CHANGES.md`, no en `AGENTS.md`
- [ ] `npm run lint:md` → 0; suite raíz verde; `node tools/check-plan-archive.mjs` exit 0
- [ ] `git diff --name-only main...HEAD` ⊆ In scope; fila 288 en `plans/README.md`

## STOP conditions

- 284 o 285 no fusionados.
- Un test de contrato de docs exige que `CLAUDE.md` contenga la tabla de comandos (reporta; no lo desactives).
- No puedes determinar los campos requeridos de un producto desde los dos archivos citados.

## Maintenance notes

- Cuando el plan 295 entregue un camino soportado para fotos, actualizar la sección 5 del runbook.
- `CLAUDE.md` ya no debe duplicar contenido: cualquier regla nueva va a `AGENTS.md` o a `docs/`.
