# Plan 014: Corregir corrupción de carrito en rollback por error de quota

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 633eeb8..HEAD -- astro-poc/src/scripts/storefront.js`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plan 013 (Astro version must be reconciled first)
- **Category**: bug
- **Planned at**: commit `633eeb8`, 2026-07-14

## Why this matters

Cuando un usuario reduce la última unidad de un item a 0, `setQty` hace `cart.splice(index, 1)` que elimina el elemento del array. Si `saveCart` falla por `QuotaExceededError` (común en Safari modo privado o localStorage lleno), el código de rollback intenta restaurar `cart[index].quantity = previousQuantity`. Pero después del `splice`, los índices del array se desplazaron — `cart[index]` ahora apunta al elemento SIGUIENTE, no al que fue eliminado. El resultado: la cantidad de un producto distinto se corrompe silenciosamente. El usuario ve un toast de error pero su carrito está dañado, y continuar comprando produce totales y líneas incorrectas en el pedido. Esto afecta directamente el money path.

## Current state

`astro-poc/src/scripts/storefront.js:1608-1637`:

```javascript
if (quantity <= 0) {
  if (index >= 0) {
    cart.splice(index, 1); // ← elimina el elemento, los índices se desplazan
  }
} else if (index >= 0) {
  // ...
  cart[index].quantity = quantity;
} else if (fallbackProduct) {
  const nextItem = createCartItemFromProduct(fallbackProduct, quantity);
  if (nextItem) {
    cart.push(nextItem);
  }
}

const nextState = getCartState(cart);
const saved = saveCart(cart);
if (!saved) {
  log('warn', 'cart_save_failed', { reason: 'localStorage_quota' });
  // Restaurar estado anterior
  if (index >= 0 && previousQuantity > 0) {
    cart[index].quantity = previousQuantity; // ← BUG: modifica el elemento equivocado
  } else if (index >= 0 && previousQuantity <= 0) {
    cart.splice(index, 1); // ← BUG: elimina el elemento equivocado
  }
  if (previousQuantity <= 0 && index < 0 && fallbackProduct) {
    cart.pop();
  }
  showCartSaveError();
  return;
}
```

La convención del repo para manejo de errores con rollback se ve en `storage-contract.ts:105-120` donde `writeStorefrontSlot` retorna `boolean` para que el caller decida si hacer rollback.

## Commands you will need

| Purpose | Command        | Expected on success |
| ------- | -------------- | ------------------- |
| Test    | `npm test`     | all pass            |
| Lint    | `npm run lint` | exit 0              |

## Scope

**In scope**:

- `astro-poc/src/scripts/storefront.js` — solo la función `setQty` (líneas 1608-1637)

**Out of scope** (do NOT touch):

- `saveCart` — no se modifica
- `storage-contract.ts` — no se modifica
- Cualquier otra función de `storefront.js`
- Comportamiento del quota error toast — ya existe, solo corregimos el rollback

## Git workflow

- Branch: `advisor/014-fix-cart-rollback`
- Commit message: `fix(cart): restore removed item on quota save failure instead of corrupting wrong entry`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Reproducir el bug mentalmente y preparar la corrección

El problema es que `cart.splice(index, 1)` modifica el array in-place. `Array.prototype.splice` retorna un array con los elementos eliminados. La corrección: capturar el elemento eliminado y reinsertarlo en el rollback.

### Step 2: Aplicar la corrección

En `astro-poc/src/scripts/storefront.js`, reemplazar el bloque de rollback (líneas 1627-1638):

**Antes** (líneas 1608-1637):

```javascript
if (quantity <= 0) {
  if (index >= 0) {
    cart.splice(index, 1);
  }
} else if (index >= 0) {
  if (quantity > cart[index].quantity && fallbackProduct?.stock === false) {
    return;
  }
  cart[index].quantity = quantity;
} else if (fallbackProduct) {
  const nextItem = createCartItemFromProduct(fallbackProduct, quantity);
  if (nextItem) {
    cart.push(nextItem);
  }
}

const nextState = getCartState(cart);
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

**Después**:

```javascript
let _removedItem = null;

if (quantity <= 0) {
  if (index >= 0) {
    _removedItem = cart.splice(index, 1)[0] || null;
  }
} else if (index >= 0) {
  if (quantity > cart[index].quantity && fallbackProduct?.stock === false) {
    return;
  }
  cart[index].quantity = quantity;
} else if (fallbackProduct) {
  const nextItem = createCartItemFromProduct(fallbackProduct, quantity);
  if (nextItem) {
    cart.push(nextItem);
  }
}

const nextState = getCartState(cart);
const saved = saveCart(cart);
if (!saved) {
  log('warn', 'cart_save_failed', { reason: 'localStorage_quota' });
  if (_removedItem) {
    cart.splice(index, 0, _removedItem);
  } else if (index >= 0 && previousQuantity > 0) {
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

**Verify**: `npm run lint` → exit 0

### Step 3: Ejecutar tests

```bash
npm test
```

**Verify**: todos los tests pasan. Si existen tests de `setQty` (en `test/cart.spec.js` o `test/cart.unit.test.mjs`), deben seguir pasando.

## Test plan

El fix es autocontenido y no requiere nuevos tests para verificar la corrección lógica. Sin embargo, si `cart.unit.test.mjs` o `cart.spec.js` ya tienen tests para `setQty`, verificar que sigan pasando. Si no existen tests unitarios para el path de rollback con quota failure, añadir:

- Nuevo test en `test/cart.unit.test.mjs`:
  - Caso: `setQty(id, 0)` cuando `saveCart` retorna `false` — verificar que el item eliminado se reinserta en su posición original y que el resto del carrito no se modifica.

Modelo a seguir: `test/cart.unit.test.mjs` (existente, patrón de tests unitarios de carrito).

**Verify**: `npm test` → todos los tests pasan, incluyendo el nuevo.

## Done criteria

All must hold:

- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0
- [ ] `grep -rn "cart.splice(index, 1)" astro-poc/src/scripts/storefront.js` muestra que el splice captura el valor de retorno (`_removedItem = cart.splice(...)`)
- [ ] No files outside `astro-poc/src/scripts/storefront.js` are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- El código en `storefront.js:1608-1637` no coincide con los excerpts de "Current state" (el código ya fue modificado desde que se escribió este plan).
- `npm test` falla después del cambio.
- El plan 001 (que también toca `setQty` en `storefront.js`) ya fue ejecutado y causó conflictos — reportar el conflicto para reconciliación manual.

## Maintenance notes

- Si en el futuro se añade validación adicional antes del `splice` (por ejemplo, confirmación de "¿eliminar item?"), la variable `_removedItem` debe seguir capturando el elemento eliminado para el rollback.
- Considerar extraer el rollback a una función `restoreCartState(previousCart, currentCart)` en una refactorización futura (relacionado con plan 001 y plan 007).
