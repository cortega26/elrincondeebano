// Plan 172: bulk-action input validation + schema-guarded persistence.
// - Unknown actions and mistyped values are rejected at the route (400),
//   never silently no-op'd or persisted.
// - bulkApply re-validates each mutated product and reverts + reports
//   schema-invalid mutations as skipped instead of bricking the catalog.
import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { ProductService, type BulkOperation } from '../../src/domain/products/productService.ts';
import type { ProductCatalog } from '../../src/shared/schemas/product.ts';
import { generateProductId } from '../../src/shared/identity.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import type { FastifyInstance } from 'fastify';

function getCredential(app: FastifyInstance): string {
  const cred = (app as unknown as Record<string, unknown>).launchCredential;
  return typeof cred === 'string' ? cred : '';
}

function jsonHeaders(app: FastifyInstance): Record<string, string> {
  return { [CREDENTIAL_HEADER]: getCredential(app), 'Content-Type': 'application/json' };
}

function createTempDir(): string {
  return resolve(
    tmpdir(),
    `cm-bulk-validation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function seedProduct(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: 'Bulk Test',
    description: '',
    price: 1000,
    discount: 0,
    stock: true,
    category: 'abarrotes',
    order: 0,
    is_archived: false,
    rev: 0,
    field_last_modified: {},
    ...overrides,
  };
}

function setup(dir: string): void {
  const dataDir = resolve(dir, 'data');
  const astroDataDir = resolve(dir, 'astro-poc', 'src', 'data');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(astroDataDir, { recursive: true });
  writeFileSync(
    resolve(dataDir, 'product_data.json'),
    JSON.stringify({
      version: 'test',
      last_updated: '',
      rev: 0,
      products: [seedProduct('p-bulk-1'), seedProduct('p-bulk-2', { stock: false })],
    })
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

async function bulk(
  app: FastifyInstance,
  route: 'preview' | 'apply',
  body: Record<string, unknown>
) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/products/bulk/${route}`,
    headers: jsonHeaders(app),
    payload: body,
  });
}

test('unknown bulk action is rejected on preview and apply', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    try {
      for (const route of ['preview', 'apply'] as const) {
        const res = await bulk(app, route, {
          command_id: `unk-${route}`,
          action: 'explode_everything',
          value: 1,
          product_ids: ['p-bulk-1'],
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error.message).toContain('Unknown bulk action');
      }
    } finally {
      await app.close();
    }
  } finally {
    cleanup(dir);
  }
});

test('mistyped and non-finite bulk values are rejected, never persisted', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    try {
      const badBodies = [
        { action: 'set_discount_percent', value: '10' },
        { action: 'set_discount_percent', value: '' },
        { action: 'set_discount_percent', value: null },
        { action: 'set_price_delta_percent', value: '5' },
        { action: 'set_category', value: 123 },
        { action: 'set_category', value: '' },
        { action: 'set_category', value: '   ' },
        { action: 'set_stock', value: 'true' },
        { action: 'set_stock', value: 1 },
      ];
      for (const [i, partial] of badBodies.entries()) {
        for (const route of ['preview', 'apply'] as const) {
          const res = await bulk(app, route, {
            command_id: `bad-${i}-${route}`,
            ...partial,
            product_ids: ['p-bulk-1'],
          });
          expect(res.statusCode).toBe(400);
        }
      }
      // The catalog is untouched by every rejected attempt above.
      const current = await app.inject({
        method: 'GET',
        url: '/api/v1/products/p-bulk-1',
        headers: jsonHeaders(app),
      });
      expect(current.json().price).toBe(1000);
      expect(current.json().discount).toBe(0);
      expect(current.json().rev).toBe(0);
    } finally {
      await app.close();
    }
  } finally {
    cleanup(dir);
  }
});

test('valid bulk apply keeps identical preview/apply counts', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    try {
      const preview = await bulk(app, 'preview', {
        command_id: 'ok-prev',
        action: 'set_discount_fixed',
        value: 100,
        product_ids: ['p-bulk-1', 'p-bulk-2'],
      });
      expect(preview.statusCode).toBe(200);
      const total = preview.json().total_changes as number;
      expect(total).toBe(2);

      const applied = await bulk(app, 'apply', {
        command_id: 'ok-apply',
        action: 'set_discount_fixed',
        value: 100,
        product_ids: ['p-bulk-1', 'p-bulk-2'],
      });
      expect(applied.statusCode).toBe(200);
      expect(applied.json().changed).toBe(total);
      expect(applied.json().skipped).toBe(0);
    } finally {
      await app.close();
    }
  } finally {
    cleanup(dir);
  }
});

function makeCatalog(): ProductCatalog {
  return { version: 'test', last_updated: '', rev: 0, products: [] };
}

test('bulkPreview and bulkApply fail unknown actions loudly at the service layer', () => {
  const service = new ProductService();
  service.enable();
  const catalog = makeCatalog();
  const id = generateProductId();
  catalog.products.push(seedProduct(id) as never);

  const operation = {
    action: 'self_destruct',
    value: 1,
    product_ids: [id],
  } as unknown as BulkOperation;
  const preview = service.bulkPreview(catalog, operation);
  expect(preview.ok).toBe(false);
  expect(preview.error).toContain('Unknown bulk action');
  const applied = service.bulkApply(catalog, operation);
  expect(applied.ok).toBe(false);
  expect(applied.error).toContain('Unknown bulk action');
});

test('schema-invalid mutations are reverted and reported as skipped, never persisted', () => {
  const service = new ProductService();
  service.enable();
  const catalog = makeCatalog();
  const id = generateProductId();
  catalog.products.push(seedProduct(id) as never);

  const result = service.bulkApply(catalog, {
    action: 'set_discount_percent',
    value: NaN,
    product_ids: [id],
  });

  expect(result.ok).toBe(true);
  expect(result.changed).toBe(0);
  expect(result.skipped).toBe(1);
  const product = catalog.products[0];
  expect(product.discount).toBe(0);
  expect(Number.isFinite(product.discount)).toBe(true);
  expect(product.rev).toBe(0);
  expect(product.field_last_modified).toEqual({});
});
