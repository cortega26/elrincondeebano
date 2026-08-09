import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
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

function setup(dir: string): void {
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });

  writeFileSync(
    resolve(dir, 'data', 'product_data.json'),
    JSON.stringify({
      version: 'test',
      last_updated: '',
      rev: 0,
      products: [],
    })
  );
  writeFileSync(
    resolve(dir, 'data', 'category_registry.json'),
    JSON.stringify({ nav_groups: [], categories: [] })
  );
  writeFileSync(
    resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
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

function createTempDir(): string {
  return resolve(tmpdir(), `cm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

test('POST /api/v1/products/reorder assigns new order values', async () => {
  const dir = createTempDir();
  try {
    setup(dir);

    const app1 = createApp({ repoRoot: dir, enableWrites: true });
    await app1.ready();

    const ids: string[] = [];
    for (const name of ['C', 'A', 'B']) {
      const res = await app1.inject({
        method: 'POST',
        url: '/api/v1/products',
        headers: credHeaders(app1),
        payload: { command_id: `create-${name}`, payload: { name, price: 1000, category: 'cat1' } },
      });
      const body = res.json<{ product: { id: string } }>();
      ids.push(body.product.id);
    }
    await app1.close();

    const app2 = createApp({ repoRoot: dir, enableWrites: true });
    await app2.ready();

    const reorderRes = await app2.inject({
      method: 'POST',
      url: '/api/v1/products/reorder',
      headers: credHeaders(app2),
      payload: { command_id: 'reorder-1', ordered_ids: [ids[1], ids[2], ids[0]] },
    });
    expect(reorderRes.statusCode).toBe(200);

    const getRes = await app2.inject({ method: 'GET', url: '/api/v1/products' });
    const list = getRes.json<{ items: Array<{ id: string; name: string; order: number }> }>();
    expect(list.items[0].name).toBe('A');
    expect(list.items[1].name).toBe('B');
    expect(list.items[2].name).toBe('C');

    await app2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/products/bulk/preview shows discount changes', async () => {
  const dir = createTempDir();
  try {
    setup(dir);

    const app = createApp({ repoRoot: dir, enableWrites: true });
    await app.ready();

    const ids: string[] = [];
    for (const name of ['P1', 'P2']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        headers: credHeaders(app),
        payload: { command_id: `create-${name}`, payload: { name, price: 1000, category: 'cat1' } },
      });
      ids.push(res.json<{ product: { id: string } }>().product.id);
    }

    const previewRes = await app.inject({
      method: 'POST',
      url: '/api/v1/products/bulk/preview',
      headers: credHeaders(app),
      payload: {
        command_id: 'preview-1',
        action: 'set_discount_percent',
        value: 20,
        product_ids: ids,
      },
    });
    expect(previewRes.statusCode).toBe(200);

    const body = previewRes.json<{ changes: Array<{ new_value: number }> }>();
    expect(body.changes).toHaveLength(2);
    expect(body.changes[0].new_value).toBe(200); // 20% of 1000

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/products/bulk/apply applies changes', async () => {
  const dir = createTempDir();
  try {
    setup(dir);

    const app = createApp({ repoRoot: dir, enableWrites: true });
    await app.ready();

    const ids: string[] = [];
    for (const name of ['P1', 'P2']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        headers: credHeaders(app),
        payload: { command_id: `create-${name}`, payload: { name, price: 1000, category: 'cat1' } },
      });
      ids.push(res.json<{ product: { id: string } }>().product.id);
    }

    const applyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/products/bulk/apply',
      headers: credHeaders(app),
      payload: {
        command_id: 'apply-1',
        action: 'set_discount_fixed',
        value: 100,
        product_ids: ids,
      },
    });
    expect(applyRes.statusCode).toBe(200);

    const body = applyRes.json<{ changed: number }>();
    expect(body.changed).toBe(2);

    const getRes = await app.inject({ method: 'GET', url: '/api/v1/products' });
    const list = getRes.json<{ items: Array<{ discount: number }> }>();
    expect(list.items[0].discount).toBe(100);
    expect(list.items[1].discount).toBe(100);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/products/bulk/apply set_stock toggles', async () => {
  const dir = createTempDir();
  try {
    setup(dir);

    const app = createApp({ repoRoot: dir, enableWrites: true });
    await app.ready();

    const ids: string[] = [];
    for (const name of ['P1', 'P2']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        headers: credHeaders(app),
        payload: {
          command_id: `create-${name}`,
          payload: { name, price: 1000, stock: true, category: 'cat1' },
        },
      });
      ids.push(res.json<{ product: { id: string } }>().product.id);
    }

    const applyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/products/bulk/apply',
      headers: credHeaders(app),
      payload: { command_id: 'stock-1', action: 'set_stock', value: false, product_ids: ids },
    });
    expect(applyRes.statusCode).toBe(200);

    const getRes = await app.inject({ method: 'GET', url: '/api/v1/products' });
    const list = getRes.json<{ items: Array<{ stock: boolean }> }>();
    expect(list.items[0].stock).toBe(false);
    expect(list.items[1].stock).toBe(false);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/products/bulk/apply set_category updates category', async () => {
  const dir = createTempDir();
  try {
    setup(dir);

    const app = createApp({ repoRoot: dir, enableWrites: true });
    await app.ready();

    const ids: string[] = [];
    for (const name of ['P1', 'P2']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        headers: credHeaders(app),
        payload: { command_id: `create-${name}`, payload: { name, price: 1000, category: 'old' } },
      });
      ids.push(res.json<{ product: { id: string } }>().product.id);
    }

    const applyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/products/bulk/apply',
      headers: credHeaders(app),
      payload: { command_id: 'cat-1', action: 'set_category', value: 'new-cat', product_ids: ids },
    });
    expect(applyRes.statusCode).toBe(200);

    const getRes = await app.inject({ method: 'GET', url: '/api/v1/products' });
    const list = getRes.json<{ items: Array<{ category: string }> }>();
    expect(list.items[0].category).toBe('new-cat');
    expect(list.items[1].category).toBe('new-cat');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
