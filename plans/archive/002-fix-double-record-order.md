# Plan 002: Corregir doble llamada a recordOrder() que corrompe personalization

> **Instrucciones para el ejecutor**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación antes de avanzar. Si algo en "Condiciones de STOP"
> ocurre, detente e informa — no improvises.
> Al terminar, actualiza la fila de este plan en `plans/README.md`.
>
> **Drift check (ejecutar primero)**:
> `git diff --stat 501a0bd..HEAD -- astro-poc/src/scripts/storefront.js`
> Si el archivo cambió, compara los excerpts de "Estado actual" con el código
> vivo. Si la función `markOrderAsSent` ya no llama a `recordOrder`, este plan
> puede estar resuelto — verifica y reporta.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `501a0bd`, 2026-06-11

## Por qué importa

Cuando un usuario completa un pedido, el flujo es:

1. Hace clic en "Resolver pedido" → se abre el diálogo de confirmación.
2. Hace clic en "Confirmar envío" → `executeSendOrder()` se ejecuta.
3. WhatsApp se abre con el pedido pre-formateado.
4. Aparece un toast con "Marcar como enviado". El usuario hace clic.
5. `markOrderAsSent()` se ejecuta.

El problema: tanto `executeSendOrder()` (paso 2) como `markOrderAsSent()` (paso 5)
llaman `personalizationEngine.recordOrder(...)`. Esto significa que cada pedido
se registra **dos veces** en `recentOrders` y `lastOrder`, y que el
`orderedCount` de cada producto se incrementa el doble de lo que debería. El
motor de personalización (que rankea productos para mostrar "frecuentes") recibe
señales falsas y distorsiona las recomendaciones.

El fix es eliminar la llamada a `recordOrder` de `markOrderAsSent()`: el pedido
debe quedar registrado en el momento en que el usuario confirma el envío
(paso 2), no cuando marca que ya lo envió.

## Estado actual

**`astro-poc/src/scripts/storefront.js` — `executeSendOrder` (líneas 1103–1128)**:

```js
function executeSendOrder(pending) {
  if (!pending) { return; }
  const { message, cart, selectedPayment, profile, substitutionPreference } = pending;

  // PRIMERA llamada a recordOrder ← CORRECTA, debe quedarse
  personalizationEngine.recordOrder(cart, profile, selectedPayment, substitutionPreference);

  syncProfileSummary(profile, loadLastOrder());
  setRepeatButtonsState(loadLastOrder());
  renderPersonalizedProducts();
  const encodedMessage = encodeURIComponent(message);
  trackAnalyticsEvent('whatsapp_checkout_submit', { ... });
  globalThis.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`, '_blank');
  closeOrderConfirmationDialog();
  showPostSubmitToast();
}
```

**`astro-poc/src/scripts/storefront.js` — `markOrderAsSent` (líneas 1182–1199+)**:

```js
function markOrderAsSent() {
  const cart = loadCart();
  if (cart.length === 0) {
    return;
  }
  const profile = readProfileForm();
  const selectedPayment = getSelectedPaymentValue();
  const substitutionPreference = getSelectedSubstitutionPreference();

  // SEGUNDA llamada a recordOrder ← BUG, debe eliminarse
  personalizationEngine.recordOrder(cart, profile, selectedPayment, substitutionPreference);

  saveCart([]);
  saveStoredJson(STORAGE_SENT_KEY, Date.now());
  updateBadge([], { animate: true });
  renderCart([]);
  // ... más UI updates
}
```

**Flujo de clicks confirmado** (líneas 1640–1653):

```js
// Click en "Confirmar envío" (#order-confirm-send)
const pending = pendingOrderData;
pendingOrderData = null;
executeSendOrder(pending); // ← llama recordOrder la primera vez

// Click en "Marcar como enviado" (#order-mark-sent)
markOrderAsSent(); // ← llama recordOrder la segunda vez (BUG)
```

## Comandos necesarios

| Propósito | Comando             | Éxito esperado |
| --------- | ------------------- | -------------- |
| Tests     | `npm test`          | exit 0         |
| Typecheck | `npm run typecheck` | exit 0         |
| Lint      | `npm run lint`      | exit 0         |

## Alcance

**En scope**:

- `astro-poc/src/scripts/storefront.js` — eliminar la llamada `personalizationEngine.recordOrder(...)` de `markOrderAsSent()`
- `test/` — agregar o actualizar test para `markOrderAsSent` (ver Plan de tests)

**Fuera de scope** (no tocar):

- `astro-poc/src/scripts/storefront/personalization.js` — la lógica de `recordOrder` en sí es correcta
- `executeSendOrder` — esta función NO se modifica; la primera llamada a `recordOrder` es correcta
- Cualquier otro archivo

## Workflow git

- Rama: `fix/double-record-order-002`
- Commit: `fix: prevent duplicate recordOrder() call on mark-as-sent flow`
- NO hacer push ni abrir PR sin instrucción explícita.

## Pasos

### Paso 1: Verificar el estado actual

```bash
grep -n "personalizationEngine.recordOrder" astro-poc/src/scripts/storefront.js
```

**Esperado**: dos líneas, una alrededor de la línea 1110 y otra alrededor de
la línea 1192. Si ves solo una línea, el bug puede estar ya resuelto — reporta
sin modificar nada.

### Paso 2: Eliminar la llamada duplicada de `markOrderAsSent`

Abre `astro-poc/src/scripts/storefront.js` y en la función `markOrderAsSent`
(cerca de la línea 1182), elimina **solo** estas 4 líneas:

```js
const profile = readProfileForm();
const selectedPayment = getSelectedPaymentValue();
const substitutionPreference = getSelectedSubstitutionPreference();
personalizationEngine.recordOrder(cart, profile, selectedPayment, substitutionPreference);
```

> **ATENCIÓN**: Las variables `profile`, `selectedPayment` y `substitutionPreference`
> solo se usan para la llamada a `recordOrder` en `markOrderAsSent`. Si el
> código después de `recordOrder` en esa función NO usa ninguna de esas tres
> variables, puedes eliminar sus declaraciones también. Verifica antes de
> eliminar.

La función `markOrderAsSent` debe quedar empezando así después del cambio:

```js
function markOrderAsSent() {
  const cart = loadCart();
  if (cart.length === 0) {
    return;
  }

  saveCart([]);
  saveStoredJson(STORAGE_SENT_KEY, Date.now());
  // ... resto de lógica UI sin cambios
}
```

**Verificar**: `grep -n "personalizationEngine.recordOrder" astro-poc/src/scripts/storefront.js`
→ debe retornar exactamente **1 línea** (la de `executeSendOrder`, ~línea 1110).

### Paso 3: Ejecutar lint

```bash
npm run lint
```

**Verificar**: exit 0, sin warnings. Si hay un error de "variable declarada pero
no usada" en `markOrderAsSent`, es porque eliminaste la llamada pero dejaste la
declaración de la variable — vuelve al paso 2 y elimina también la declaración.

### Paso 4: Ejecutar tests

```bash
npm test
```

**Verificar**: exit 0. Si algún test falla, verifica que el fallo sea
pre-existente (no introducido por este cambio) antes de reportar.

## Plan de tests

El test existente más cercano es `test/checkout.test.js`. Revisa su estructura
para seguir el mismo patrón.

Agrega una regresión. Como `markOrderAsSent` no está exportada como unidad
aislada, una opción aceptada es un guardrail en `test/storefront-record-order.guardrail.test.js`
que verifique que `storefront.js` contiene una sola llamada a
`personalizationEngine.recordOrder(...)`.

Si en el futuro el flujo se extrae a un módulo testeable, reemplaza ese
guardrail por un test de comportamiento que verifique:

```
describe('markOrderAsSent', () => {
  it('no llama a personalizationEngine.recordOrder', () => {
    // Setup: cart con ítems en localStorage
    // Action: llamar markOrderAsSent()
    // Assert: personalizationEngine.recordOrder no fue llamado
    //         (verificar con spy o mock de recordOrder)
    // Assert: saveCart fue llamado con [] (carrito limpio)
  });
});
```

**Verificar tests**: `npm test` → exit 0, incluyendo el nuevo test.

## Criterios de done

- [ ] `grep -n "personalizationEngine.recordOrder" astro-poc/src/scripts/storefront.js` → exactamente 1 resultado
- [ ] La 1 resultado es en `executeSendOrder`, NO en `markOrderAsSent`
- [ ] `npm run lint` → exit 0
- [ ] `npm test` → exit 0
- [ ] Regresión agregada para impedir que vuelva la segunda llamada a `recordOrder`
- [ ] `plans/README.md` fila actualizada a DONE

## Condiciones de STOP

Detente e informa si:

- La función `markOrderAsSent` usa `profile`, `selectedPayment` o
  `substitutionPreference` para algo ADEMÁS de llamar a `recordOrder` (lo que
  significaría que el refactor es más complejo de lo esperado).
- El grep inicial muestra más de 2 llamadas a `recordOrder` (habría un tercer
  sitio no contemplado en este plan).
- Algún test falla de forma inesperada después del cambio.

## Notas de mantenimiento

- Si en el futuro se agrega lógica a `markOrderAsSent` que requiera datos del
  perfil (profile, payment), habrá que reintroducir esas lecturas — no depender
  del recordOrder eliminado.
- El test de regresión de este plan debe ejecutarse siempre que se modifique
  el flujo de checkout.
