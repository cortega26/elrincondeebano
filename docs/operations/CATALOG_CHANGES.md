# Cambios de catálogo vía PR

Guía para cambiar precios, descripciones, stock, productos o fotos sin el
Content Manager. El repositorio es el sistema de registro: lo que no está
versionado no existe.

## 1. Qué archivo editar

| Cambio                          | Archivo                       |
| ------------------------------- | ----------------------------- |
| Productos (precio, stock, copy) | `data/product_data.json`      |
| Categorías y taxonomía          | `data/category_registry.json` |

Nunca edites `astro-poc/src/data/products.json`, `astro-poc/src/data/categories.json`
ni `astro-poc/public/data/product_data.json`: son **salidas generadas** por
`astro-poc/scripts/sync-data.mjs` y están gitignored. Tampoco existen en un
clon fresco hasta que corras build, typecheck o los tests.

Rama: `catalog/<slug>` o `fix/<slug>`.

## 2. Cambiar un precio, descripción o stock

Edita el producto en `data/product_data.json` y actualiza la metadata:

```json
{
  "id": "p-7a7d9d85683f",
  "price": 2500,
  "rev": 4,
  "field_last_modified": {
    "price": {
      "ts": "2026-11-12T20:00:00.000Z",
      "by": "git",
      "rev": 4,
      "base_rev": 3,
      "changeset_id": null
    }
  }
}
```

Convención (el admin escribe `by: "admin"`; una PR escribe `by: "git"`):

- `product.rev += 1`;
- `product.field_last_modified.<campo> = { ts, by: "git", rev: <nuevo rev>, base_rev: <rev anterior>, changeset_id: null }`;
- raíz: `rev += 1` y `last_updated = "<mismo ISO>"`.

Hazlo con un script Node (`JSON.parse` → `JSON.stringify(data, null, 2)` +
`"\n"`) para no reescribir el archivo completo.

## 3. Reglas de descripción

Redactar solo atributos verificables que ayuden al comprador a identificar el
producto (tipo, variedad, contenido neto, presentación y características
distintivas). Usar frases breves y objetivas; evitar relleno, usos sugeridos,
juicios de valor y adjetivos promocionales. Si un dato no consta en la fuente,
omitirlo.

Lo hace cumplir `test/catalog-copy-quality.spec.js`: regex de adjetivos
promocionales, descripción que no repita el nombre y la lista de frases
genéricas retiradas.

## 4. Agregar un producto

Campos requeridos por `tools/utils/product-contract.js` y
`admin/content-manager/src/shared/schemas/product.ts`:

- `name` (1–200), `description` (≤ 1000), `price` (entero > 0), `discount`
  (entero ≥ 0 y ≤ `price`), `stock` (booleano);
- `category` (key existente en `data/category_registry.json`);
- `image_path` bajo `assets/images/` con extensión webp/jpg/png/avif/gif;
  `image_avif_path` obligatorio para imágenes raster;
- `order` (entero), `is_archived`, `rev`, `field_last_modified`;
- `id` explícito y estable (las tarjetas y el carrito lo usan como SKU).

## 5. Agregar o cambiar una foto

Camino soportado hoy: shell local con
`npm run images:avif && npm run images:gap-fill`, y commitear `assets/images/**`
junto al cambio de catálogo; o la página Medios del Content Manager.
`images.yml` solo corre en `main` para `assets/images/originals/**` y abre una
rama `bot/optimized-images-*` para que una persona abra el PR.

No crees workflows ad hoc con `contents: write` para subir una foto. La entrada
headless de operaciones de catálogo se diseña en el plan 295:
prototipo experimental en [`CATALOG_OPS`](../architecture/CATALOG_OPS.md).

## 6. Qué valida CI y cómo fusionar

- `test/product-data.contract.test.js` (contrato y `discount <= price`);
- `test/catalog-copy-quality.spec.js` (reglas de copy);
- build + `tools/ci/catalog-build-tree-check.mjs` (árbol reproducible);
- E2E de storefront y build-contract suites.

El ruleset de `main` exige el check `CI Verification Summary` (plan 281).
Fusiona solo cuando esté verde; no uses `--no-verify`.

## 7. Revertir

`git revert <sha del merge>` y abre una PR nueva. No edites las copias
generadas a mano: el siguiente build las regenera desde `data/`.
