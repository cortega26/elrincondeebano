# Plan 286: Marcado de build correcto — una sola imagen prioritaria por página y JSON-LD de producto fiel al precio visible

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 6d0a29af..HEAD -- astro-poc/src/components/ProductCardStrip.astro astro-poc/src/components/CategoryStrip.astro astro-poc/src/components/ProductDetail.astro astro-poc/src/pages/index.astro "astro-poc/src/pages/p/[sku].astro" astro-poc/src/components/CategoryCatalogPage.astro astro-poc/src/components/StructuredData.astro astro-poc/src/lib/catalog.ts test/build-contract.guard.test.js .github/workflows/ci.yml`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (si el plan 282 ya tocó `catalog.ts`, conviven: funciones distintas)
- **Category**: perf + bug (SEO)
- **Planned at**: commit `6d0a29af`, 2026-11-12 (Auditoría 13). **Reabre** el plan 119 (su criterio `grep -c` sobre HTML minificado en una línea siempre daba 1).

## Why this matters

1. **LCP**: la home emite **19** imágenes `fetchpriority="high"` + `loading="eager"`
   (las 3 primeras de cada cintillo de categoría, casi todas bajo el pliegue)
   que compiten por ancho de banda con la imagen LCP real (la primera tarjeta
   de "Para resolver rápido"). En las fichas de producto pasa al revés: la
   imagen principal NO tiene `fetchpriority="high"` y las 3 primeras del
   cintillo "relacionados" sí. El plan 119 se cerró con
   `grep -c 'fetchpriority="high"' dist/index.html` ≤ 1, pero el HTML de
   build es una sola línea: `grep -c` cuenta líneas y siempre dio 1.
2. **JSON-LD de producto**: el `Offer.price` usa el precio de lista aunque la
   página muestre el precio con descuento (11 productos en oferta → "price
   mismatch" de Merchant/Search Console); `image` es una ruta relativa del
   repo sin codificar (`assets/images/limpieza_y_aseo/Nova Clásiva 3x12m.webp`
   → 404 resuelta contra `/p/<sku>/`); y la miga de pan usa la key interna de
   categoría (`"Limpiezayaseo"`) en vez de la etiqueta visible.

## Current state

- `astro-poc/src/components/ProductCardStrip.astro:9-16`:
  ```astro
  export interface Props {
    item: ProductWithSku;
    index?: number;
  }
  ...
  const { item, index = 0 } = Astro.props;
  const isLikelyLcp = index < 3;
  ```
  y en el `<img>` (líneas ~53-54): `loading={isLikelyLcp ? 'eager' : 'lazy'}` /
  `fetchpriority={isLikelyLcp ? 'high' : 'auto'}`.
- `astro-poc/src/components/CategoryStrip.astro:77-79` pasa `index` (reinicia en 0 por cintillo):
  `items.map((item, index) => (<div role="listitem"><ProductCardStrip item={item} index={index} /></div>))`.
  Usado en `astro-poc/src/pages/index.astro:162` (un cintillo por categoría) y en `astro-poc/src/pages/p/[sku].astro` (relacionados).
- `astro-poc/src/components/ProductCard.astro:16,58-59` — la grilla "Para resolver rápido" de la home marca `index === 0` como LCP (correcto, no cambiar).
- `astro-poc/src/components/ProductDetail.astro:63-73` — `<img … class="img-fluid rounded-start product-detail-image" width="640" height="640" loading="eager" decoding="async" />` (sin `fetchpriority`).
- Conteos actuales en `astro-poc/dist` (build local): `index.html` 19, `despensa/index.html` 1, `buscar/index.html` 1, `combos/index.html` 0, una ficha `p/<sku>/index.html` 3.
- JSON-LD:
  - `astro-poc/src/pages/p/[sku].astro:44-62`:
    ```astro
    structuredProducts={[
      {
        sku: item.sku,
        name: item.product.name,
        description: item.product.description,
        image: item.product.image_path,
        price: item.product.price,
        stock: Boolean(item.product.stock),
        brand: typeof item.product.brand === 'string' ? item.product.brand : undefined,
        category: item.product.category,
      },
    ]}
    breadcrumbs={[
      { name: 'Inicio', url: '/' },
      { name: item.product.category, url: getModernCategoryPath(item.product.category) },
      { name: item.product.name, url: canonicalPath },
    ]}
    ```
    y en la línea 36: `ogImage: getProductOgImageUrl(item.product.image_path, item.product.category)` (recibe la key; `getProductOgImageUrl` en `lib/seo.ts:275-285` espera slug — funciona hoy solo porque slug == key en minúsculas).
  - `astro-poc/src/components/CategoryCatalogPage.astro:44-53` — mismo mapeo (`image: item.product.image_path`, `price: item.product.price`).
  - `astro-poc/src/components/StructuredData.astro:116-135` — `buildProduct` emite `image: product.image || SITE_IMAGE` y `offers.price: product.price ?? 0` tal cual.
- Helpers existentes: `resolveImageUrl(imagePath)` (`lib/catalog.ts:181`, devuelve ruta pública codificada o placeholder), `absoluteUrl(path)` (`lib/seo.ts:69`, antepone `https://www.elrincondeebano.com`), `getCategoryLabel(key)` (`catalog.ts:580`), `getCategorySlug(key)` (`catalog.ts:595`).
- Tests de build-contract: corren contra `astro-poc/dist`, con opt-in `CI_SKIP_BUILD_CONTRACT`; patrón exacto en `test/ssr-product-links.build-contract.test.js` (node:assert, `fs.existsSync(distRoot)`, `t.skip` guardado, `assert.fail` si falta dist, helpers `test/helpers/repo-files.js` y `test/helpers/product-catalog.js`). Cada archivo de este tipo debe figurar en **dos** listas: `CONTRACT_FILES` de `test/build-contract.guard.test.js:11-19` y el `npx vitest run …` del job `build-contract-tests` en `.github/workflows/ci.yml:~276-283`.

## Commands you will need

| Purpose        | Command                                                                                       | Provenance | Expected on success       |
| -------------- | --------------------------------------------------------------------------------------------- | ---------- | ------------------------- |
| Install        | `HUSKY=0 npm ci`                                                                              | declared   | exit 0                    |
| Build          | `npm run build`                                                                               | declared   | exit 0                    |
| Contar high    | `grep -o 'fetchpriority="high"' astro-poc/dist/index.html \| wc -l`                           | executed   | `19` hoy                  |
| Contract nuevo | `npx vitest run test/product-markup.build-contract.test.js test/build-contract.guard.test.js` | declared   | verde (tras build)        |
| Suite raíz     | `CI_SKIP_BUILD_CONTRACT=1 npx vitest run`                                                     | declared   | verde                     |
| SEO unit       | `npx vitest run test/seo.spec.js`                                                             | declared   | verde                     |
| Typecheck      | `npm run typecheck`                                                                           | declared   | exit 0                    |
| E2E            | `PLAYWRIGHT_SKIP_BUILD=1 npm run test:e2e`                                                    | declared   | verde                     |
| Lighthouse     | `npm run lighthouse:audit`                                                                    | declared   | sin regresión vs baseline |

## Scope

**In scope**:

- `astro-poc/src/components/ProductCardStrip.astro`, `astro-poc/src/components/CategoryStrip.astro`, `astro-poc/src/components/ProductDetail.astro`
- `astro-poc/src/pages/p/[sku].astro`, `astro-poc/src/components/CategoryCatalogPage.astro`
- `astro-poc/src/lib/catalog.ts` (helper `toStructuredDataProduct`)
- `test/product-markup.build-contract.test.js` (crear), `test/build-contract.guard.test.js`, `.github/workflows/ci.yml` (solo la lista del job `build-contract-tests`)

**Out of scope**:

- `ProductCard.astro` (ya correcto), `StructuredData.astro` (`buildProduct` sigue emitiendo lo que recibe), SearchAction/Organization.
- Formatos/tamaños de imagen, `srcset`/`sizes`.
- Bundle/CSS splitting (rechazados por los planes 247/270).

## Git workflow

- Branch: `advisor/286-build-markup`.
- Commits: `perf(storefront): one high-priority image per page (plan 286)` y `fix(seo): product JSON-LD uses the visible price, absolute image and category label (plan 286)`.

## Steps

### Step 0: Baseline

Install, build, suite raíz, typecheck, E2E. Anota los conteos de `fetchpriority="high"` (comando "Contar high") para `index.html`, `despensa/index.html` y una ficha `p/*/index.html`, y corre `npm run lighthouse:audit` guardando las puntuaciones de performance como baseline.

**Verify**: verdes; conteos anotados (esperado 19 / 1 / 3).

### Step 1: Prioridad explícita, no por índice

1. `ProductCardStrip.astro`: reemplaza `index < 3` por una prop
   `priority?: boolean` (default `false`): `const isLikelyLcp = priority === true;`.
   Conserva `index` en Props (lo usa `computeProductCardData`).
2. `CategoryStrip.astro`: no pasa `priority` (todos los cintillos → lazy). No añadas props nuevas.
3. `ProductDetail.astro`: añade `fetchpriority="high"` al `<img>` principal (ya es `loading="eager"`).

**Verify**: `npm run build`; conteos: `index.html` → **1**, `despensa/index.html` → 1, ficha → **1**
(la imagen principal). Comprueba que en la ficha el único `fetchpriority="high"` está en un `<img` con `product-detail-image`:
`grep -o '<img[^>]*fetchpriority="high"[^>]*>' astro-poc/dist/p/<sku>/index.html`.

### Step 2: JSON-LD fiel

1. En `lib/catalog.ts` exporta:
   ```ts
   /** Plan 286: the Product JSON-LD must match what the page shows. */
   export function toStructuredDataProduct({ sku, product }: ProductWithSku) {
     const price = typeof product.price === 'number' ? product.price : 0;
     const discount = typeof product.discount === 'number' ? product.discount : 0;
     return {
       sku,
       name: product.name,
       description: product.description,
       image: absoluteUrl(resolveImageUrl(product.image_path)),
       price: Math.max(price - discount, 0),
       stock: Boolean(product.stock),
       brand: typeof product.brand === 'string' ? product.brand : undefined,
       category: product.category,
     };
   }
   ```
   (importa `absoluteUrl` de `./seo` solo si no crea un import circular; si `seo.ts` ya importa de `catalog.ts`,
   define el helper en `seo.ts` o en un archivo nuevo `lib/structured-product.ts` que importe de ambos).
2. Usa el helper en `p/[sku].astro` (`structuredProducts={[toStructuredDataProduct(item)]}`) y en
   `CategoryCatalogPage.astro` (`structuredProducts={products.map(toStructuredDataProduct)}`).
3. En `p/[sku].astro`: breadcrumb `name: getCategoryLabel(item.product.category)`; y
   `getProductOgImageUrl(item.product.image_path, getCategorySlug(item.product.category))`.
   Verifica antes que el OG image URL no cambia en el build actual (slug == key en minúsculas para todas
   las categorías hoy): compara el `og:image` de 3 fichas antes/después — deben ser idénticos.

**Verify**: build; para una ficha de un producto con descuento en stock:
`node -e` que extraiga el `<script type="application/ld+json">` y muestre `offers.price`, `image` y el `itemListElement[1].name` del BreadcrumbList.
Esperado: precio = price − discount; image empieza por `https://www.elrincondeebano.com/` y no contiene espacios; nombre de categoría = etiqueta visible del eyebrow.

### Step 3: Contrato de build que pudo haber atrapado ambos

Crea `test/product-markup.build-contract.test.js` siguiendo **exactamente** el patrón
fail-closed de `test/ssr-product-links.build-contract.test.js` (CommonJS, `node:assert/strict`,
skip solo con `CI_SKIP_BUILD_CONTRACT === '1'`, `assert.fail` si no hay dist). Tests:

1. `home and product pages emit exactly one high-priority image`: cuenta con
   `(html.match(/fetchpriority="high"/g) ?? []).length` (**nunca** con conteo de líneas) en
   `index.html` y en la ficha de un producto en stock → `=== 1` cada uno; en una página de categoría → `<= 1`.
2. `product JSON-LD offer matches the visible effective price`: elige desde `loadProductCatalog()`
   un producto `stock !== false`, `!is_archived`, `discount > 0`; carga su ficha
   (`getProductSku` como en el ejemplar); parsea el JSON-LD; asserta
   `offers.price === price - discount`, `/^https:\/\/www\.elrincondeebano\.com\//.test(image)`,
   `!/\s/.test(image)`.
3. `product breadcrumb uses the category label`: el segundo elemento del BreadcrumbList ≠ key cruda cuando la etiqueta difiere
   (elige un producto cuya `getCategoryLabel(key) !== key`; si no existe ninguno, asserta igualdad con la etiqueta).

Añade el archivo a `CONTRACT_FILES` de `test/build-contract.guard.test.js` y al comando
`npx vitest run` del job `build-contract-tests` de `ci.yml`.

**Verify**: con build presente, `npx vitest run test/product-markup.build-contract.test.js test/build-contract.guard.test.js` → verde.
Sonda: revierte temporalmente el Step 1.1 (vuelve `index < 3`), `npm run build:fast`, el test 1 falla con "19"; restaura.

### Step 4: Regresión y Lighthouse

Suite raíz, SEO unit, typecheck, E2E, `npm run lighthouse:audit`.

**Verify**: verdes; performance de la home ≥ baseline − 2 puntos (ruido); reporta ambos números.

## Test plan

- `test/product-markup.build-contract.test.js` (nuevo, 3 tests, fail-closed, registrado en las dos listas).
- Sonda negativa del Step 3.
- E2E visual/mobile sin regresión (las imágenes de cintillos pasan a lazy con `width`/`height` → sin CLS).

## Done criteria

- [ ] `grep -o 'fetchpriority="high"' astro-poc/dist/index.html | wc -l` → 1; en una ficha → 1
- [ ] `grep -n "index < 3" astro-poc/src/components/ProductCardStrip.astro` → sin match
- [ ] JSON-LD de un producto en oferta con precio efectivo e imagen absoluta (informe con el extracto)
- [ ] Test nuevo en `CONTRACT_FILES` y en `ci.yml`; `build-contract.guard.test.js` verde
- [ ] Sonda negativa demostrada; Lighthouse sin regresión (> −2)
- [ ] `git diff --name-only main...HEAD` ⊆ In scope; fila 286 en `plans/README.md`

## STOP conditions

- El `og:image` de alguna ficha cambia tras el Step 2.3.
- Lighthouse performance de la home cae más de 2 puntos frente al baseline.
- No hay ningún producto en stock con `discount > 0` (el test 2 no tendría sujeto): reporta.
- Un import circular `catalog.ts` ↔ `seo.ts` que no se resuelve con el archivo auxiliar.

## Maintenance notes

- Cualquier nuevo componente con imágenes above-the-fold debe recibir prioridad explícita; el contrato de build cuenta coincidencias, no líneas.
- Si se añaden precios por variante, `toStructuredDataProduct` es el único lugar a ajustar.
