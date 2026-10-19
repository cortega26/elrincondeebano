import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeProductCardData } from '../astro-poc/src/lib/product-card-helpers.ts';

// Plan 239: the card attributes are emitted from a single source
// (computeProductCardData.dataAttributes, spread by the three card
// components). This pins both halves of the contract: the emitted set equals
// the set the runtime reads via `dataset.product*` (so a dead key fails, and
// a new runtime read fails until the helper emits it), and no component
// hand-writes a data-product-* attribute again.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENTS = ['ProductCard.astro', 'ProductCardStrip.astro', 'ProductDetail.astro'];

function listScriptFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listScriptFiles(fullPath));
    } else if (/\.(?:js|mjs|ts)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function toAttributeName(camel) {
  return `data-${camel.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

// Union of `dataset.product*` reads across the live storefront scripts
// (catalog-view.js, storefront.js, card-registry.js, ...).
function runtimeReadAttributes() {
  const scriptsRoot = path.join(repoRoot, 'astro-poc', 'src', 'scripts');
  const names = new Set();
  for (const file of listScriptFiles(scriptsRoot)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/dataset\.(product[A-Za-z]+)/g)) {
      names.add(toAttributeName(match[1]));
    }
  }
  return [...names].sort();
}

function productFixture(overrides = {}) {
  return {
    name: 'Arroz Grado 2',
    description: '1 kg',
    category: 'abarrotes',
    price: 1500,
    discount: 200,
    stock: true,
    image_path: '',
    image_avif_path: '',
    ...overrides,
  };
}

describe('card data-attribute contract (plan 239)', () => {
  it('emits exactly the data-product-* set the runtime reads', () => {
    const { dataAttributes } = computeProductCardData(productFixture(), 3, 'pid-test');
    expect(Object.keys(dataAttributes).sort()).toEqual(runtimeReadAttributes());
  });

  it('carries the runtime-visible values and drops the unread keys', () => {
    const { dataAttributes } = computeProductCardData(productFixture(), 2, 'pid-2');
    expect(dataAttributes).toMatchObject({
      'data-product-id': 'pid-2',
      'data-product-final-price': '1300',
      'data-product-order': '2',
      'data-product-stock': 'true',
    });
    expect(dataAttributes).not.toHaveProperty('data-product-has-discount');
    expect(dataAttributes).not.toHaveProperty('data-product-discount-percent');
  });

  for (const component of COMPONENTS) {
    it(`${component} spreads the helper attributes without a hand-written copy`, () => {
      const source = readFileSync(
        path.join(repoRoot, 'astro-poc', 'src', 'components', component),
        'utf8'
      );
      expect(source).toContain('{...card.dataAttributes}');
      // Attribute-name shape only: prose comments (e.g. `data-product-*`) pass.
      expect(source.match(/data-product-[a-z]/g) ?? []).toHaveLength(0);
    });
  }
});
