# Plan 021: Extraer lógica compartida de ProductCard y ProductCardStrip

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
>
> ```
> git diff --stat 633eeb8..HEAD -- astro-poc/src/components/ProductCard.astro astro-poc/src/components/ProductCardStrip.astro
> ```
>
> If files changed, compare excerpts against live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plan 013 (Astro version correct)
- **Category**: tech-debt
- **Planned at**: commit `633eeb8`, 2026-07-14

## Why this matters

`ProductCard.astro` y `ProductCardStrip.astro` tienen bloques de frontmatter casi idénticos con lógica copiada: cálculo de precios (price, discount, finalPrice, hasDiscount, discountPercent), construcción de `searchText`, resolución de imágenes (`getProductCardImageSource`, `getProductAvifImageSource`), y 12 atributos `data-product-*`. El comentario en ProductCardStrip lo admite explícitamente. Esto crea un tax de mantenimiento: cada nuevo atributo de producto requiere actualizar dos componentes en lockstep, y la divergencia accidental produce bugs donde el filtrado funciona en grid pero no en strips (o viceversa).

## Current state

Ambos componentes comparten el mismo bloque de frontmatter. `ProductCardStrip.astro` probablemente tiene un comentario tipo "Reutiliza los mismos data-attributes que ProductCard para compatibilidad con storefront.js".

Los archivos a examinar:

- `astro-poc/src/components/ProductCard.astro` — versión grid
- `astro-poc/src/components/ProductCardStrip.astro` — versión horizontal strip

La lógica duplicada incluye (confirmar leyendo los archivos):

- Cálculo: `price`, `discount`, `finalPrice`, `hasDiscount`, `discountPercent`
- Imágenes: `getProductCardImageSource(product.image_path)`, AVIF fallback
- Search text: `[product.name, product.description, product.category].join(' ')`
- Data attributes: `data-product-name`, `data-product-category`, `data-product-price`, `data-product-discount`, `data-product-stock`, etc.

## Commands you will need

| Purpose    | Command                   | Expected on success |
| ---------- | ------------------------- | ------------------- |
| Build      | `npm run build`           | exit 0              |
| Typecheck  | `npm run typecheck`       | exit 0, no errors   |
| Lint       | `npm run lint`            | exit 0              |
| Test       | `npm test`                | all pass            |
| E2E        | `npm run test:e2e`        | all pass            |
| E2E visual | `npm run test:e2e:visual` | all pass            |

## Scope

**In scope**:

- `astro-poc/src/components/ProductCard.astro` — refactorizar para usar helper compartido
- `astro-poc/src/components/ProductCardStrip.astro` — refactorizar para usar helper compartido
- Nuevo archivo: `astro-poc/src/lib/product-card-helpers.ts` — funciones compartidas

**Out of scope** (do NOT touch):

- El markup/HTML de los componentes — solo se extrae la lógica del frontmatter
- `storefront.js` — ya consume los data-attributes, no cambia
- Plan 005 (optimización de rendering) — diferente scope

## Git workflow

- Branch: `advisor/021-extract-card-helpers`
- Commit message: `refactor(components): extract shared ProductCard data logic into helper module`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Leer ambos componentes para identificar la lógica duplicada exacta

Leer `astro-poc/src/components/ProductCard.astro` y `astro-poc/src/components/ProductCardStrip.astro` completos. Identificar cada línea del frontmatter (entre `---` fences) que es idéntica o casi idéntica.

### Step 2: Crear helper module

Crear `astro-poc/src/lib/product-card-helpers.ts`:

```typescript
import {
  getProductCardImageSource,
  type ResponsiveImageSource,
  type ProductRecord,
} from './catalog';

export interface ProductCardData {
  price: number;
  discount: number;
  finalPrice: number;
  hasDiscount: boolean;
  discountPercent: number;
  searchText: string;
  imageSource: ResponsiveImageSource;
  avifImageSource: ResponsiveImageSource | null;
  dataAttributes: Record<string, string>;
}

export function computeProductCardData(product: ProductRecord): ProductCardData {
  const price = Number(product.price) || 0;
  const discount = Number(product.discount) || 0;
  const finalPrice = Math.max(price - discount, 0);
  const hasDiscount = discount > 0 && finalPrice < price;
  const discountPercent = hasDiscount && price > 0 ? Math.round((discount / price) * 100) : 0;

  const searchText = [product.name, product.description, product.category]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const imageSource = getProductCardImageSource(product.image_path);
  const avifPath = product.image_avif_path;
  const avifImageSource = avifPath ? getProductCardImageSource(avifPath) : null;

  const dataAttributes: Record<string, string> = {
    'data-product-name': String(product.name || ''),
    'data-product-category': String(product.category || ''),
    'data-product-price': String(price),
    'data-product-discount': String(discount),
    'data-product-stock': product.stock === false ? 'false' : 'true',
    'data-product-has-discount': hasDiscount ? 'true' : 'false',
    'data-product-discount-percent': String(discountPercent),
    'data-product-description': String(product.description || ''),
  };

  if (product.order !== undefined) {
    dataAttributes['data-product-order'] = String(product.order);
  }

  return {
    price,
    discount,
    finalPrice,
    hasDiscount,
    discountPercent,
    searchText,
    imageSource,
    avifImageSource,
    dataAttributes,
  };
}
```

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Refactorizar ProductCard.astro

En el frontmatter de `ProductCard.astro`, reemplazar los cálculos inline por:

```astro
---
import { computeProductCardData } from '../lib/product-card-helpers';

const { product } = Astro.props;
const card = computeProductCardData(product);
---
```

Actualizar el template para usar `card.price`, `card.finalPrice`, `card.dataAttributes`, etc. Los data-attributes se pueden aplicar con `{...card.dataAttributes}` si Astro lo soporta, o mantenerlos inline usando `card.dataAttributes['data-product-name']`.

### Step 4: Refactorizar ProductCardStrip.astro

Mismo cambio que en Step 3.

### Step 5: Validación completa

```bash
npm run typecheck && npm run lint && npm run build && npm test && npm run test:e2e && npm run test:e2e:visual
```

**Verify**: todos exit 0. Sin regresiones visuales.

## Test plan

- Tests existentes que verifican data-attributes en el DOM deben seguir pasando.
- `npm run test:e2e:visual` — sin cambios visuales.
- Si no hay tests unitarios para los helpers de product card, añadir `test/product-card-helpers.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeProductCardData } from '../astro-poc/src/lib/product-card-helpers';

describe('computeProductCardData', () => {
  it('computes price and discount correctly', () => {
    const result = computeProductCardData({
      name: 'Test',
      price: 1000,
      discount: 200,
      category: 'test-cat',
    });
    expect(result.finalPrice).toBe(800);
    expect(result.hasDiscount).toBe(true);
    expect(result.discountPercent).toBe(20);
  });

  it('handles missing optional fields', () => {
    const result = computeProductCardData({ name: 'Test', category: 'cat' });
    expect(result.finalPrice).toBe(0);
    expect(result.hasDiscount).toBe(false);
    expect(result.imageSource.src).toBeDefined();
  });

  it('generates data attributes', () => {
    const result = computeProductCardData({ name: 'A', category: 'B', stock: false });
    expect(result.dataAttributes['data-product-name']).toBe('A');
    expect(result.dataAttributes['data-product-stock']).toBe('false');
  });
});
```

**Verify**: `npm test` → todos los tests pasan, incluyendo los nuevos.

## Done criteria

All must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run test:e2e` exits 0
- [ ] `npm run test:e2e:visual` exits 0 (sin regresiones)
- [ ] `ProductCard.astro` y `ProductCardStrip.astro` importan de `product-card-helpers.ts`
- [ ] No hay lógica de cálculo inline duplicada en los frontmatters de los componentes
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Los frontmatters de los componentes tienen diferencias que requieren lógica condicional en el helper (ej. diferentes widths para imágenes). En ese caso, parametrizar el helper.
- Astro no soporta spread de atributos (`{...object}`) en data-attributes — mantener los atributos inline pero usando `card.dataAttributes['key']`.
- `npm run test:e2e:visual` muestra regresiones — verificar que los data-attributes se renderizan idénticos a antes.

## Maintenance notes

- Cualquier nuevo atributo de producto que necesite estar en el DOM debe añadirse en `computeProductCardData`, no en los componentes individuales.
- Si se añade un tercer tipo de product card en el futuro, debe consumir el mismo helper.
- Los data-attributes son el contrato entre el servidor (Astro) y el cliente (storefront.js). Documentar este contrato en `product-card-helpers.ts`.
