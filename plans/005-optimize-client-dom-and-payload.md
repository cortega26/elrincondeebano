# Plan 005: Optimizar renderizado DOM y payload en cliente

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.

> **Drift check (run first)**: `git diff --stat 4751633..HEAD -- astro-poc/src/scripts/storefront.js astro-poc/src/scripts/storefront/catalog-view.js astro-poc/src/scripts/storefront/personalization.js`
> Si los archivos cambiaron, compara excerpts contra código vivo; si hay mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 001 (ambos tocan storefront.js — coordinar orden)
- **Category**: perf
- **Planned at**: commit `4751633`, 2026-06-14

## Why this matters

Tres optimizaciones del lado cliente que reducen trabajo de DOM y parsing redundante:

1. **PERF-03**: `getSourceProductCards()` (`storefront.js:419-422`) ejecuta `querySelectorAll` en cada llamada. Se invoca desde `getCompanionProducts()` (línea 709, dentro de triple loop: companion rules × targets × cards), `getProductByIdFromSource()` (línea 444, llamado desde click handlers y `addBundleItems`), y `renderPersonalizedProducts()` (línea 658). Un solo cambio de cantidad en el carrito puede disparar 3-5 full DOM scans.

2. **PERF-04**: `renderCart()` (`storefront.js:889`) hace `container.replaceChildren()` y reconstruye TODOS los items del carrito desde cero en cada cambio de cantidad. Un click en "+" destruye y recrea ~130 elementos DOM.

3. **PERF-09**: `scoreProductId()` (`personalization.js:58-78`) llama a `loadProductSignals()` que lee y parsea JSON de localStorage. Se invoca en loop desde `getPersonalizedProductIds()` (línea 106) para cada producto visible (50+ items). Cada llamada re-parsea el mismo JSON.

## Current state

### PERF-03: Full DOM scans

```javascript
// storefront.js:419-422
function getSourceProductCards() {
  return Array.from(document.querySelectorAll('#product-container .producto')).filter(
    (card) => card instanceof HTMLElement
  );
}
```

Se usa en:

- `getProductByIdFromSource(id)` — línea 444: `getSourceProductCards().find(...)`
- `getCompanionProducts(cart, companionRules)` — línea 709: `getSourceProductCards().map(...).find(...)` dentro de `targets.forEach` dentro de `companionRules.forEach`
- `renderPersonalizedProducts(...)` — línea 658: llama `getProductByIdFromSource` por cada ID

### PERF-04: Full cart teardown

```javascript
// storefront.js ~889
function renderCart(cart, { animateTotal = false } = {}) {
  const container = document.getElementById('cart-items');
  if (!container) return;
  container.replaceChildren(); // ← destruye todo
  // ... reconstruye cada item desde cero ...
}
```

Se llama desde `setQty` (línea 1553) en cada add/remove/quantity change.

### PERF-09: Parse en loop

```javascript
// personalization.js:58-78
function scoreProductId(productId) {
  const signals = loadProductSignals(); // ← parsea localStorage cada vez
  // ...
}

// personalization.js:106
getVisibleProductIds().forEach((productId) => {
  ranked.set(productId, (ranked.get(productId) || 0) + scoreProductId(productId));
  // ↑ scoreProductId llama loadProductSignals() para cada producto
});
```

### Convenciones

- `storefront.js` usa `function` declarations y variables con closure sobre el estado del carrito.
- `catalog-view.js` ya usa un objeto controller con estado interno (`visibleLimit`, `matchedCount`).
- `personalization.js` exporta una factory function `createPersonalizationEngine`.

## Commands

| Purpose    | Command             | Expected on success               |
| ---------- | ------------------- | --------------------------------- |
| Typecheck  | `npm run typecheck` | exit 0                            |
| Tests      | `npm test`          | all pass                          |
| Lint       | `npm run lint`      | exit 0                            |
| E2E (cart) | `npm run test:e2e`  | all pass (o fallos preexistentes) |

## Scope

**In scope**:

- `astro-poc/src/scripts/storefront.js` — `getSourceProductCards`, `getProductByIdFromSource`, `getCompanionProducts`, `renderCart`
- `astro-poc/src/scripts/storefront/catalog-view.js` — `updateView` (línea 65: `appendChild` secuencial)
- `astro-poc/src/scripts/storefront/personalization.js` — `getPersonalizedProductIds`, `scoreProductId`

**Out of scope**:

- `astro-poc/src/components/` — componentes Astro
- Bootstrap imports (eso es PERF-06, esfuerzo M, no incluido en este plan)
- Cambios en CSS o estilos

## Git workflow

- Branch: `advisor/005-optimize-client-dom`
- Commit messages: `perf: cache product card DOM queries and batch localStorage reads`
- No push/PR sin indicación.

## Steps

### Step 1: Cachear el mapa de product cards

En `storefront.js`, añadir un `Map` module-level que se reconstruye solo cuando el DOM cambia:

```javascript
let productCardCache = null;

function invalidateProductCardCache() {
  productCardCache = null;
}

function getProductCardMap() {
  if (productCardCache) {
    return productCardCache;
  }
  productCardCache = new Map();
  document.querySelectorAll('#product-container .producto').forEach((card) => {
    if (card instanceof HTMLElement) {
      const id = normalizeId(card.dataset.productId);
      if (id) productCardCache.set(id, card);
    }
  });
  return productCardCache;
}

// Actualizar getProductByIdFromSource para usar el cache:
function getProductByIdFromSource(id) {
  const card = getProductCardMap().get(id);
  return card ? getProductFromCard(card) : null;
}
```

En `catalog-view.js`, llamar a `invalidateProductCardCache` después de `updateView()` (cuando el DOM cambia por sort/filter). Exportar `invalidateProductCardCache` desde storefront.js o usar un evento custom.

**Verify**: `npm run lint` → exit 0

### Step 2: Targeted cart updates

En `renderCart`, en lugar de `replaceChildren()`, usar data attributes para encontrar y actualizar solo el item modificado:

```javascript
function renderCart(cart, { animateTotal = false, changedItemId = null } = {}) {
  const container = document.getElementById('cart-items');
  if (!container) return;

  if (cart.length === 0) {
    container.replaceChildren();
    renderEmptyCart(container);
    return;
  }

  // Si solo un item cambió, actualizarlo directamente
  if (changedItemId && container.children.length === cart.length) {
    const existingRow = container.querySelector(`[data-cart-item="${changedItemId}"]`);
    if (existingRow) {
      const item = cart.find((entry) => entry.id === changedItemId);
      if (item) {
        updateCartItemRow(existingRow, item);
        updateCartTotal(cart, animateTotal);
        return;
      }
    }
  }

  // Full rebuild como fallback
  container.replaceChildren();
  cart.forEach((item) => buildCartItemRow(container, item));
  updateCartTotal(cart, animateTotal);
}
```

En `setQty`, pasar el ID del item modificado:

```javascript
renderCart(cart, { animateTotal: ..., changedItemId: id });
```

**Verify**: `npm run lint` → exit 0. `npm run test:e2e` → cart tests pasan.

### Step 3: Evitar re-parse de localStorage en loop

En `personalization.js`, modificar `getPersonalizedProductIds` para parsear `loadProductSignals()` una sola vez:

```javascript
function getPersonalizedProductIds() {
  const signals = loadProductSignals(); // ← UNA sola llamada

  function scoreProductIdCached(productId) {
    // misma lógica que scoreProductId, pero recibe `signals` como parámetro
    const signal =
      signals[productId] && typeof signals[productId] === 'object' ? signals[productId] : {};
    let score = parseNumber(signal.addedCount, 0) * 2 + parseNumber(signal.orderedCount, 0) * 5;
    // ... resto de la lógica ...
    return score;
  }

  // ... usar scoreProductIdCached en lugar de scoreProductId ...
}
```

También cachear `loadLastOrder()` y `loadRecentOrders()` — ya se leen al inicio de `getPersonalizedProductIds`.

**Verify**: `npm test` → tests existentes pasan

### Step 4: Usar DocumentFragment en catalog-view.js

En `catalog-view.js:65`, reemplazar el `appendChild` secuencial:

```javascript
const fragment = document.createDocumentFragment();
sortedProducts.forEach((item) => fragment.appendChild(item));
container.appendChild(fragment);
```

**Verify**: `npm run lint` → exit 0

### Step 5: Validación completa

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e
```

## Test plan

1. **Product card cache**: test en `test/storefront.catalog-view.spec.js` — verificar que `getProductCardMap()` retorna el mismo Map en llamadas sucesivas, y que se invalida cuando el DOM cambia.
2. **Targeted cart update**: test en `test/cart.spec.js` — verificar que cambiar cantidad de un item no destruye otros items del DOM.
3. **localStorage parse**: test de `getPersonalizedProductIds` — mockear `loadProductSignals` con un spy, verificar que se llama exactamente 1 vez.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run test:e2e` exits 0 (o sin nuevas fallas)
- [ ] `getSourceProductCards()` ya no se usa en loops — reemplazado por `getProductCardMap()`
- [ ] `renderCart` acepta `changedItemId` y hace targeted update cuando es posible
- [ ] `scoreProductId` no llama `loadProductSignals()` — recibe los signals ya parseados
- [ ] `catalog-view.js:65` usa `DocumentFragment`

## STOP conditions

- Si la invalidación del cache de product cards no se sincroniza correctamente con `catalog-view.js` (productos desaparecen o se duplican).
- Si el targeted cart update produce inconsistencias visuales (items con datos viejos).
- Si los E2E tests de carrito fallan consistentemente.
- Si el cambio en `catalog-view.js` rompe el infinite scroll (el observer depende del orden del DOM).

## Maintenance notes

- Si se añade lazy loading o virtual scrolling a la grilla de productos, el cache de product cards debe invalidarse cuando nuevos cards entran al DOM.
- El targeted cart update asume que `cart.length === container.children.length`. Si se añade animación de entrada/salida con elementos extra en el contenedor, esta condición fallará.
- La optimización de `scoreProductId` es parte del motor de personalización. Si el motor se mueve a un Web Worker, el acceso a localStorage debe manejarse vía `postMessage`.
