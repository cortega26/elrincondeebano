# Plan 010 (Direction/Spike): Notificaciones de productos favoritos en stock

> **Tipo**: Design/spike — investiga viabilidad y define alcance. No implementa
> funcionalidad completa. Al terminar, actualiza `plans/README.md`.
>
> **Drift check (ejecutar primero)**:
> `git diff --stat 501a0bd..HEAD -- astro-poc/src/scripts/storefront/personalization.js astro-poc/src/scripts/storefront/storage-contract.ts`

## Status

- **Priority**: P3
- **Effort**: S (spike) / L (implementación completa)
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `501a0bd`, 2026-06-11

## Por qué importa (contexto del producto)

El motor de personalización ya registra `orderedCount` y `lastOrderedAt` por
producto (en `personalization.js`). Cuando un producto frecuente se agota,
el usuario no tiene forma de saber cuándo vuelve — debe visitar la tienda
manualmente. Para un público de residentes del edificio que hacen pedidos
recurrentes (evidenciado por el tracking de `recentOrders`), saber cuándo
"el pan de campo volvió" es un pain point real.

**Evidencia en el codebase**:

- `personalization.js:81–114` — `getPersonalizedProductIds()` puede calcular
  los productos más pedidos por el usuario
- `storefront-state.ts` — `CartItem.id` es el identificador estable del producto
- `data/product_data.json` — tiene campo de stock/disponibilidad por producto
  (verificar si existe un campo `available` o `in_stock`)

**Complejidad del feature**: alta. Requiere:

1. Mecanismo para que el usuario marque favoritos ("quiero ser notificado")
2. Fuente de datos del estado de stock actual
3. Canal de notificación (in-page, email, WhatsApp, push)

Este spike determina si la v1 es factible con medios in-page simples
(sin backend, sin push notifications).

## Preguntas a responder en el spike

### Q1: ¿Existe ya un campo de stock en `product_data.json`?

```bash
node -e "
const data = require('./data/product_data.json');
const sample = data.products?.slice(0,3) || data.slice?.(0,3) || [];
console.log(JSON.stringify(Object.keys(sample[0] || {}), null, 2));
"
```

Si hay un campo `available`, `in_stock`, `stock_status` o similar:
la notificación puede ser puramente in-page (sin backend).

Si no hay campo de stock: se necesita una fuente externa (Google Sheets con
estado de stock por SKU, similar al CSV de bookings del parking).

### Q2: ¿Los productos salen y vuelven de stock frecuentemente?

Verificar con el operador. Si los productos siempre están disponibles, este
feature no tiene valor. Si hay productos que se agotan y vuelven (ej. pan
artesanal los martes), el feature tiene uso real.

### Q3: ¿Qué canal de notificación es viable sin backend?

| Canal                    | Requisito backend                          | Complejidad     |
| ------------------------ | ------------------------------------------ | --------------- |
| Banner in-page al cargar | Solo localStorage + JSON estático de stock | S               |
| WhatsApp message         | Clic del usuario en "Avísenme"             | S (semi-manual) |
| Email                    | Servicio de email (Mailchimp, etc.)        | L               |
| Web Push                 | Service worker + subscription              | L               |

**Recomendación para v1**: Banner in-page + WhatsApp opt-in (el operador envía
manualmente un WhatsApp al que se interesa).

### Q4: ¿Cómo almacena el usuario sus favoritos?

El storage contract actual (`storage-contract.ts`) no tiene una clave de
"favoritos". Para v1, se puede agregar una clave al localStorage:
`astro-poc-favorites: string[]` (array de product IDs).

Verificar si esto colisiona con alguna clave existente:

```bash
grep -n "FAVORITES\|favorites\|wishlist" astro-poc/src/scripts/storefront/ -r
```

## Prototipo de v1 (in-page, sin backend)

Si Q1 confirma que hay campo de stock en el JSON:

1. **Favoritos en localStorage**: `astro-poc-favorites: ["sku-1", "sku-3"]`

2. **Botón de favorito en ProductCard**: ícono de corazón ♡ / ♥ junto al
   botón de agregar, que toggle el producto en la lista de favoritos.

3. **Banner al cargar**: si el usuario tiene favoritos marcados Y alguno tiene
   `available: false` en el JSON actual → no mostrar nada. Si alguno volvió a
   `available: true` desde la última visita (comparar con timestamp en localStorage)
   → mostrar banner: "¡Leche descremada está disponible de nuevo!"

4. **Sin backend**: el estado de stock se lee del JSON estático del build.
   Si el operador actualiza el JSON y redeploya, el banner aparece en la
   próxima visita del usuario.

**Limitación de v1**: el usuario ve el banner solo en la próxima visita al
sitio, no en tiempo real.

## Pasos del spike

### Paso 1: Verificar campo de stock en product_data.json

```bash
node -e "
const fs = require('fs');
const raw = fs.readFileSync('data/product_data.json', 'utf8');
const data = JSON.parse(raw);
const products = Array.isArray(data) ? data : (data.products || []);
const sample = products.slice(0, 3);
console.log('Keys:', Object.keys(sample[0] || {}));
console.log('Sample:', JSON.stringify(sample[0], null, 2));
"
```

**Si hay campo de stock**: continuar con Paso 2.
**Si no hay campo de stock**: el spike necesita un plan alternativo (Google
Sheets CSV como el parking). Documentar en este plan y evaluar esfuerzo.

### Paso 2: Explorar el storage contract actual

```bash
cat astro-poc/src/scripts/storefront/storage-contract.ts
```

Verificar si agregar `astro-poc-favorites` como nueva clave viola alguna
invariante del contrato actual.

### Paso 3: Prototype de favorito toggle en consola

En el browser (consola del desarrollador):

```js
// Toggle favorito
function toggleFavorite(productId) {
  const key = 'astro-poc-favorites';
  const current = JSON.parse(localStorage.getItem(key) || '[]');
  const idx = current.indexOf(productId);
  if (idx >= 0) {
    current.splice(idx, 1);
  } else {
    current.push(productId);
  }
  localStorage.setItem(key, JSON.stringify(current));
  return current;
}

// Test
console.log(toggleFavorite('leche-descremada-1lt'));
console.log(toggleFavorite('leche-descremada-1lt'));
console.log(localStorage.getItem('astro-poc-favorites'));
```

**Verificar**: localStorage tiene el array correcto y el toggle funciona.

### Paso 4: Documentar preguntas abiertas y estimado

Al terminar el spike:

- ¿Hay campo de stock en el JSON? (sí/no + nombre del campo)
- ¿Los productos se agotan con frecuencia suficiente para justificar el feature?
- ¿El banner in-page sin tiempo real es suficiente o necesita push?
- Esfuerzo estimado para v1 (in-page): S/M/L

## Criterios de done del spike

- [ ] Q1 respondida (campo de stock verificado o ausencia confirmada)
- [ ] Q2 respondida (frecuencia de stock-outs verificada con operador)
- [ ] Q3 decidida (canal de notificación elegido para v1)
- [ ] Prototype de toggle de favorito funciona en consola del browser
- [ ] Esfuerzo de v1 estimado
- [ ] `plans/README.md` fila actualizada con veredicto

## Notas

- Este es un feature de "returning user" — solo aporta valor si hay usuarios
  que vuelven regularmente (lo que el tracking de recentOrders sugiere que sí).
- V1 intencional con scope mínimo: solo in-page, solo campo de stock estático.
  Las notificaciones push requieren un plan separado de complejidad L.
- Relacionado con Plan 009 (slots): si ambos se implementan, el UX debe ser
  coherente (mismo lenguaje visual para "preferencias del usuario").
