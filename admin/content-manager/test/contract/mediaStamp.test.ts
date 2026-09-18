// Plan 188: media inventory cache contract — warm requests reuse the cached
// inventory (reference-identical), product edits rebuild immediately (the
// products key is computed fresh per request), and explicit invalidation
// drops everything. A stamp-memoization with TTL was evaluated and REVERTED:
// it broke the tested immediacy contract for external filesystem edits
// (media.test.ts mtime cases) to save a measured 4-8ms per request —
// correctly not worth it. This file pins the contract that must hold.
import { test, expect } from 'vitest';
import { MediaRepository } from '../../src/server/repositories/mediaRepository.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { Product } from '../../src/shared/schemas/product.ts';

function setupRepo(): string {
  const dir = resolve(
    tmpdir(),
    `cm-media-stamp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(resolve(dir, 'assets', 'images', 'a'), { recursive: true });
  writeFileSync(resolve(dir, 'assets', 'images', 'a', 'one.webp'), 'x');
  return dir;
}

function product(imagePath: string): Product {
  return {
    id: 'm-1',
    name: 'M',
    description: '',
    price: 1,
    discount: 0,
    stock: true,
    category: 'c',
    image_path: imagePath,
    order: 0,
    is_archived: false,
    rev: 0,
    field_last_modified: {},
  } as Product;
}

const PRODUCTS = [product('assets/images/a/one.webp')];

test('warm requests reuse the cached inventory (reference-identical)', () => {
  const dir = setupRepo();
  try {
    const media = new MediaRepository({ repoRoot: dir });
    const first = media.getInventory(PRODUCTS);
    const second = media.getInventory(PRODUCTS);
    expect(second.items).toBe(first.items);
    expect(second.summary).toBe(first.summary);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('product edits rebuild immediately (no TTL on the products key)', () => {
  const dir = setupRepo();
  try {
    const media = new MediaRepository({ repoRoot: dir });
    const before = media.getInventory(PRODUCTS);
    const after = media.getInventory([product('assets/images/a/two.webp')]);
    expect(after.items).not.toBe(before.items);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('invalidate drops the stamp and the inventory', () => {
  const dir = setupRepo();
  try {
    const media = new MediaRepository({ repoRoot: dir });
    const first = media.getInventory(PRODUCTS);
    media.invalidate();
    const second = media.getInventory(PRODUCTS);
    expect(second.items).not.toBe(first.items);
    expect(second.items).toEqual(first.items);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
