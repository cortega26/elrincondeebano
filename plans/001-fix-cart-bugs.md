# Plan 001: Corregir bugs del carrito — dual keys, quota errors, stock en bundles y descuentos ignorados

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.

> **Drift check (run first)**: `git diff --stat 4751633..HEAD -- astro-poc/src/scripts/storefront.js astro-poc/src/scripts/storefront/storefront-state.ts astro-poc/src/scripts/storefront/storage-contract.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `4751633`, 2026-06-14

## Why this matters

Cuatro bugs corrigen la integridad del carrito de compras — el camino del dinero:

1. **CB-01 — Dual keys**: El carrito legacy escribe a `localStorage['cart']` mientras el nuevo storefront lee de `astro-poc-cart`. Si ambos módulos se cargan en la misma sesión, el carrito queda partido en dos keys y el usuario ve el carrito vacío al navegar entre páginas.
2. **CB-04 — Quota errors**: Cuando localStorage está lleno (QuotaExceededError común en Safari modo privado), `saveCart` falla silenciosamente. La UI muestra items añadidos pero no se persisten — al recargar, el carrito está vacío sin advertencia.
3. **CB-05 — Bundle stock bypass**: `addBundleItems` llama a `setQty` que solo verifica `stock === false` para items NUEVOS (`index < 0`). Items ya en el carrito (`index >= 0`) se incrementan sin verificar stock.
4. **CB-07 — Descuentos ignorados**: `buildOrderConfirmSummary` y `buildWhatsAppMessageText` calculan `item.price * item.quantity` sin restar `item.discount`. El cliente y el negocio ven precios inflados en la confirmación y el mensaje de WhatsApp.

## Current state

### Archivos relevantes

- `astro-poc/src/scripts/storefront.js` — Entry point del cliente (1937 líneas). Contiene `saveCart`, `setQty`, `addBundleItems`, `buildOrderConfirmSummary`, `buildWhatsAppMessageText`, `loadCart`, `saveCart`.
- `astro-poc/src/scripts/storefront/storefront-state.ts` — Interfaces y funciones puras del carrito: `CartItem`, `normalizeCartItem`, `sanitizeCart`, `createCartItemFromProduct`.
- `astro-poc/src/scripts/storefront/storage-contract.ts` — Abstracción de localStorage: `writeStorefrontSlot` (retorna `boolean`), `createStorefrontStorage`.

### CB-01: Dual keys

`storage-contract.ts:2` define la key canónica como `astro-poc-cart`. La migración en `storage-contract.ts:148-172` copia de `cart` → `astro-poc-cart` una sola vez (salta si `astro-poc-cart` ya existe, línea 150). Pero el módulo legacy `src/js/modules/cart.mjs` sigue escribiendo a `cart`. La migración solo ocurre si `loadCart()` encuentra `cart.length > 0` Y `astro-poc-cart === null` (storefront.js:140-145).

### CB-04: Quota errors silenciosos

```javascript
// storefront.js:149-151
function saveCart(cart) {
  storefrontStorage.saveJson('cart', sanitizeCart(cart));
}
```

`saveJson` retorna `boolean` desde `writeStorefrontSlot` (`storage-contract.ts:105-120`), que retorna `false` en el catch. Pero `saveCart` descarta el valor, y `setQty` (storefront.js:1551) no lo verifica:

```javascript
// storefront.js:1551
saveCart(cart);
updateBadge(cart, { animate: previousState.totalItems !== nextState.totalItems });
renderCart(cart, { animateTotal: previousState.totalAmount !== nextState.totalAmount });
```

### CB-05: Bundle stock bypass

```javascript
// storefront.js:1527-1548 (setQty)
const setQty = (id, nextQty, fallbackProduct = null) => {
  // ...
  if (index < 0 && fallbackProduct?.stock === false) {  // ← solo items NUEVOS
    return;
  }
  // ...
  } else if (index >= 0) {
    cart[index].quantity = quantity;  // ← sin verificar stock
  }
```

### CB-07: Descuentos ignorados

`CartItem` (`storefront-state.ts:3-10`) no tiene campo `discount`:

```typescript
export interface CartItem {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  quantity: number;
  // ❌ No discount field
}
```

`normalizeCartItem` (`storefront-state.ts:29-45`) no extrae `discount`. La orden usa `item.price` sin descuento:

```javascript
// storefront.js:1148
const subtotal = item.price * item.quantity; // ❌ sin discount

// storefront.js:1208
const subtotal = item.price * item.quantity; // ❌ sin discount (WhatsApp)
```

### Convenciones del repo a seguir

- **ESLint**: zero warnings. El pre-commit corre `eslint --max-warnings=0`.
- **Prettier**: `semi: true`, `singleQuote: true`, `trailingComma: 'es5'`, `printWidth: 100`.
- **Nombres**: camelCase para variables/funciones. Las funciones internas de storefront.js usan `function` declarations (no arrow functions).
- **Manejo de errores**: seguir el patrón existente en `storage-contract.ts` — try/catch que retorna fallback.
- **Patrón de tests**: Vitest `*.spec.js` con `describe`/`it`/`expect`. Ver tests existentes en `test/storefront.storage-contract.spec.js` y `test/storefront-state.spec.js`.

## Commands you will need

| Purpose   | Command             | Expected on success |
| --------- | ------------------- | ------------------- |
| Typecheck | `npm run typecheck` | exit 0, no errors   |
| Tests     | `npm test`          | all pass            |
| Lint      | `npm run lint`      | exit 0, no warnings |
| Format    | `npm run format`    | exit 0              |

## Scope

**In scope**:

- `astro-poc/src/scripts/storefront.js` — `saveCart`, `setQty`, `addBundleItems`, `buildOrderConfirmSummary`, `buildWhatsAppMessageText`, `getCartState`
- `astro-poc/src/scripts/storefront/storefront-state.ts` — `CartItem` interface, `normalizeCartItem`, `sanitizeCart`, `createCartItemFromProduct`, `getCartState`
- `test/storefront-state.spec.js` — añadir tests (modificar)
- `test/cart.unit.test.mjs` — añadir tests (modificar)

**Out of scope**:

- `src/js/modules/cart.mjs` — código legacy. Solo se modifica si se demuestra que todavía se carga en producción. El fix de CB-01 se hace del lado del nuevo storefront.
- `astro-poc/src/scripts/storefront/storage-contract.ts` — la API ya es correcta (retorna boolean).
- Cualquier cambio en la UI (CSS, HTML, Astro components).

## Git workflow

- Branch: `advisor/001-fix-cart-bugs`
- Commit messages: conventional commits. Ejemplo del repo: `fix: improve AVIF support detection and registration in image handling`
- No hacer push ni abrir PR a menos que se indique.

## Steps

### Step 1: Añadir `discount` al tipo `CartItem` y propagarlo

En `storefront-state.ts`:

1. Añadir `discount: number;` al interface `CartItem` (después de `price`).
2. En `normalizeCartItem`, extraer `discount`: `discount: parseNumber(itemObj?.discount, 0)`.
3. En `createCartItemFromProduct`, pasar `discount: prod?.discount`.

En `storefront.js`: 4. En `buildOrderConfirmSummary` (línea 1148), cambiar a:

```javascript
const effectivePrice = Math.max(0, item.price - (item.discount || 0));
const subtotal = effectivePrice * item.quantity;
```

y actualizar la línea de display (1157) para usar `effectivePrice`. 5. En `buildWhatsAppMessageText` (línea 1208), mismo cambio. 6. En `getCartState` (`storefront-state.ts:62-71`), usar `effectivePrice` en el cálculo de `totalAmount`:

```typescript
const effectivePrice = Math.max(0, parseNumber(item.price, 0) - parseNumber(item.discount, 0));
total + effectivePrice * clampQty(item.quantity);
```

**Verify**: `npm run typecheck` → exit 0

### Step 2: Hacer que `saveCart` retorne y verificar el resultado

En `storefront.js`:

1. Cambiar `saveCart` (línea 149-151) para que retorne el boolean:
   ```javascript
   function saveCart(cart) {
     return storefrontStorage.saveJson('cart', sanitizeCart(cart));
   }
   ```
2. En `setQty` (línea 1551), verificar el retorno antes de actualizar UI:
   ```javascript
   const saved = saveCart(cart);
   if (!saved) {
     log('warn', 'cart_save_failed', { reason: 'localStorage_quota' });
     // Restaurar estado anterior
     if (index >= 0 && previousQuantity > 0) {
       cart[index].quantity = previousQuantity;
     } else if (index >= 0 && previousQuantity <= 0) {
       cart.splice(index, 1);
     }
     if (previousQuantity <= 0 && index < 0 && fallbackProduct) {
       cart.pop();
     }
     showCartSaveError();
     return;
   }
   ```
3. Añadir función `showCartSaveError` que muestre un banner tipo toast:
   ```javascript
   function showCartSaveError() {
     const existing = document.getElementById('cart-save-error');
     if (existing) return;
     const toast = createElement('div', {
       className:
         'alert alert-warning alert-dismissible fade show position-fixed bottom-0 end-0 m-3',
       attrs: { id: 'cart-save-error', role: 'alert', style: 'z-index: 9999; max-width: 400px;' },
     });
     toast.innerHTML =
       '<strong>No se pudo guardar el carrito.</strong> Libera espacio en tu navegador e intenta de nuevo.<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>';
     document.body.appendChild(toast);
   }
   ```
4. También verificar en `saveCart` dentro de `loadCart` (línea 144) y `loadCartFromUrl` (línea 201).

**Verify**: `npm run lint` → exit 0, no warnings

### Step 3: Añadir verificación de stock para items existentes en `setQty`

En `storefront.js`, en `setQty` (línea 1541-1542):

```javascript
} else if (index >= 0) {
  // Verificar stock antes de incrementar
  if (quantity > cart[index].quantity && fallbackProduct?.stock === false) {
    return;
  }
  cart[index].quantity = quantity;
}
```

**Verify**: `npm run typecheck` → exit 0

### Step 4: Añadir sincronización robusta de keys legacy

En `storefront.js`, modificar `loadCart` (línea 138-147) para que sincronice bidireccionalmente:

```javascript
function loadCart() {
  const cart = sanitizeCart(storefrontStorage.loadJson('cart', []));
  // Si hay datos en la key legacy pero no en la canónica, migrar
  if (cart.length === 0) {
    const legacyRaw = globalThis.localStorage?.getItem('cart');
    if (legacyRaw) {
      try {
        const legacyCart = sanitizeCart(JSON.parse(legacyRaw));
        if (legacyCart.length > 0) {
          storefrontStorage.saveJson('cart', legacyCart);
          return legacyCart;
        }
      } catch {
        /* ignorar JSON inválido */
      }
    }
    return [];
  }
  // Mantener la key legacy sincronizada durante la transición (write-through)
  try {
    const serialized = JSON.stringify(cart);
    globalThis.localStorage?.setItem('cart', serialized);
  } catch {
    /* ignorar error de quota en la key legacy */
  }
  return cart;
}
```

**Verify**: `npm test` → all pass

### Step 5: Ejecutar validación completa

```bash
npm run typecheck && npm run lint && npm test
```

**Verify**: Todo exit 0, sin errores ni warnings.

## Test plan

Añadir a `test/storefront-state.spec.js`:

1. **`normalizeCartItem` incluye discount**: crear item con `discount: 500`, verificar que el resultado tiene `discount: 500`.
2. **`normalizeCartItem` sin discount**: crear item sin campo discount, verificar `discount: 0` (default).
3. **`sanitizeCart` preserva discount**: sanitizar array con items que tienen discount.
4. **`getCartState` aplica descuentos**: calcular totalAmount con items que tienen discount > 0, verificar que el total usa `price - discount`.
5. **`createCartItemFromProduct` propaga discount**.

Añadir a `test/cart.unit.test.mjs`:

6. **`setQty` rechaza incremento sobre stock=false en item existente**: simular cart con un item, llamar setQty con fallbackProduct.stock=false y quantity > actual, verificar que no incrementa.
7. **`saveCart` retorna false y restaura estado cuando storage falla**: mockear `storefrontStorage.saveJson` para que retorne false, verificar que el cart no se modifica.
8. **`loadCart` migra de key legacy cuando la canónica está vacía**.

### Patrón de test a seguir

Modelar según `test/storefront-state.spec.js` — tests de funciones puras con Vitest:

```javascript
import { describe, it, expect } from 'vitest';
import {
  normalizeCartItem,
  getCartState,
} from '../astro-poc/src/scripts/storefront/storefront-state.js';

describe('normalizeCartItem with discount', () => {
  it('extracts discount when present', () => {
    const item = normalizeCartItem({
      id: 'a',
      name: 'Test',
      price: 1000,
      discount: 200,
      quantity: 1,
    });
    expect(item.discount).toBe(200);
  });
  // ...
});
```

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0; nuevos tests para CartItem.discount, stock check, saveCart error, y legacy key migration existen y pasan
- [ ] `grep -rn "item\.price \* item\.quantity" astro-poc/src/scripts/storefront.js` solo encuentra ocurrencias en comentarios o código legacy no relacionado
- [ ] `grep -rn "\.discount" astro-poc/src/scripts/storefront/storefront-state.ts` muestra el campo en CartItem y su uso en normalizeCartItem
- [ ] No files outside the in-scope list are modified (`git status`)

## STOP conditions

- Si algún archivo en "Current state" no coincide con los excerpts (el código ha cambiado desde que se escribió este plan).
- Si un paso de verificación falla dos veces tras un intento razonable de corrección.
- Si el fix requiere tocar un archivo fuera del scope.
- Si `npm test` revela que otros tests dependen de `CartItem` SIN el campo `discount` y rompen — reportar cuáles, no modificarlos sin autorización.
- Si `cart.mjs` legacy todavía se importa desde algún bundle activo en producción (verificar con `grep -rn "cart.mjs" --include="*.js" --include="*.astro" --include="*.mjs" | grep -v node_modules | grep -v _archive`).

## Maintenance notes

- Cuando se añada `discount` a `CartItem`, cualquier código que serialice/deserialice carritos (URL hash sharing, service worker sync) debe manejar el nuevo campo. `sanitizeCart` ya es tolerante a campos extras, así que la deserialización es segura.
- Si en el futuro se añade paginación al carrito, la lógica de `saveCart` que restaura estado anterior debe revisarse.
- La key legacy `cart` debe eliminarse completamente cuando `src/js/` se depreque por completo.
- El toast de error de quota usa Bootstrap classes (`alert-warning`, `btn-close`) — si se migra de Bootstrap, actualizar este componente.
