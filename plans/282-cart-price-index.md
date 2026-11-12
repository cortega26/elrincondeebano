# Plan 282: Índice de precios del catálogo en cada página — el checkout nunca envía precios viejos

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 6d0a29af..HEAD -- astro-poc/src/scripts/storefront.js astro-poc/src/scripts/storefront/storefront-state.ts astro-poc/src/scripts/storefront/order-submit.js astro-poc/src/layouts/BaseLayout.astro astro-poc/src/lib/catalog.ts test/storefront-state.spec.js test/order-submit.spec.js test/e2e-astro/storage-contract.spec.ts`

## Status

- **Priority**: P1 (camino del dinero)
- **Effort**: M
- **Risk**: MED (toca la identidad/refresh del carrito, pineada por reglas de `sanitizeCart`)
- **Depends on**: none. **Antes de** `plans/283-repeat-order-discount.md` y `plans/294-sw-navigation-cache.md` (mismos archivos).
- **Category**: bug
- **Planned at**: commit `6d0a29af`, 2026-11-12 (Auditoría 13). **Reabre** la garantía del plan 219.

## Why this matters

El plan 219 prometió que "el checkout siempre precia desde el catálogo vivo",
pero el resolver que usa (`resolveLiveProductForCart`) solo encuentra
productos **renderizados como tarjeta en la página actual**. Un cliente que
agrega productos en páginas de categoría y luego hace checkout desde la home
(39 tarjetas de ~102 productos), una ficha de producto (~6 tarjetas),
`/combos/` o `/impresiones/` (0 tarjetas) envía por WhatsApp el **precio que
tenía el producto cuando lo agregó** (días atrás, quizás). Los cambios de
precio son hoy la edición de catálogo más frecuente (p. ej. PR #540). Además,
un producto que pasó a `stock: false` (92 de 196) nunca se renderiza, así que
nunca se refresca ni se marca, y un link de carrito compartido desde esas
páginas pierde ítems en silencio. Arreglarlo con un índice compacto
`id → precio/descuento/stock` incrustado en cada página elimina la
dependencia del DOM para el precio.

## Current state

- `astro-poc/src/scripts/storefront.js:438-448` — resolución solo por DOM:
  ```js
  function getProductByIdFromSource(id) {
    const card = getProductCardMap().get(id);
    return card ? getProductFromCard(card) : null;
  }
  // Shared by the shared-link hydration (plan 026) and the persisted-cart
  // refresh (plan 219): the live catalog record for a cart line, resolved from
  // the rendered cards (map first, document-wide fallback).
  function resolveLiveProductForCart(id) {
    return getProductByIdFromSource(id) || getProductFromCard(getProductCardById(id));
  }
  ```
- `storefront.js:162-177` — `loadCart()` hace una proyección de solo lectura
  (NUNCA reescribe storage: `visualCartIdentity` incluye precio/descuento y una
  escritura podría colapsar filas en el próximo `sanitizeCart`):
  ```js
  return refreshCartItemsFromCatalog(cart, resolveLiveProductForCart).cart;
  ```
- `storefront.js:1215-1227` — checkout:
  ```js
  submitCartOrder = (cartToSubmit) => {
    const refreshed = refreshCartItemsFromCatalog(cartToSubmit, resolveLiveProductForCart);
    if (refreshed.changed) {
      const nextCart = refreshed.cart;
      setCart(nextCart);
      updateBadge(nextCart);
      renderCart(nextCart);
    }
    orderSubmitController.submitCartOrder(refreshed.cart);
  };
  ```
- `storefront.js:236-276` — `loadCartFromUrl()`: `hydrateSharedCart(raw, resolveLiveProductForCart)`;
  si nada resuelve, `return false` sin aviso (línea 245).
- `astro-poc/src/scripts/storefront/storefront-state.ts:162-200` —
  `refreshCartItemsFromCatalog(cart, resolveProductById)`: líneas sin producto
  resuelto quedan intactas; nunca cambia cantidad ni orden.
- `storefront-state.ts:332-350` — `hydrateSharedCart` descarta ids sin producto o con `stock === false`.
- `astro-poc/src/lib/catalog.ts:353-356` — `getProducts()` excluye archivados **y** `stock === false`;
  `getProductsWithSku()` (358-374) asigna `sku` = `getProductSku(product)` con sufijo `-2` solo ante duplicados.
  Las tarjetas exponen `data-product-id = sku` (`astro-poc/src/lib/product-card-helpers.ts:54`),
  `data-product-price`, `data-product-discount`, `data-product-stock` (59-63).
- `astro-poc/src/scripts/storefront/order-submit.js:22-53` — `buildWhatsAppMessageText(cart, totalAmount, selectedPayment, substitutionPreference, deliveryNote)`;
  líneas `*${item.name}*` + `   ${qty} × $X = $Y`. `submitCartOrder(cart)` (119-178) construye mensaje, resumen y preview.
- Patrón de datos incrustados de la casa: `astro-poc/src/pages/index.astro:209-211`
  ```astro
    id="storefront-experience-data"
    set:html={safeScriptJSON({ companionRules: storefrontExperience.companionRules ?? [] })}
  ```
  con `<script type="application/json" ...>`, `safeScriptJSON` en
  `astro-poc/src/lib/serialization.ts` (escapa `</`), y lectura en
  `storefront.js:128-139` (`readStorefrontExperience`, try/catch → `{}`).
  CSP del sitio: `script-src 'self' https://plausible.io` — un bloque
  `application/json` no se ejecuta, igual que el existente.
- Tests ejemplares: `test/storefront-totals.spec.js` (fixtures del catálogo real
  `../data/product_data.json`, `describe/it/expect`), `test/order-submit.spec.js`,
  e2e `test/e2e-astro/storage-contract.spec.ts:592-645` ("stale persisted prices
  refresh from the live catalog…": siembra `astro-poc-cart` con precio +500 y
  verifica `.cart-item__price-line` / `#cart-total` con `Intl.NumberFormat('es-CL', {style:'currency',currency:'CLP',minimumFractionDigits:0})`),
  y `storage-contract.spec.ts:50-98` (captura de la URL de WhatsApp al enviar).
- **Matiz sobre "solo lectura"** (verificado): `loadCart()` no escribe, pero las
  mutaciones sí persisten la proyección. `cart-controller.js:~124-130` (`setQty`) hace
  `const persistedCart = loadCart(); const nextCart = persistedCart.map(...)` y después
  guarda `nextCart`. O sea: tras un +/−, los precios refrescados (hoy por DOM; tras
  este plan, también por índice) **se escriben** en storage. Es comportamiento
  existente. El riesgo documentado (`visualCartIdentity` incluye precio/descuento)
  es que dos filas con ids distintos y mismo nombre/categoría/imagen pasen a tener
  el mismo precio y `sanitizeCart` las colapse. El Step 3 añade un test para eso.
- **Tamaño medido del índice** (advisor, sobre `data/product_data.json` de `6d0a29af`):
  180 entradas no archivadas, 5170 B en crudo y **1957 B gzip** como archivo suelto.
  Dentro del HTML el delta gz debería quedar por debajo de eso. El gate de 3072 B
  del Step 2 tiene margen.

## Commands you will need

| Purpose      | Command                                                                                                                                            | Provenance | Expected on success             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------- |
| Install      | `HUSKY=0 npm ci`                                                                                                                                   | declared   | exit 0                          |
| Unit focus   | `npx vitest run test/storefront-state.spec.js test/storefront-totals.spec.js test/order-submit.spec.js test/cart-price-index.spec.js`              | declared   | verde                           |
| Suite raíz   | `CI_SKIP_BUILD_CONTRACT=1 npx vitest run`                                                                                                          | declared   | verde                           |
| Typecheck    | `npm run typecheck`                                                                                                                                | declared   | exit 0                          |
| Lint         | `npm run lint`                                                                                                                                     | declared   | exit 0                          |
| Build        | `npm run build`                                                                                                                                    | declared   | exit 0                          |
| E2E cart     | `PLAYWRIGHT_SKIP_BUILD=1 npx playwright test -c playwright.astro.config.ts test/e2e-astro/storage-contract.spec.ts test/e2e-astro/cart-ux.spec.ts` | declared   | verde                           |
| E2E completo | `PLAYWRIGHT_SKIP_BUILD=1 npm run test:e2e`                                                                                                         | declared   | verde (84 pass / 2 skip aprox.) |
| Tamaño home  | `gzip -9 -c astro-poc/dist/index.html \| wc -c`                                                                                                    | declared   | número (bytes gz)               |

## Scope

**In scope**:

- `astro-poc/src/lib/catalog.ts` (export nuevo `getCartPriceIndex`)
- `astro-poc/src/layouts/BaseLayout.astro` (emitir el bloque JSON)
- `astro-poc/src/scripts/storefront/storefront-state.ts` (función pura nueva)
- `astro-poc/src/scripts/storefront.js` (lector + cableado en `loadCart`, `submitCartOrder`, `loadCartFromUrl`)
- `astro-poc/src/scripts/storefront/order-submit.js` (anotación de líneas sin stock)
- `test/cart-price-index.spec.js` (crear), `test/storefront-state.spec.js`, `test/order-submit.spec.js`, `test/e2e-astro/storage-contract.spec.ts`

**Out of scope**:

- `refreshCartItemsFromCatalog`, `sanitizeCart`, `visualCartIdentity`, `sameCartProduct` — NO cambies su semántica (21+ reglas pineadas por el plan 245/265).
- Escribir precios refrescados a `localStorage` **desde `loadCart`, `submitCartOrder` o `applyCartPriceIndex`**: prohibido (ver el comentario en `loadCart`). La persistencia que ya hacen las mutaciones (`setQty`) se mantiene tal cual; ver el matiz en Current state.
- `service-worker.js` (fallback offline): plan 294.
- `personalization.js` / `recordOrder` (descuentos al repetir pedido): plan 283.
- Guard de "+" para líneas sin tarjeta y agotadas (`cart-controller.js:80`): ver Deferred.
- Mostrar productos agotados en el catálogo (decisión `8877eeb6`, no se toca).

## Git workflow

- Branch: `advisor/282-cart-price-index`.
- Commits estilo `fix(storefront): price checkout from an embedded catalog index (plan 282)`.
- No push/PR salvo instrucción.

## Steps

### Step 0: Baseline

`HUSKY=0 npm ci`, `npm run build`, unit focus, suite raíz, typecheck, lint y
E2E cart sobre el checkout limpio. Anota `gzip -9 -c astro-poc/dist/index.html | wc -c`
y lo mismo para `astro-poc/dist/combos/index.html` (baseline de tamaño).

**Verify**: todo verde; dos números de baseline anotados en tus notas.

### Step 1: Índice en build (`getCartPriceIndex`)

En `astro-poc/src/lib/catalog.ts` exporta:

```ts
/** Plan 282: compact id → [price, discount, inStock(1|0)] for EVERY non-archived
 *  product (out-of-stock included, so checkout can flag them). Keys match the
 *  card `data-product-id` (getProductsWithSku) for rendered products. */
export function getCartPriceIndex(): Record<string, [number, number, 0 | 1]>;
```

Construcción (cachea el resultado en una variable de módulo como los demás getters):

1. Para cada `{ sku, product }` de `getProductsWithSku()` → `index[sku] = [price, discount, 1]`
   (price/discount numéricos, `0` si no son número — igual que `computeProductCardData`).
2. Para cada producto de `catalog.products` con `is_archived !== true` y
   `stock === false` → clave `getProductSku(product)`; si la clave ya existe,
   NO la sobrescribas; si no, `index[key] = [price, discount, 0]`.

Test nuevo `test/cart-price-index.spec.js` (importa `getCartPriceIndex` y
`getProductsWithSku` desde `../astro-poc/src/lib/catalog.ts` como hace
`test/catalog-queries.spec.js`, y `../data/product_data.json`):

- cada `sku` de `getProductsWithSku()` está en el índice con flag `1` y su precio/descuento;
- cada producto no archivado con `stock === false` está con flag `0`;
- ningún producto `is_archived === true` está (salvo que comparta clave con uno vivo);
- el número de claves = vivos + agotados no archivados (sin duplicados).

**Verify**: `npx vitest run test/cart-price-index.spec.js` → verde.

### Step 2: Emitirlo en todas las páginas

En `BaseLayout.astro`, justo antes de `</body>`, añade:

```astro
<script type="application/json" id="cart-price-index" set:html={safeScriptJSON(getCartPriceIndex())}></script>
```

importando `getCartPriceIndex` de `../lib/catalog` y `safeScriptJSON` de
`../lib/serialization`. Emite el JSON sin espacios (ya lo hace `JSON.stringify`).

`npm run build` y mide de nuevo el tamaño gz de home y combos.

**Verify**: `grep -c 'id="cart-price-index"' astro-poc/dist/index.html astro-poc/dist/combos/index.html astro-poc/dist/impresiones/index.html` → 1 en cada uno;
delta gz de la home ≤ **3072 bytes** respecto del baseline. Si es mayor → STOP (reporta los números; no recortes el índice por tu cuenta).

### Step 3: Función pura de aplicación del índice

En `storefront-state.ts` añade y exporta:

```ts
export type CartPriceIndex = Record<string, [number, number, number]>;
export interface CartPriceIndexResult {
  cart: CartItem[];
  changed: boolean;
  unavailableIds: string[]; // in index with stock 0, or absent from index
}
export function applyCartPriceIndex(
  cart: CartItem[],
  index: CartPriceIndex | null
): CartPriceIndexResult;
```

Reglas (escríbelas también como comentario):

- `index` nulo/no-objeto → `{ cart, changed: false, unavailableIds: [] }` (degrada a hoy).
- Para cada línea: si `index[item.id]` existe → nueva línea `{ ...item, price, discount }`
  (solo esos dos campos; nombre/imagen/cantidad/orden intactos); `changed` si alguno difiere.
  Si el flag es `0` → id a `unavailableIds`.
- Si `index[item.id]` no existe → línea intacta e id a `unavailableIds`.
- Nunca agrega, quita ni reordena líneas. Nunca muta los objetos de entrada.

Tests en `test/storefront-state.spec.js` (`describe('applyCartPriceIndex (plan 282)')`):
precio viejo → actualizado; descuento nuevo → aplicado; flag 0 → precio
actualizado + id en `unavailableIds`; id ausente → intacto + id en `unavailableIds`;
`index = null` → identidad; no mutación de entrada (`Object.freeze` en fixtures).

Test de no-colapso (por el matiz de "solo lectura" de Current state): dos líneas con
**ids distintos** y mismo `name`/`category`/`image` pero precios viejos distintos,
ambas presentes en el índice con el mismo precio vivo →
`sanitizeCart(applyCartPriceIndex(cart, index).cart)` debe conservar **las dos**
líneas. Si `sanitizeCart` las colapsa → **STOP**: reporta el caso. No cambies
`sanitizeCart`/`visualCartIdentity` (fuera de alcance). La alternativa a decidir
con el reviewer es que la mutación rebase sobre el carrito persistido sin
proyección.

**Verify**: unit focus verde.

### Step 4: Cablearlo en el runtime

En `storefront.js`:

1. `readCartPriceIndex()` con el mismo patrón que `readStorefrontExperience`
   (id `cart-price-index`, try/catch → `null`). Léelo **una vez** en
   `initStorefront` y guárdalo en una variable de módulo `cartPriceIndex`
   (inicializada a `null`; `loadCart` puede correr antes de `initStorefront`
   vía `loadCartFromUrl`, así que haz la lectura perezosa: un getter que lee
   el DOM la primera vez).
2. `loadCart()`: después del `refreshCartItemsFromCatalog(...)` existente,
   aplica `applyCartPriceIndex(refreshed, getCartPriceIndex())` y retorna su
   `.cart`. Sigue siendo proyección de solo lectura (no llames `saveCart`).
3. `submitCartOrder`: tras el refresh por DOM, aplica el índice; si `changed`
   en cualquiera de los dos pasos → `setCart/updateBadge/renderCart` (como hoy);
   llama `orderSubmitController.submitCartOrder(cart, { unavailableIds })`.
4. `loadCartFromUrl()`: calcula `requested = parseSharedCartPayload(raw).length`
   (importa la función) y tras `hydrateSharedCart` calcula
   `skipped = requested - hydrated.length`. Si `skipped > 0`, muestra un aviso
   no bloqueante con id `shared-cart-partial` construido con `createElement`
   y `textContent` (NO `innerHTML` con datos): texto
   `"${skipped} producto(s) del enlace no se pudieron agregar (sin stock o no disponibles en esta página)."`
   con el mismo contenedor/clases que el aviso del plan 117 (líneas 252-263).
   Mantén el resto del flujo idéntico (incluido `return false` si nada resolvió,
   pero ahora con aviso).

En `order-submit.js`: `submitCartOrder(cart, { unavailableIds = [] } = {})`
pasa un `Set` a `buildWhatsAppMessageText` y `buildOrderConfirmSummary` como
último parámetro opcional. Para líneas cuyo `id` esté en el set:

- mensaje: añade una línea `   ⚠️ Sin stock en el catálogo` después de la línea de cantidad;
- resumen: añade el texto ` · Sin stock` al `order-confirm__summary-item-meta`.
  El total NO cambia (la preferencia "Stock:" del cliente ya cubre sustituciones).
  Firmas existentes deben seguir funcionando sin el parámetro nuevo.

Tests en `test/order-submit.spec.js`: mensaje con y sin `unavailableIds`
(asserta la línea exacta `   ⚠️ Sin stock en el catálogo` solo bajo el ítem marcado).

**Verify**: unit focus + suite raíz verdes; typecheck y lint exit 0.

### Step 5: E2E que hoy fallaría

En `test/e2e-astro/storage-contract.spec.ts` añade (siguiendo el test de la
línea 592 y el de captura de WhatsApp de la línea 50):

1. `checkout from a page without product cards prices stale lines from the catalog index`:
   lee un producto en stock desde `data/product_data.json` (Node `fs`, en el
   test runner) cuyo `id` exista; siembra `astro-poc-cart` con ese ítem a
   precio `+500` y cantidad 2; navega a **`/impresiones/`** (0 tarjetas);
   abre el carrito; asserta `.cart-item__price-line` = precio vivo efectivo y
   `#cart-total` correcto; completa el envío como en el test de la línea 50 y
   asserta que el texto decodificado de la URL de WhatsApp contiene
   `2 × $<precio vivo es-CL>`.
2. `shared cart link reports items it could not add`: construye un hash
   `#cart=` (usa `encodeCart` como lo hace `cart-ux.spec.ts` T11b, o arma el
   payload v1 `{version:1,items:[{id,quantity}]}` con `btoa(encodeURIComponent(JSON.stringify(...)))`)
   con un id inexistente + uno en stock; abre `/`; asserta que `#shared-cart-partial`
   es visible y contiene `1 producto(s)`.

**Verify**: E2E cart verde con los 2 tests nuevos. Sonda: revierte temporalmente
el Step 4.3 (sin índice en submit) → el test 1 falla; restaura.

### Step 6: Regresión completa

`npm run build`, E2E completo, suite raíz, typecheck, lint.

**Verify**: todo verde; mismo número de pass/skip que el baseline + 2.

## Test plan

- `test/cart-price-index.spec.js` (nuevo): construcción del índice contra el catálogo real.
- `test/storefront-state.spec.js`: 6 casos de `applyCartPriceIndex`.
- `test/order-submit.spec.js`: anotación de líneas sin stock.
- E2E: checkout desde `/impresiones/` con precio viejo (falla antes del plan) y aviso de link compartido parcial.

## Done criteria

- [ ] `grep -c 'id="cart-price-index"' astro-poc/dist/index.html` → 1 (y en combos e impresiones)
- [ ] Delta gz de la home ≤ 3072 bytes (números en el informe)
- [ ] `grep -n "applyCartPriceIndex" astro-poc/src/scripts/storefront.js` → al menos 2 usos (loadCart y submit)
- [ ] `grep -n "localStorage\|saveCart" ` dentro de `applyCartPriceIndex` → ninguno (función pura)
- [ ] Unit focus, suite raíz, typecheck, lint, build y E2E completo verdes
- [ ] Sonda negativa del Step 5 demostrada (informe)
- [ ] `git diff --name-only main...HEAD` ⊆ In scope; fila 282 en `plans/README.md`

## STOP conditions

- Delta gz de la home > 3072 bytes.
- Alguna clave de `getProductsWithSku()` lleva sufijo `-2` (duplicado): el índice y las tarjetas podrían divergir — reporta los productos.
- Para pasar los tests necesitas cambiar `refreshCartItemsFromCatalog`, `sanitizeCart` o escribir el carrito refrescado en storage.
- Algún test existente de `cart-ux.spec.ts` o `storage-contract.spec.ts` falla y su arreglo requiere cambiar lo que asserta (no solo selectores).
- La CSP de producción (`tools/security-header-policy.mjs`) bloquearía el bloque JSON (no debería: `application/json` no se ejecuta).

## Maintenance notes

- El índice se recalcula en cada build: cualquier cambio de precio publicado llega a todas las páginas en el mismo deploy. Una página HTML cacheada por el SW o el navegador lleva su índice de ese momento (plan 294 acota el fallback offline).
- Si el catálogo crece mucho (> ~800 productos), revisa el delta gz; la alternativa es un JSON aparte con hash fetcheado al abrir el carrito.
- El copy `⚠️ Sin stock en el catálogo` es editable por el operador; no cambia el total.
- **Deferred:** bloquear el botón "+" de líneas agotadas sin tarjeta en la página (`cart-controller.js:80`) — requiere pasar el índice al controller; bajo valor (el checkout ya lo marca). Se reabre si el operador reporta pedidos con cantidades aumentadas de productos agotados.
- **Deferred:** hidratar links compartidos con productos fuera de la página — requiere nombre e imagen en el índice (≈4× más bytes). Se reabre si el aviso `shared-cart-partial` aparece en soporte.
