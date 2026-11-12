# Plan 283: "Repetir último pedido" conserva descuentos y las cantidades son siempre enteras

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 6d0a29af..HEAD -- astro-poc/src/scripts/storefront/personalization.js astro-poc/src/scripts/storefront/storefront-state.ts astro-poc/src/scripts/storefront/dom-handlers.js test/storefront-state.spec.js test/storefront.personalization.spec.js test/storefront-totals.spec.js`
> (Si el plan 282 ya se fusionó, `storefront-state.ts` mostrará su diff — es esperado; compara solo las funciones citadas abajo.)

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/282-cart-price-index.md` (mismos archivos; el Step 3 reutiliza su proyección)
- **Category**: bug
- **Planned at**: commit `6d0a29af`, 2026-11-12 (Auditoría 13). **Reabre** la corrección del plan 027 (su test usaba un pedido construido a mano con una forma que el escritor real nunca produce).

## Why this matters

Al enviar un pedido, `recordOrder` guarda los ítems **sin** el campo
`discount`. Cuando el cliente pulsa "Repetir último pedido",
`hydrateCartFromOrder` lee `item.discount` (siempre `undefined`) y el
carrito muestra cada producto en oferta a precio completo: el total se
infla, y si el producto no está renderizado en la página, ese precio sin
descuento llega a WhatsApp (el plan 282 lo corrige en checkout, pero la
vista sigue mostrando el total equivocado hasta entonces). El test que
"cubre" esto alimenta a mano un pedido con `discount: 300`, forma que el
escritor real no produce — por eso la auditoría 12 lo dio por bueno. Aparte,
`clampQty` acepta fracciones (`0.5`, `1e-9`) que llegan desde un link
compartido manipulado y terminan en el mensaje ("0.5 × $2.000").

## Current state

- `astro-poc/src/scripts/storefront/personalization.js:92-110` — escritor:
  ```js
  function recordOrder(cart, profile, payment, substitutionPreference) {
    const timestamp = new Date().toISOString();
    const order = {
      timestamp,
      payment,
      substitutionPreference,
      profile,
      items: cart.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        price: item.price,
        quantity: item.quantity,
        image: item.image,
      })),
    };
    saveLastOrder(order);
    saveRecentOrders([order, ...loadRecentOrders()]);
  ```
- `astro-poc/src/scripts/storefront/storefront-state.ts:206-223` — lector:
  `hydrateCartFromOrder(order)` mapea `discount: item.discount` →
  `normalizeCartItem` lo convierte a `0` si es `undefined`.
- `storefront-state.ts:18-20`:
  ```ts
  export function clampQty(value: unknown): number {
    return Math.min(Math.max(parseNumber(value, 0), 0), MAX_CART_ITEM_QTY);
  }
  ```
  Usada por `normalizeCartItem` (33), `getCartState` (128, 131),
  `toSharedCartPayload` (256), `parseSharedCartPayload` (324) y
  `cart-controller.js:71`.
- `astro-poc/src/scripts/storefront/dom-handlers.js:84-100` — `repeatLastOrder`:
  `const nextCart = hydrateCartFromOrder(order); saveCart(nextCart); setCart(nextCart); updateBadge(...); renderCart(nextCart, …)`
  — renderiza el carrito hidratado directamente, sin la proyección de precios vivos.
- `test/storefront-state.spec.js:294-307` — el test engañoso ("preserves
  discounts so repeated orders keep their effective total") con fixture a mano.
- `test/storefront.personalization.spec.js:33-61` — `createEngine({...})`
  con celdas en memoria (`makeCell`) para `saveLastOrder`/`loadLastOrder`;
  ejemplar para el test de ida y vuelta.
- Tests de `clampQty`: `test/storefront-state.spec.js:39-44`.

## Commands you will need

| Purpose    | Command                                                                                                                                                       | Provenance | Expected on success |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install    | `HUSKY=0 npm ci`                                                                                                                                              | declared   | exit 0              |
| Unit focus | `npx vitest run test/storefront-state.spec.js test/storefront.personalization.spec.js test/storefront-totals.spec.js test/storefront.cart-controller.spec.js` | declared   | verde               |
| Suite raíz | `CI_SKIP_BUILD_CONTRACT=1 npx vitest run`                                                                                                                     | declared   | verde               |
| Typecheck  | `npm run typecheck`                                                                                                                                           | declared   | exit 0              |
| Lint       | `npm run lint`                                                                                                                                                | declared   | exit 0              |
| E2E cart   | `npm run build && PLAYWRIGHT_SKIP_BUILD=1 npx playwright test -c playwright.astro.config.ts test/e2e-astro/cart-ux.spec.ts`                                   | declared   | verde               |

## Scope

**In scope**:

- `astro-poc/src/scripts/storefront/personalization.js` (solo `recordOrder`)
- `astro-poc/src/scripts/storefront/storefront-state.ts` (solo `clampQty`)
- `astro-poc/src/scripts/storefront/dom-handlers.js` (solo `repeatLastOrder`)
- `test/storefront-state.spec.js`, `test/storefront.personalization.spec.js`

**Out of scope**:

- Migrar pedidos ya guardados sin `discount` — se comportan como hoy (no hay forma de recuperar el dato).
- `hydrateCartFromOrder` (ya lee `discount`; no lo cambies).
- `order-submit.js`, `service-worker.js`, `catalog.ts`.

## Git workflow

- Branch: `advisor/283-repeat-order-discount`.
- Commits estilo `fix(storefront): keep discounts when repeating the last order (plan 283)`.

## Steps

### Step 0: Baseline

Install + unit focus + suite raíz + typecheck + lint verdes en el checkout limpio.
Confirma que el plan 282 está fusionado: `grep -n "applyCartPriceIndex" astro-poc/src/scripts/storefront.js` → match.

**Verify**: todo verde y match presente (si no → STOP: dependencia).

### Step 1: Test de ida y vuelta que hoy falla

En `test/storefront.personalization.spec.js` añade
`it('recordOrder → loadLastOrder → hydrateCartFromOrder keeps discounts (plan 283)')`:
usa `createEngine()`, registra un carrito con una línea
`{ id:'p1', name:'Leche', category:'L', price:1200, discount:300, image:'', quantity:2 }`
y otra sin descuento; recupera el pedido con el `loadLastOrder` de la misma
celda (expón la celda en el helper o crea una variante local del helper —
no modifiques el comportamiento de los tests existentes); pásalo por
`hydrateCartFromOrder` (impórtalo de `storefront-state.js`) y asserta
`getCartState(cart).totalAmount === (1200-300)*2 + <precio2>*qty2`.

**Verify**: el test nuevo **falla** en el código actual (pega el output en tus notas).

### Step 2: Guardar `discount`

En `recordOrder`, añade `discount: item.discount,` al map de ítems (entre
`price` y `quantity`). Reemplaza el test engañoso de
`test/storefront-state.spec.js:294-307`: conserva su nombre pero agrega una
línea de comentario `// Plan 283: the real writer round-trip lives in storefront.personalization.spec.js`
— no lo borres (sigue documentando el lector).

**Verify**: el test del Step 1 ahora pasa; unit focus verde.

### Step 3: Repetir pedido muestra precios vivos

En `dom-handlers.js` `repeatLastOrder`: después de `saveCart(nextCart)` exitoso,
obtén la proyección de lectura con la dependencia `loadCart` (si
`createDomHandlers` no la recibe aún, añádela a sus deps y pásala desde
`storefront.js` donde se construye `createDomHandlers` — un solo cambio en
la lista de deps) y usa ese resultado para `setCart`, `updateBadge`,
`renderCart`, `renderCompanionSuggestions` y `syncAllActionAreas`. NO vuelvas
a guardar la proyección (la regla de solo lectura del plan 219/282 sigue).

Si añadir `loadCart` a las deps de `createDomHandlers` rompe el test de
caracterización de deps del plan 265 (lista de 39 deps inyectadas), actualiza
ese test con la nueva dep — es el único cambio permitido en él.

**Verify**: unit focus verde; `grep -n "loadCart" astro-poc/src/scripts/storefront/dom-handlers.js` → usado en `repeatLastOrder`.

### Step 4: `clampQty` entero

Cambia a:

```ts
export function clampQty(value: unknown): number {
  return Math.min(Math.max(Math.floor(parseNumber(value, 0)), 0), MAX_CART_ITEM_QTY);
}
```

Añade casos en el `describe('clampQty')` existente: `0.5 → 0`, `1.5 → 1`,
`1e-9 → 0`, `'2.9' → 2`; y en el describe de `parseSharedCartPayload`: una
entrada con `quantity: 0.5` se descarta, `quantity: 2.7` queda como `2`.

**Verify**: unit focus + suite raíz verdes.

### Step 5: Regresión

typecheck, lint, E2E cart.

**Verify**: verdes.

## Test plan

- Ida y vuelta real `recordOrder → loadLastOrder → hydrateCartFromOrder` (falla antes, pasa después — demostrado).
- 4 casos nuevos de `clampQty` + 2 de `parseSharedCartPayload`.
- E2E `cart-ux.spec.ts` sin regresiones.

## Done criteria

- [ ] `grep -n "discount: item.discount" astro-poc/src/scripts/storefront/personalization.js` → 1 match
- [ ] `grep -n "Math.floor" astro-poc/src/scripts/storefront/storefront-state.ts` → dentro de `clampQty`
- [ ] Test de ida y vuelta demostrado rojo→verde (output en el informe)
- [ ] Unit focus, suite raíz, typecheck, lint, E2E cart verdes
- [ ] `git diff --name-only main...HEAD` ⊆ In scope (+ el test de deps del plan 265 si aplicó el Step 3)
- [ ] Fila 283 en `plans/README.md`

## STOP conditions

- El plan 282 no está fusionado.
- El test del Step 1 pasa sin cambios (entonces el diagnóstico es incorrecto: reporta).
- `Math.floor` en `clampQty` rompe algún test que asserta cantidades fraccionarias como válidas (reporta cuál; no lo cambies).
- `repeatLastOrder` necesitaría cambios fuera de su cuerpo y de la lista de deps.

## Maintenance notes

- Cualquier campo nuevo de `CartItem` que afecte el precio debe añadirse también a `recordOrder`; el test de ida y vuelta lo detecta.
- **Deferred:** migrar pedidos antiguos sin `discount` — no vale la pena (expiran al siguiente pedido).
