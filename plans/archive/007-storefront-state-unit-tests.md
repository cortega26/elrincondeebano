# Plan 007: Unit tests para storefront-state.ts (desbloquea refactor de cart)

> **Instrucciones para el ejecutor**: Sigue este plan paso a paso. Ejecuta cada
> verificación antes de avanzar. Si algo en "Condiciones de STOP" ocurre,
> detente e informa — no improvises.
> Al terminar, actualiza la fila de este plan en `plans/README.md`.
>
> **Drift check (ejecutar primero)**:
> `git diff --stat 501a0bd..HEAD -- astro-poc/src/scripts/storefront/storefront-state.ts`
> Si el archivo cambió desde este plan, compara los exports exportados contra
> los listados en "Estado actual" antes de escribir tests.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (recomendado después de Plan 002)
- **Category**: tests
- **Planned at**: commit `501a0bd`, 2026-06-11

## Por qué importa

`storefront-state.ts` exporta las 8 funciones y 2 tipos que definen **toda la
lógica de estado del carrito**: parsing de valores, clamping de cantidades,
normalización de IDs e ítems, sanitización del carrito completo, cálculo de
totales, y rehidratación desde un pedido guardado. Este módulo procesa input
potencialmente untrusted (localStorage, datos del usuario) y aplica
`MAX_CART_ITEM_QTY = 50` como límite de seguridad.

A pesar de ser el núcleo del carrito, tiene **cero tests**. Esto significa:

- Los edge cases (qty negativa, NaN, null items, carrito vacío, overflow de MAX)
  no están cubiertos.
- Cualquier refactor del carrito (Plan futuro ARCH-01) no tiene red de seguridad.
- Si `parseNumber` o `clampQty` cambian de comportamiento, ningún test lo detecta.

Este plan es P1 porque desbloquea con seguridad cualquier cambio futuro en la
lógica de cart.

## Estado actual

**`astro-poc/src/scripts/storefront/storefront-state.ts` — exports**:

```ts
export const MAX_CART_ITEM_QTY = 50;

export interface CartItem {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  quantity: number;
}

export function parseNumber(value: unknown, fallback = 0): number;
// Devuelve Number(value) si es finite, fallback si no.

export function clampQty(value: unknown): number;
// Min(max(parseNumber(value, 0), 0), MAX_CART_ITEM_QTY)

export function normalizeId(value: unknown): string;
// String(value).trim() si es string|number, '' si no.

export function normalizeCartItem(item: unknown): CartItem | null;
// Valida y normaliza un ítem; retorna null si id vacío o qty <= 0.

export function sanitizeCart(cart: unknown): CartItem[];
// Si no es array, []. Filtra nulls de normalizeCartItem.

export function getCartState(cart: unknown): CartState;
// { totalItems, totalAmount } — usa sanitizeCart internamente.

export function createCartItemFromProduct(product: unknown, quantity = 1): CartItem | null;
// Crea CartItem desde un objeto producto; null si inválido.

export function hydrateCartFromOrder(order: unknown): CartItem[];
// Reconvierte un pedido guardado a un array CartItem.

export interface CartState {
  totalItems: number;
  totalAmount: number;
}
export interface OrderData {
  items: CartItem[];
}
```

**Archivo de test a crear**: `test/storefront-state.spec.js`

**Patrón a seguir** para la estructura del test: `test/cart.spec.js` (Vitest,
`describe`/`it`/`expect` globales, import desde ruta relativa al repo root).

La configuración de Vitest (`vitest.config.mts`) ya incluye:

- `environment: 'jsdom'`
- `globals: true`
- `include: ['test/**/*.spec.{js,mjs,ts}']`

Por lo tanto, `test/storefront-state.spec.js` se ejecutará automáticamente con
`npm test` (vía `vitest run`).

## Comandos necesarios

| Propósito        | Comando                           | Éxito esperado              |
| ---------------- | --------------------------------- | --------------------------- |
| Tests            | `npm test`                        | exit 0                      |
| Tests (filtrado) | `npx vitest run storefront-state` | solo los nuevos tests pasan |
| Lint             | `npm run lint`                    | exit 0                      |

## Alcance

**En scope**:

- `test/storefront-state.spec.js` — crear (nuevo archivo)

**Fuera de scope** (no tocar):

- `astro-poc/src/scripts/storefront/storefront-state.ts` — NO modificar la
  implementación; si un test revela un bug, reportar sin corregir en este plan
- Ningún otro archivo de test
- `storefront.js` — no tocar

## Workflow git

- Rama: `test/storefront-state-unit-tests-007`
- Commit: `test: add unit tests for storefront-state cart primitives`
- NO hacer push ni abrir PR sin instrucción explícita.

## Pasos

### Paso 1: Crear `test/storefront-state.spec.js`

Crea el archivo con todos los tests descritos a continuación. El import path
correcto (basado en la raíz del repo, donde vive `vitest.config.mts`) es:

```js
import {
  MAX_CART_ITEM_QTY,
  parseNumber,
  clampQty,
  normalizeId,
  normalizeCartItem,
  sanitizeCart,
  getCartState,
  createCartItemFromProduct,
  hydrateCartFromOrder,
} from '../astro-poc/src/scripts/storefront/storefront-state.js';
```

**Tests a escribir** (cubre todos los exports):

```js
describe('parseNumber', () => {
  it('retorna el número cuando es válido', () => {
    expect(parseNumber(42)).toBe(42);
    expect(parseNumber('3.14')).toBeCloseTo(3.14);
    expect(parseNumber(0)).toBe(0);
  });
  it('retorna fallback cuando no es finito', () => {
    expect(parseNumber(NaN)).toBe(0);
    expect(parseNumber(Infinity)).toBe(0);
    expect(parseNumber(-Infinity)).toBe(0);
    expect(parseNumber(null)).toBe(0);
    expect(parseNumber(undefined)).toBe(0);
    expect(parseNumber('abc')).toBe(0);
  });
  it('usa el fallback personalizado', () => {
    expect(parseNumber(NaN, 99)).toBe(99);
  });
});

describe('clampQty', () => {
  it('clampea valores positivos al máximo', () => {
    expect(clampQty(MAX_CART_ITEM_QTY + 1)).toBe(MAX_CART_ITEM_QTY);
    expect(clampQty(1000)).toBe(MAX_CART_ITEM_QTY);
  });
  it('clampea negativos a 0', () => {
    expect(clampQty(-1)).toBe(0);
    expect(clampQty(-Infinity)).toBe(0);
  });
  it('pasa valores en rango sin cambio', () => {
    expect(clampQty(1)).toBe(1);
    expect(clampQty(MAX_CART_ITEM_QTY)).toBe(MAX_CART_ITEM_QTY);
    expect(clampQty(0)).toBe(0);
  });
  it('convierte strings numéricos', () => {
    expect(clampQty('5')).toBe(5);
  });
  it('trata NaN como 0', () => {
    expect(clampQty(NaN)).toBe(0);
    expect(clampQty(null)).toBe(0);
  });
});

describe('normalizeId', () => {
  it('retorna el string trimmed', () => {
    expect(normalizeId('abc')).toBe('abc');
    expect(normalizeId('  id-1  ')).toBe('id-1');
  });
  it('convierte números a string', () => {
    expect(normalizeId(42)).toBe('42');
  });
  it('retorna string vacío para valores inválidos', () => {
    expect(normalizeId(null)).toBe('');
    expect(normalizeId(undefined)).toBe('');
    expect(normalizeId({})).toBe('');
    expect(normalizeId([])).toBe('');
    expect(normalizeId(true)).toBe('');
  });
});

describe('normalizeCartItem', () => {
  const validItem = {
    id: 'prod-1',
    name: 'Leche',
    category: 'Lácteos',
    price: 1500,
    image: 'img.jpg',
    quantity: 2,
  };

  it('normaliza un ítem válido', () => {
    const result = normalizeCartItem(validItem);
    expect(result).toEqual(validItem);
  });
  it('retorna null si id está vacío', () => {
    expect(normalizeCartItem({ ...validItem, id: '' })).toBeNull();
    expect(normalizeCartItem({ ...validItem, id: null })).toBeNull();
  });
  it('retorna null si quantity <= 0', () => {
    expect(normalizeCartItem({ ...validItem, quantity: 0 })).toBeNull();
    expect(normalizeCartItem({ ...validItem, quantity: -1 })).toBeNull();
  });
  it('clampea quantity al máximo', () => {
    const result = normalizeCartItem({ ...validItem, quantity: 999 });
    expect(result?.quantity).toBe(MAX_CART_ITEM_QTY);
  });
  it('usa el id como name si name falta', () => {
    const result = normalizeCartItem({ id: 'prod-1', quantity: 1 });
    expect(result?.name).toBe('prod-1');
  });
  it('retorna null para input no-objeto', () => {
    expect(normalizeCartItem(null)).toBeNull();
    expect(normalizeCartItem('string')).toBeNull();
    expect(normalizeCartItem(42)).toBeNull();
  });
});

describe('sanitizeCart', () => {
  it('filtra ítems inválidos', () => {
    const cart = [
      { id: 'prod-1', quantity: 1 },
      { id: '', quantity: 1 }, // id vacío → filtrado
      null, // null → filtrado
      { id: 'prod-2', quantity: 0 }, // qty 0 → filtrado
      { id: 'prod-3', quantity: 2 },
    ];
    const result = sanitizeCart(cart);
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(['prod-1', 'prod-3']);
  });
  it('retorna [] si el input no es array', () => {
    expect(sanitizeCart(null)).toEqual([]);
    expect(sanitizeCart(undefined)).toEqual([]);
    expect(sanitizeCart({})).toEqual([]);
    expect(sanitizeCart('[]')).toEqual([]);
  });
  it('retorna [] para array vacío', () => {
    expect(sanitizeCart([])).toEqual([]);
  });
});

describe('getCartState', () => {
  it('calcula totales correctamente', () => {
    const cart = [
      { id: 'a', name: 'A', category: '', price: 1000, image: '', quantity: 2 },
      { id: 'b', name: 'B', category: '', price: 500, image: '', quantity: 1 },
    ];
    const state = getCartState(cart);
    expect(state.totalItems).toBe(3);
    expect(state.totalAmount).toBe(2500);
  });
  it('retorna ceros para carrito vacío', () => {
    expect(getCartState([])).toEqual({ totalItems: 0, totalAmount: 0 });
  });
  it('retorna ceros para input inválido', () => {
    expect(getCartState(null)).toEqual({ totalItems: 0, totalAmount: 0 });
    expect(getCartState('garbage')).toEqual({ totalItems: 0, totalAmount: 0 });
  });
});

describe('createCartItemFromProduct', () => {
  it('crea un CartItem válido', () => {
    const product = { id: 'p1', name: 'Pan', category: 'Panadería', price: 800, image: 'pan.jpg' };
    const result = createCartItemFromProduct(product, 3);
    expect(result?.id).toBe('p1');
    expect(result?.quantity).toBe(3);
  });
  it('usa quantity=1 por defecto', () => {
    const result = createCartItemFromProduct({ id: 'p1', quantity: undefined });
    expect(result?.quantity).toBe(1);
  });
  it('retorna null si el producto es inválido', () => {
    expect(createCartItemFromProduct(null)).toBeNull();
    expect(createCartItemFromProduct({})).toBeNull(); // id vacío
  });
});

describe('hydrateCartFromOrder', () => {
  const order = {
    items: [
      { id: 'p1', name: 'Leche', category: 'L', price: 1200, image: 'l.jpg', quantity: 2 },
      { id: 'p2', name: 'Pan', category: 'P', price: 800, image: 'p.jpg', quantity: 1 },
    ],
  };

  it('convierte un pedido a CartItem[]', () => {
    const cart = hydrateCartFromOrder(order);
    expect(cart).toHaveLength(2);
    expect(cart[0].id).toBe('p1');
    expect(cart[1].quantity).toBe(1);
  });
  it('retorna [] si order es null', () => {
    expect(hydrateCartFromOrder(null)).toEqual([]);
  });
  it('retorna [] si items no es array', () => {
    expect(hydrateCartFromOrder({ items: null })).toEqual([]);
    expect(hydrateCartFromOrder({})).toEqual([]);
  });
  it('filtra ítems inválidos dentro del pedido', () => {
    const badOrder = {
      items: [
        { id: '', quantity: 1 },
        { id: 'p1', quantity: 2 },
      ],
    };
    expect(hydrateCartFromOrder(badOrder)).toHaveLength(1);
  });
});
```

### Paso 2: Ejecutar solo los nuevos tests

```bash
npx vitest run storefront-state
```

**Verificar**: todos los tests pasan (0 failed). Si algún test falla, hay dos
posibilidades:

1. El test está mal escrito — corrige el test.
2. El test revela un bug en `storefront-state.ts` — **NO corrijas el bug en
   este plan**; documenta cuál es el comportamiento real vs. el esperado y
   reporta.

### Paso 3: Ejecutar suite completa

```bash
npm test && npm run lint
```

**Verificar**: exit 0 en ambos.

## Criterios de done

- [ ] `ls test/storefront-state.spec.js` → existe
- [ ] `npx vitest run storefront-state` → exit 0, al menos 30 tests passing
- [ ] `npm test` → exit 0
- [ ] `npm run lint` → exit 0
- [ ] `plans/README.md` fila actualizada a DONE

## Condiciones de STOP

Detente e informa si:

- Más de 2 tests fallan por comportamiento inesperado de `storefront-state.ts`
  (indicaría bugs en el módulo que merecen un plan separado de fix).
- El import path no funciona (`storefront-state.ts` vs `.js` en el import) —
  verifica si Vitest requiere `.js` para archivos TypeScript transformados.
- `vitest.config.mts` excluye el archivo por alguna razón (verificar el glob
  `include: ['test/**/*.spec.{js,mjs,ts}']`).

## Notas de mantenimiento

- Cuando se refactorice `storefront.js` (Plan ARCH-01 — god module), estos
  tests protegen la lógica de estado de regresiones.
- Si se agrega una nueva función a `storefront-state.ts`, agregar tests en este
  archivo antes de que la función se considere "en producción".
- Cuando se suban los coverage thresholds (después de Plan 005), estos tests
  contribuirán significativamente a la métrica de funciones cubiertas.
