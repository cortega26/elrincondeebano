// Plan 188: getAll single-pass equivalence matrix — every predicate,
// falsy-skip, and combination pinned, so the fused filter can never silently
// diverge from the old chained chain.
import { test, expect } from 'vitest';
import { ProductRepository } from '../../src/server/repositories/productRepository.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

function createTempDir(): string {
  return resolve(tmpdir(), `cm-getall-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

function product(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    description: '',
    price: 100,
    discount: 0,
    stock: true,
    category: 'x',
    order: 0,
    is_archived: false,
    rev: 0,
    field_last_modified: {},
    ...overrides,
  };
}

const PRODUCTS = [
  product('a', { name: 'Manzana Roja', price: 1000, category: 'Frutas', order: 2 }),
  product('b', {
    name: 'Pera',
    price: 2000,
    discount: 500,
    stock: false,
    category: 'frutas',
    order: 0,
  }),
  product('c', { name: 'Lechuga', price: 500, category: 'Verduras', is_archived: true, order: 1 }),
  product('d', {
    name: 'Mango',
    description: 'dulce y ácida',
    price: 333,
    discount: 100,
    category: ' FRUTAS ',
    order: 3,
  }),
  product('e', { name: 'Leche Entera', price: 1500, category: 'Lácteos', order: 4 }),
  product('f', { name: 'Oferta', price: 100, discount: 100, category: 'Ofertas', order: 5 }),
];

function setupRepo(): string {
  const dir = createTempDir();
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  writeFileSync(
    resolve(dir, 'data', 'product_data.json'),
    JSON.stringify({ version: 'test', last_updated: '', rev: 0, products: PRODUCTS })
  );
  return dir;
}

function ids(
  filters: Record<string, unknown>,
  page = 1,
  limit = 50
): { ids: string[]; total: number } {
  const dir = setupRepo();
  try {
    const repo = new ProductRepository({ repoRoot: dir });
    const { items, total } = repo.getAll(page, limit, filters as never);
    return { ids: items.map((p) => p.id!), total };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('no filters returns everything in order', () => {
  expect(ids({}).ids).toEqual(['b', 'c', 'a', 'd', 'e', 'f']);
});

test('archived tri-state', () => {
  expect(ids({ archived: false }).ids).toEqual(['b', 'a', 'd', 'e', 'f']);
  expect(ids({ archived: true }).ids).toEqual(['c']);
});

test('out_of_stock, min/max price (0 honored, not skipped)', () => {
  expect(ids({ out_of_stock: true }).ids).toEqual(['b']);
  expect(ids({ min_price: 1000 }).ids).toEqual(['b', 'a', 'e']);
  expect(ids({ min_price: 0 }).total).toBe(6);
  expect(ids({ max_price: 500 }).ids).toEqual(['c', 'd', 'f']);
});

test('discount filters use the raw ratio', () => {
  expect(ids({ discounted_only: true }).ids).toEqual(['b', 'd', 'f']);
  expect(ids({ min_discount: 25 }).ids).toEqual(['b', 'd', 'f']);
  expect(ids({ max_discount: 25 }).ids).toEqual(['b', 'c', 'a', 'e']);
});

test('category matching is case- and space-insensitive on both sides', () => {
  expect(ids({ category: 'frutas' }).ids).toEqual(['b', 'a', 'd']);
  expect(ids({ category: '  FRUTAS  ' }).ids).toEqual(['b', 'a', 'd']);
});

test('q matches name, description, and category; empty q is ignored', () => {
  expect(ids({ q: 'dulce' }).ids).toEqual(['d']);
  expect(ids({ q: 'MANZANA' }).ids).toEqual(['a']);
  expect(ids({ q: 'lácteos' }).ids).toEqual(['e']);
  expect(ids({ q: '' }).total).toBe(6);
  expect(ids({ category: '' }).total).toBe(6);
});

test('combined filters intersect and pagination slices in order', () => {
  expect(ids({ archived: false, min_price: 1000, category: 'Frutas' }).ids).toEqual(['b', 'a']);
  expect(ids({}, 2, 2).ids).toEqual(['a', 'd']);
});
