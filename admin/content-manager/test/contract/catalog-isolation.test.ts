// Plan 171: catalog isolation — the cache-miss path must hand out a private
// copy (plan 105 contract), so service-layer in-place mutations can never
// leak into later requests. Vetting note: productService.edit() already
// validates prospectively before mutating (plan 100), so the remaining leak
// is the miss path returning the live cached object.
import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { ProductRepository } from '../../src/server/repositories/productRepository.ts';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import type { FastifyInstance } from 'fastify';

function getCredential(app: FastifyInstance): string {
  const cred = (app as unknown as Record<string, unknown>).launchCredential;
  return typeof cred === 'string' ? cred : '';
}

function credHeaders(app: FastifyInstance): Record<string, string> {
  return { [CREDENTIAL_HEADER]: getCredential(app) };
}

function createTempDir(): string {
  return resolve(
    tmpdir(),
    `cm-catalog-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

const SEED_PRODUCT = {
  id: 'p-iso-1',
  name: 'Arroz',
  description: '',
  price: 1000,
  discount: 0,
  stock: true,
  category: 'abarrotes',
  order: 0,
  is_archived: false,
  rev: 0,
  field_last_modified: {},
};

function setup(dir: string): void {
  const dataDir = resolve(dir, 'data');
  const astroDataDir = resolve(dir, 'astro-poc', 'src', 'data');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(astroDataDir, { recursive: true });
  writeFileSync(
    resolve(dataDir, 'product_data.json'),
    JSON.stringify({ version: 'test', last_updated: '', rev: 0, products: [SEED_PRODUCT] })
  );
  writeFileSync(
    resolve(dataDir, 'category_registry.json'),
    JSON.stringify({ nav_groups: [], categories: [] })
  );
  writeFileSync(
    resolve(astroDataDir, 'storefront-experience.json'),
    JSON.stringify({
      trustBar: { highlights: [], statusItems: [] },
      home: {
        primaryCategories: [],
        secondaryCategories: [],
        fallbackQuickPicks: [],
        featuredStaples: [],
      },
      bundles: [],
      companionRules: [],
    })
  );
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

test('cache-miss load hands out a private copy, not the live cached object', () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const repo = new ProductRepository({ repoRoot: dir });
    const cold = repo.loadCatalog(); // miss path: reads disk, caches, returns
    // Simulate service-layer in-place mutation of the returned catalog.
    cold.products[0].price = 999999;
    cold.products[0].rev += 1;
    cold.rev += 1;

    const fresh = repo.loadCatalog(); // must observe pre-mutation state
    expect(fresh.products[0].price).toBe(1000);
    expect(fresh.products[0].rev).toBe(0);
    expect(fresh.rev).toBe(0);

    const onDisk = JSON.parse(readFileSync(resolve(dir, 'data', 'product_data.json'), 'utf-8'));
    expect(onDisk.products[0].price).toBe(1000);
  } finally {
    cleanup(dir);
  }
});

test('rejected edits leave no trace: 422, then 409, then success on original rev', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    try {
      const badType = await app.inject({
        method: 'PATCH',
        url: '/api/v1/products/p-iso-1',
        headers: { ...credHeaders(app), 'Content-Type': 'application/json' },
        payload: { command_id: 'iso-1', base_revision: 0, payload: { price: 'abc' } },
      });
      expect(badType.statusCode).toBe(422);

      const stale = await app.inject({
        method: 'PATCH',
        url: '/api/v1/products/p-iso-1',
        headers: { ...credHeaders(app), 'Content-Type': 'application/json' },
        payload: { command_id: 'iso-2', base_revision: 99, payload: { price: 1100 } },
      });
      expect(stale.statusCode).toBe(409);

      const afterRejects = await app.inject({
        method: 'GET',
        url: '/api/v1/products/p-iso-1',
        headers: credHeaders(app),
      });
      expect(afterRejects.statusCode).toBe(200);
      expect(afterRejects.json().price).toBe(1000);
      expect(afterRejects.json().rev).toBe(0);

      const valid = await app.inject({
        method: 'PATCH',
        url: '/api/v1/products/p-iso-1',
        headers: { ...credHeaders(app), 'Content-Type': 'application/json' },
        payload: { command_id: 'iso-3', base_revision: 0, payload: { price: 1200 } },
      });
      expect(valid.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  } finally {
    cleanup(dir);
  }
});

test('stale concurrent edit 409s without partial application', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    try {
      const first = await app.inject({
        method: 'PATCH',
        url: '/api/v1/products/p-iso-1',
        headers: { ...credHeaders(app), 'Content-Type': 'application/json' },
        payload: { command_id: 'iso-a', base_revision: 0, payload: { price: 1100 } },
      });
      expect(first.statusCode).toBe(200);

      const second = await app.inject({
        method: 'PATCH',
        url: '/api/v1/products/p-iso-1',
        headers: { ...credHeaders(app), 'Content-Type': 'application/json' },
        payload: { command_id: 'iso-b', base_revision: 0, payload: { price: 1200, discount: 100 } },
      });
      expect(second.statusCode).toBe(409);

      const current = await app.inject({
        method: 'GET',
        url: '/api/v1/products/p-iso-1',
        headers: credHeaders(app),
      });
      expect(current.json().price).toBe(1100);
      expect(current.json().discount).toBe(0);
      expect(current.json().rev).toBe(1);
    } finally {
      await app.close();
    }
  } finally {
    cleanup(dir);
  }
});
