# Plan 285: Los tests del catálogo verifican reglas, no valores vivos — y la regla de descripciones se hace cumplir

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 6d0a29af..HEAD -- test/catalog-copy-quality.spec.js test/e2e-astro/product-detail-content.spec.ts test/helpers/product-catalog.js`
> (Cambios en `data/product_data.json` por PRs de catálogo son esperados: re-ejecuta el escaneo del Step 1 sobre el archivo vivo.)

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/284-generated-catalog-copies.md` (tras él, la comparación entre copias es tautológica y se elimina; la corrección de datos toca un solo archivo)
- **Category**: tests
- **Planned at**: commit `6d0a29af`, 2026-11-12 (Auditoría 13)

## Why this matters

Dos tests fijan **valores vivos** del catálogo: el e2e de ficha de producto
espera `'$2.500'` para el atún Van Camp's (y su categoría, su nombre y que
esté en stock), y `catalog-copy-quality.spec.js` exige el texto exacto de 5
descripciones. Un cambio de precio correcto del operador —la edición más
frecuente hoy (PR #540)— pone rojo el job `e2e-tests` sin que haya defecto,
y obliga a editar un test para publicar un precio. Mientras tanto, la regla
real que el operador quiere hacer cumplir (AGENTS.md, en `origin/main`:
"redactar solo atributos verificables… evitar relleno, usos sugeridos,
juicios de valor y adjetivos promocionales") es solo prosa y **ya se
incumple**: "Nestlé • Leche condensada" dice "Ideal para postres, frutas y
preparaciones de repostería". El test actual solo bloquea 10 frases exactas
de un incidente de octubre (PR 517 → 520).

## Current state

- `test/catalog-copy-quality.spec.js` (45 líneas):
  - líneas 6-8: lee `data/product_data.json`, `astro-poc/src/data/products.json` y `astro-poc/public/data/product_data.json`;
  - líneas 11-15, test `keeps the three catalog projections consistent` (`expect(mirror).toEqual(catalog)`);
  - líneas 17-35, test de 10 frases genéricas prohibidas (`weakCopy`) — **se conserva**;
  - líneas 37-44, test `uses concise factual copy for affected products`: `toBe('Envase desechable')`, `toBe('4 rollos de 20 m c/u • Doble hoja')`, `toBe('Bolsa de 200 g.')`, `toBe('Llavero de PVC.')`, `toContain('92 g de peso drenado')`.
- `test/e2e-astro/product-detail-content.spec.ts`:
  - test 1 (líneas 3-18): `page.goto('/p/p-00770236729335/')`, eyebrow `toHaveText('Despensa')`, summary `toContainText('92 g de peso drenado')` y `not.toContainText('Para ensaladas')`, **precio `toHaveText('$2.500')`** (línea 11), nota de checkout, título "Información del producto", imagen visible, click en agregar → `#cart-count` = `1`.
  - test 2 (20-27): heading con nombre exacto `"Van Camp's • Atún Lomitos en Agua"`, link de categoría `'/despensa/'`.
  - tests 3+ (29-55): fondos blancos de imagen para dos SKUs fijos (`p-00770236729335`, `01a131ed-153a-721e-94fc-2eb8f6b9a44c`) en 2 viewports. Si alguno pasa a `stock: false`, su página deja de existir (`getProducts()` excluye agotados) y el test cae.
- Patrón de la casa para e2e guiados por datos: `test/e2e-astro/product-og-compat.spec.ts:1-12`
  ```ts
  import { getProductSku } from '../../astro-poc/src/lib/product-identity.ts';
  import productCatalogHelpers from '../helpers/product-catalog.js';
  const { getWebpBackedProduct } = productCatalogHelpers;
  const webpBackedProduct = getWebpBackedProduct();
  const webpBackedSku = getProductSku(webpBackedProduct);
  const expectedCategorySlug = String(webpBackedProduct.category || '')
    .trim()
    .toLowerCase();
  ```
  `test/helpers/product-catalog.js` (CommonJS) exporta `loadProductCatalog`, `findWebpBackedProduct`, `getWebpBackedProduct`, … .
- Formato de precio del sitio: `$` + `toLocaleString('es-CL')` (p. ej. `$2.500`); precio efectivo = `max(price - discount, 0)`.
- Producto que incumple la regla (en `origin/main`): `id: "p-7a7d9d85683f"`,
  `description: "Tarro de 265 g. Ideal para postres, frutas y preparaciones de repostería."`,
  `rev: 3`, `field_last_modified.description = { ts, by: "git", rev: 3, base_rev: 2, changeset_id: null }`.
  Metadatos del catálogo: raíz con `version`, `last_updated`, `rev` (45 en `6d0a29af`), `schema_version`.
  Convención de las PRs de catálogo: al editar un campo se incrementan `product.rev`
  y `catalog.rev`, se actualiza `catalog.last_updated` (ISO) y
  `field_last_modified.<campo> = { ts: <ISO>, by: "git", rev: <nuevo product.rev>, base_rev: <rev anterior>, changeset_id: null }`.
- Escaneo de términos promocionales sobre las 196 descripciones de `6d0a29af`
  (regex del Step 2): **1 hit** (el de Nestlé).

## Commands you will need

| Purpose    | Command                                                                                                                   | Provenance | Expected on success |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install    | `HUSKY=0 npm ci`                                                                                                          | declared   | exit 0              |
| Unit       | `npx vitest run test/catalog-copy-quality.spec.js test/product-data.contract.test.js`                                     | declared   | verde               |
| Suite raíz | `CI_SKIP_BUILD_CONTRACT=1 npx vitest run`                                                                                 | declared   | verde               |
| Build      | `npm run build`                                                                                                           | declared   | exit 0              |
| E2E foco   | `PLAYWRIGHT_SKIP_BUILD=1 npx playwright test -c playwright.astro.config.ts test/e2e-astro/product-detail-content.spec.ts` | declared   | verde               |
| Tree check | `node tools/ci/catalog-build-tree-check.mjs`                                                                              | declared   | exit 0              |
| Typecheck  | `npm run typecheck`                                                                                                       | declared   | exit 0              |

## Scope

**In scope**:

- `test/catalog-copy-quality.spec.js`
- `test/e2e-astro/product-detail-content.spec.ts`
- `test/helpers/product-catalog.js` (una función nueva)
- `data/product_data.json` (solo el producto `p-7a7d9d85683f` y los metadatos raíz `rev`/`last_updated`)

**Out of scope**:

- Validación de descripciones en el admin o en `tools/utils/product-contract.js` (ver Deferred).
- Cualquier otra descripción del catálogo: si el escaneo encuentra más hits, STOP (decisión editorial del operador).
- Copias derivadas en `astro-poc/` (generadas tras el plan 284).
- Mover la regla en AGENTS.md: plan 288.

## Git workflow

- Branch: `advisor/285-catalog-tests-rules`.
- Commits separados: `test(catalog): assert description rules instead of pinned copy (plan 285)` y `fix(catalog): drop promotional clause from Nestlé condensed milk (plan 285)`.

## Steps

### Step 0: Baseline

Confirma el plan 284: `git ls-files astro-poc/src/data/products.json` → vacío (si no → STOP).
Install, unit, suite raíz, build, E2E foco verdes.

**Verify**: todo verde.

### Step 1: Escaneo previo

```bash
node -e '
const c=require("./data/product_data.json");
const re=/\b(ideal|perfect[oa]s?|delicios[oa]s?|exquisit[oa]s?|irresistible|incre[ií]ble|disfrut\w*|sabros[oa]s?|el mejor|la mejor|de calidad|premium)\b/i;
for(const p of c.products){ if(!p.is_archived && re.test(p.description||"")) console.log(p.id,"|",p.name,"|",p.description) }'
```

**Verify**: exactamente 1 línea, `p-7a7d9d85683f`. Si hay más → STOP y reporta la lista (el operador decide la redacción).

### Step 2: Reglas en lugar de valores (`catalog-copy-quality.spec.js`)

1. Elimina las lecturas de `mirror` y `publicData` y el test `keeps the three catalog projections consistent`
   (tras el plan 284 las copias las genera `sync-data.mjs` desde este mismo archivo; la equivalencia la cubre `test/sync-data.script.test.js`).
2. Elimina el test `uses concise factual copy for affected products` (pins de valores).
3. Conserva el test de `weakCopy` tal cual.
4. Añade `it('descriptions avoid promotional adjectives and value judgements (AGENTS.md catalog rule)')`:
   recorre productos no archivados y asserta que la descripción NO matchea la regex del Step 1;
   mensaje de fallo: `` `${product.id} ${product.name}: "${product.description}"` ``. Comentario sobre la regex:
   "Lista mínima, sin falsos positivos sobre el catálogo actual; 'para' no está prohibido (hay usos factuales: 'Apta para impresoras')."
5. Añade `it('descriptions do not just repeat the product name')`: para no archivados con descripción
   no vacía, `description.trim().toLowerCase() !== name.trim().toLowerCase()`.
   Antes de dejarlo, corre el test: si falla sobre datos actuales → elimínalo y anótalo en el informe (no edites datos por esta regla).

**Verify**: `npx vitest run test/catalog-copy-quality.spec.js` → **falla** solo en el test de adjetivos, con `p-7a7d9d85683f` (demuestra que la regla atrapa el caso real).

### Step 3: Corregir la descripción de Nestlé

En `data/product_data.json`, producto `id: "p-7a7d9d85683f"`:

- `description` → `"Tarro de 265 g."`
- `rev` → `4`
- `field_last_modified.description` → `{ "ts": "<ahora ISO>", "by": "git", "rev": 4, "base_rev": 3, "changeset_id": null }`
- raíz: `rev` → valor actual + 1; `last_updated` → `"<ahora ISO>"` (mismo instante).
  Edita con un script Node que lea/parsee/escriba (`JSON.stringify(data, null, 2) + '\n'` — verifica antes
  con `tail -c1 data/product_data.json | xxd` si el archivo termina en `\n` y respeta lo que haya) para no
  alterar el resto del formato. `git diff --stat data/product_data.json` debe mostrar ~10 líneas cambiadas, no el archivo entero.

**Verify**: unit verde; `npx vitest run test/product-data.contract.test.js` verde; `npm run build` y tree check exit 0.

### Step 4: E2E de ficha guiado por datos

1. En `test/helpers/product-catalog.js` añade y exporta
   `getInStockProductsWithDescription(count = 1)`: productos con `stock !== false`,
   `is_archived !== true`, `description` no vacía e `image_path`, en el orden del archivo;
   lanza error si hay menos de `count`.
2. En `product-detail-content.spec.ts`:
   - Calcula al inicio: `const [primary, secondary] = getInStockProductsWithDescription(2);`
     `const sku = getProductSku(primary)`; `const effective = Math.max(primary.price - (primary.discount || 0), 0)`;
     `const priceText = '$' + effective.toLocaleString('es-CL')`; `const categorySlug = String(primary.category).trim().toLowerCase()`.
   - Test 1: navega a `/p/${sku}/`; eyebrow `toHaveText(/\S/)` (no vacío); summary `toContainText(primary.description)`;
     precio `toHaveText(priceText)`; conserva nota de checkout, título "Información del producto", imagen y el click → `#cart-count` = `1`.
     Elimina `not.toContainText('Para ensaladas')` (pin editorial de un producto).
   - Test 2: heading `getByRole('heading', { name: primary.name })`; link de categoría `toHaveAttribute('href', `/${categorySlug}/`)`.
     Antes de fijarlo, verifica en el build que el href real del link coincide con ese patrón para `primary`
     (`grep -o 'product-detail__links[^>]*href="[^"]*"' astro-poc/dist/p/<sku>/index.html`); si el slug no es la key en minúsculas → usa el slug real de `data/category_registry.json` (campo `slug` de la categoría con esa `key`).
   - Tests de fondo blanco: reemplaza la lista fija por `[primary, secondary].map((p) => ({ sku: getProductSku(p), label: p.name }))`.

**Verify**: E2E foco verde. Sonda: cambia temporalmente el `price` de `primary` en `data/product_data.json` (+10), `npm run build`, E2E foco → sigue verde; revierte el cambio de datos.

### Step 5: Regresión

Suite raíz, typecheck, `PLAYWRIGHT_SKIP_BUILD=1 npm run test:e2e`.

**Verify**: verdes.

## Test plan

- Regla de adjetivos promocionales: demostrada roja con el dato real (Step 2) y verde tras la corrección (Step 3).
- E2E de ficha: resiste un cambio de precio (sonda del Step 4).
- Se eliminan 2 tests que fijaban valores (reemplazados por reglas).

## Done criteria

- [ ] `grep -n "toBe('Envase desechable')\|'\$2.500'\|p-00770236729335" test/catalog-copy-quality.spec.js test/e2e-astro/product-detail-content.spec.ts` → sin match
- [ ] Escaneo del Step 1 → 0 líneas tras el Step 3
- [ ] Sonda de precio del Step 4 en verde (informe)
- [ ] Unit, suite raíz, build, tree check, typecheck, E2E completo verdes
- [ ] `git diff --name-only main...HEAD` ⊆ In scope; fila 285 en `plans/README.md`

## STOP conditions

- El plan 284 no está fusionado.
- El escaneo del Step 1 devuelve más de un producto.
- La edición del Step 3 reescribe más de ~15 líneas de `data/product_data.json` (formato alterado).
- `getInStockProductsWithDescription(2)` no encuentra 2 productos.

## Maintenance notes

- Ampliar la regex solo con términos que den 0 falsos positivos sobre el catálogo vivo (repetir el escaneo).
- **Deferred:** misma regla como validación (warning) en el formulario del admin y en `tools/utils/product-contract.js` — hoy el canal real de edición son PRs y este test ya las cubre; se reabre si el admin vuelve a usarse para editar descripciones.
