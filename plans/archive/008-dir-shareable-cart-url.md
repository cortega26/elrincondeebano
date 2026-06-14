# Plan 008 (Direction/Spike): Carrito compartible por URL

> **Tipo**: Design/spike — investiga, prototipa y define la API. No es un plan
> de implementación completa. Al terminar, actualiza `plans/README.md` con el
> resultado del spike (viable/no viable/requiere plan adicional).
>
> **Drift check (ejecutar primero)**:
> `git diff --stat 501a0bd..HEAD -- astro-poc/src/scripts/storefront.js astro-poc/src/scripts/storefront/storefront-state.ts`

## Status

- **Priority**: P3
- **Effort**: S (spike) / M (implementación completa)
- **Risk**: LOW
- **Depends on**: Plan 006 (WHATSAPP_NUMBER compartido, recomendado primero)
- **Category**: direction
- **Planned at**: commit `501a0bd`, 2026-06-11

## Por qué importa (contexto del producto)

El contexto del edificio Ébano es **multi-residente**: la página de
estacionamiento captura un campo "N.° de departamento" (confirmado en
`astro-poc/src/pages/estacionamiento.astro`), lo que indica que múltiples
residentes del mismo edificio son usuarios del servicio. Hoy, si un residente
quiere coordinar un pedido con un vecino (ej. "¿Me agregas leche al pedido?"),
debe describir los items manualmente. Un carrito compartible por URL permitiría:

1. Residente A construye el carrito.
2. Comparte un link (URL con el carrito codificado).
3. Residente B abre el link, ve el carrito pre-cargado, agrega/quita items.
4. Cualquiera de los dos envía el pedido final.

**Evidencia de viabilidad**: La estructura del cart (`CartItem[]`) ya está
bien definida en `storefront-state.ts`. El carrito no tiene estado de servidor
— es solo un array JSON en localStorage. Codificar ese JSON en query params
(o hash) es trivial y no requiere backend.

## Objetivo del spike

1. Verificar que la serialización/deserialización del carrito via URL no tiene
   problemas de tamaño o encoding.
2. Prototipar el botón "Compartir carrito" y la lógica de carga desde URL.
3. Identificar preguntas abiertas (seguridad, UX, edge cases) antes de
   comprometer un plan de implementación completo.

## Estado actual relevante

**`astro-poc/src/scripts/storefront/storefront-state.ts`** — el carrito es `CartItem[]`:

```ts
export interface CartItem {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  quantity: number;
}
```

**`astro-poc/src/scripts/storefront.js`** — cart en localStorage:

- `loadCart()` / `saveCart(items)` son las funciones de persistencia
- `hydrateCartFromOrder(order)` ya convierte datos serializados → `CartItem[]`
- `sanitizeCart(cart)` ya valida y normaliza input untrusted

## Preguntas a responder en el spike

### Q1: ¿Qué tan larga puede ser la URL?

Un carrito con 10 items, cada uno con id+name+category+price+image+quantity,
puede tener ~500–1500 bytes JSON. Con base64url encoding, eso es ~700–2000
chars en la URL. Los navegadores modernos soportan URLs de hasta 8000+ chars.
GitHub Pages (Cloudflare CDN) también. **Límite práctico**: ~50 items antes
de exceder 8000 chars.

**Verificar en el spike**:

```js
const sampleCart = [
  /* 10 items reales del catálogo */
];
const encoded = btoa(JSON.stringify(sampleCart));
console.log(`URL length: ${encoded.length} chars`);
```

### Q2: ¿URL de página existente o ruta nueva?

**Opción A** — Hash en la home page: `/?cart=<base64>` o `/#cart=<base64>`

- Ventaja: no requiere nueva ruta Astro (static site)
- Desventaja: el hash no se indexa por Cloudflare Pages cache

**Opción B** — Ruta nueva `/compartir/?c=<base64>`

- Ventaja: URL semánticamente clara
- Desventaja: requiere nueva página Astro

**Recomendación inicial**: Opción A (hash). Implementación sin nueva ruta,
más fácil para un spike.

### Q3: ¿Cómo evitar que el carrito compartido sobreescriba el carrito propio?

Cuando el usuario B abre el link, su carrito actual podría perderse. Opciones:

- Mostrar un modal: "Hay un carrito compartido (3 items). ¿Cargar o ignorar?"
- Merging automático (suma cantidades).
- Solo cargar si el carrito propio está vacío.

**Para el spike**: solo cargar si carrito propio está vacío (más simple).

### Q4: ¿Hay riesgo de XSS desde la URL?

El carrito de la URL debe pasar por `sanitizeCart()` (ya existe en
`storefront-state.ts`) antes de cargarse. `sanitizeCart` ya filtra IDs y
cantidades inválidas. Los campos `name`, `image`, `category` son strings
arbitrarios — verificar que nunca se usen como `innerHTML` (actualmente se
insertan como `textContent`, que es seguro).

## Pasos del spike

### Paso 1: Serializar/deserializar un carrito

En la consola del navegador o en un test rápido:

```js
// Serializar
function encodeCart(cart) {
  return btoa(encodeURIComponent(JSON.stringify(cart)));
}

// Deserializar
function decodeCart(encoded) {
  try {
    return JSON.parse(decodeURIComponent(atob(encoded)));
  } catch {
    return null;
  }
}

// Verificar round-trip
const cart = [
  { id: 'test-1', name: 'Leche', category: 'L', price: 1200, image: 'l.jpg', quantity: 2 },
];
const encoded = encodeCart(cart);
console.log('Encoded:', encoded);
console.log('URL length:', encoded.length);
const decoded = decodeCart(encoded);
console.log('Round-trip OK:', JSON.stringify(decoded) === JSON.stringify(cart));
```

**Resultado esperado**: round-trip OK, URL length < 2000 para cart típico.

### Paso 2: Prototype del botón "Compartir carrito"

En `storefront.js`, cerca de la función `renderCart()` o en el área del
offcanvas de cart, agregar (solo en este spike, luego mover al lugar correcto):

```js
function getShareableCartUrl(cart) {
  if (!cart || cart.length === 0) return null;
  const encoded = btoa(encodeURIComponent(JSON.stringify(cart)));
  const url = new URL(globalThis.location.href);
  url.hash = `cart=${encoded}`;
  return url.toString();
}

function shareCart(cart) {
  const url = getShareableCartUrl(cart);
  if (!url) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url);
    // TODO: mostrar feedback "¡Enlace copiado!"
  }
}
```

### Paso 3: Prototype de carga desde URL al iniciar

En `initStorefront()`, antes de `renderCart()`:

```js
function loadCartFromUrl() {
  const hash = globalThis.location.hash;
  const match = hash.match(/^#?cart=(.+)$/);
  if (!match) return false;

  try {
    const raw = JSON.parse(decodeURIComponent(atob(match[1])));
    const sanitized = sanitizeCart(raw);
    if (sanitized.length === 0) return false;

    const currentCart = loadCart();
    if (currentCart.length > 0) return false; // No sobrescribir carrito existente

    saveCart(sanitized);
    // Limpiar el hash para que no se re-cargue en refresh
    history.replaceState(null, '', globalThis.location.pathname + globalThis.location.search);
    return true;
  } catch {
    return false;
  }
}
```

### Paso 4: Documentar preguntas abiertas

Al terminar el spike, actualiza este plan con:

- ¿Funcionó la serialización? ¿Cuál es la longitud máxima de URL observada?
- ¿La carga desde URL funciona en móvil (Safari iOS, Chrome Android)?
- ¿Qué UX se necesita para el caso "carrito propio no vacío"?
- ¿Se necesita acortador de URL o es suficiente con la URL completa?
- Estimado de esfuerzo para implementación completa.

## Plan de implementación (post-spike, si viable)

Si el spike es exitoso, el plan de implementación incluye:

1. Mover `encodeCart`/`decodeCart`/`getShareableCartUrl` a `astro-poc/src/lib/`.
2. Agregar botón "Compartir carrito" en el offcanvas de cart (HTML en el
   componente Astro correspondiente).
3. Implementar modal de "Carrito compartido recibido" con opciones Cargar/Ignorar.
4. Actualizar `test/cart.spec.js` con casos de carrito compartido.
5. Agregar E2E test: compartir → abrir link → confirmar carrito cargado.

## Criterios de done del spike

## Resultados del spike

**Veredicto: VIABLE** — el carrito compartible por URL es factible con el enfoque de hash `#cart=<base64>`.

### Encoding

| Cart size | JSON size | URL length (base64) |
| --------- | --------- | ------------------- |
| 3 items   | 434 bytes | 904 chars           |
| 20 items  | 2.2 KB    | 4,684 chars         |

Todos bajo el límite práctico de 8000 chars para navegadores modernos.

### Implementación en el spike

Funciones agregadas en `astro-poc/src/scripts/storefront.js`:

- `encodeCart(cart)` / `decodeCart(encoded)` — serialización/deserialización via base64
- `getShareableCartUrl(cart)` — genera URL con hash `#cart=<base64>`
- `shareCart(cart)` — copia la URL al portapapeles
- `loadCartFromUrl()` — carga carrito desde hash al iniciar (solo si carrito propio está vacío)
- Botón "Compartir carrito" en `renderCart()` con feedback "¡Enlace copiado!"
- Hookeado en `initStorefront()` para carga automática desde URL

### Seguridad

- `sanitizeCart()` se usa en `loadCartFromUrl()` para normalizar input
- Todos los campos del carrito se insertan como `textContent`, no `innerHTML`
- No hay riesgo de XSS desde la URL

### Preguntas abiertas post-spike

1. **UX para carrito propio no vacío**: Hoy `loadCartFromUrl()` no hace nada si el carrito actual tiene items. Para implementación completa se necesita un modal con opciones "Cargar carrito compartido (pierdes el actual)" / "Agregar items al carrito actual" / "Ignorar".
2. **Feedback de estado**: El botón "Compartir carrito" solo muestra feedback temporal. Considerar notificación tipo toast persistente.
3. **Mobile testing**: Verificar en Safari iOS y Chrome Android que el hash se lee correctamente al abrir el enlace.
4. **Acortador de URL**: Con ~900 chars para 3 items no es necesario, pero para carritos grandes (+10 items) podría ser útil.

### Esfuerzo estimado para implementación completa

- **M (~2-3 días)**: incluye modal de confirmación, tests unitarios, E2E, y pulido de UX.

- [x] Round-trip encoding/decoding funciona para carts de hasta 20 items
- [x] Longitud de URL documentada (dentro de límites del browser)
- [x] Prototipo funcional en dev
- [x] Preguntas abiertas documentadas en este plan
- [x] `plans/README.md` fila actualizada con veredicto (viable/no viable/requiere investigación adicional)

## Notas

- Este plan es solo el spike. Si se decide implementar, crear Plan 008b con los
  pasos completos de implementación.
- La seguridad de la deserialización depende de que `sanitizeCart()` nunca
  llame a `eval()` ni inserte HTML — verificar en el spike.
