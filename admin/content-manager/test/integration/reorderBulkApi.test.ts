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

// ── plan 088: scope honesty ──────────────────────────────────────────────────

test('reorder with a partial id list is rejected (409 REORDER_SCOPE_AMBIGUOUS)', async () => {
  const dir = createTempDir();
  try {
    setup(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true });
    await app.ready();
    const ch = credHeaders(app);

    const ids: string[] = [];
    for (const name of ['A', 'B', 'C']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        headers: ch,
        payload: { command_id: `create-${name}`, payload: { name, price: 1000, category: 'cat1' } },
      });
      ids.push(res.json<{ product: { id: string } }>().product.id);
    }

    // Only 2 of 3 ids: the visible-page scenario — must not scramble order.
    const partial = await app.inject({
      method: 'POST',
      url: '/api/v1/products/reorder',
      headers: ch,
      payload: { command_id: 'reorder-partial', ordered_ids: [ids[1], ids[0]] },
    });
    expect(partial.statusCode).toBe(409);
    expect(partial.json().error.code).toBe('REORDER_SCOPE_AMBIGUOUS');

    // Duplicates in the full list are also rejected.
    const dupes = await app.inject({
      method: 'POST',
      url: '/api/v1/products/reorder',
      headers: ch,
      payload: { command_id: 'reorder-dupes', ordered_ids: [ids[0], ids[0], ids[1]] },
    });
    expect(dupes.statusCode).toBe(400);

    // Full list still works.
    const full = await app.inject({
      method: 'POST',
      url: '/api/v1/products/reorder',
      headers: ch,
      payload: { command_id: 'reorder-full', ordered_ids: [ids[2], ids[1], ids[0]] },
    });
    expect(full.statusCode).toBe(200);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bulk apply with scope=all + filters targets every matching product', async () => {
  const dir = createTempDir();
  try {
    setup(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true });
    await app.ready();
    const ch = credHeaders(app);

    for (const [name, category] of [
      ['Alpha', 'cat1'],
      ['Beta', 'cat1'],
      ['Gamma', 'cat2'],
    ] as const) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        headers: ch,
        payload: { command_id: `create-${name}`, payload: { name, price: 1000, category } },
      });
    }

    const applyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/products/bulk/apply',
      headers: ch,
      payload: {
        command_id: 'bulk-all-1',
        action: 'set_stock',
        value: true,
        scope: 'all',
        filters: { category: 'cat1' },
      },
    });
    expect(applyRes.statusCode).toBe(200);
    const body = applyRes.json<{ changed: number; changes: Array<{ product_id: string }> }>();
    expect(body.changed).toBe(2);
    expect(body.changes).toHaveLength(2);

    const list = (await app.inject({ method: 'GET', url: '/api/v1/products?limit=10' })).json<{
      items: Array<{ name: string; stock: boolean }>;
    }>();
    const byName = Object.fromEntries(list.items.map((p) => [p.name, p.stock]));
    expect(byName['Alpha']).toBe(true);
    expect(byName['Beta']).toBe(true);
    expect(byName['Gamma']).toBe(false);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bulk apply fails closed when a discount exceeds a price — nothing is written', async () => {
  const dir = createTempDir();
  try {
    setup(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true });
    await app.ready();
    const ch = credHeaders(app);

    const ids: string[] = [];
    for (const [name, price] of [
      ['Cheap', 100],
      ['Pricy', 1000],
    ] as const) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        headers: ch,
        payload: { command_id: `create-${name}`, payload: { name, price, category: 'cat1' } },
      });
      ids.push(res.json<{ product: { id: string } }>().product.id);
    }

    // Discount 500 exceeds Cheap's price (100): the whole bulk is rejected
    // (plan 074 invariant) — no partial write, honest failure.
    const applyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/products/bulk/apply',
      headers: ch,
      payload: {
        command_id: 'bulk-skip-1',
        action: 'set_discount_fixed',
        value: 500,
        product_ids: ids,
      },
    });
    expect(applyRes.statusCode).toBe(400);
    expect(String(applyRes.json().error.message)).toContain('exceeds price');

    const list = (await app.inject({ method: 'GET', url: '/api/v1/products?limit=10' })).json<{
      items: Array<{ name: string; discount: number }>;
    }>();
    const byName = Object.fromEntries(list.items.map((p) => [p.name, p.discount]));
    expect(byName['Cheap']).toBe(0);
    expect(byName['Pricy']).toBe(0);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bulk apply scope=all with no matching products is 422 NO_MATCHES', async () => {
  const dir = createTempDir();
  try {
    setup(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/products/bulk/apply',
      headers: credHeaders(app),
      payload: {
        command_id: 'bulk-none-1',
        action: 'set_stock',
        value: true,
        scope: 'all',
        filters: { category: 'nonexistent' },
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('NO_MATCHES');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
