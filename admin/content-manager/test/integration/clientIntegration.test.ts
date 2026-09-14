import { test, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { ContentManagerClient, ApiRequestError } from '../../src/web/api/client.ts';
import { setCredential, resetCredential } from '../../src/web/app/credentialStore.ts';

let dir: string;
let app: FastifyInstance;
let client: ContentManagerClient;
let baseUrl: string;

beforeAll(async () => {
  dir = resolve(tmpdir(), `cm-client-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  execFileSync('git', ['init'], { cwd: dir, encoding: 'utf-8' });
  execFileSync('git', ['config', 'user.email', 't@t.com'], { cwd: dir, encoding: 'utf-8' });
  execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir, encoding: 'utf-8' });
  writeFileSync(
    resolve(dir, 'data', 'product_data.json'),
    JSON.stringify({ version: 't', last_updated: '', rev: 0, products: [] })
  );
  writeFileSync(
    resolve(dir, 'data', 'category_registry.json'),
    JSON.stringify({
      rev: 0,
      nav_groups: [
        { id: 'g1', active: true, sort_order: 0 },
        { id: 'g2', active: true, sort_order: 1 },
      ],
      categories: [
        {
          id: 'c1',
          key: 'k1',
          slug: 's1',
          display_name: { default: 'C1' },
          nav_group: 'g1',
          sort_order: 0,
          active: true,
        },
        {
          id: 'c2',
          key: 'k2',
          slug: 's2',
          display_name: { default: 'C2' },
          nav_group: 'g1',
          sort_order: 1,
          active: true,
        },
      ],
    })
  );

  app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
  await app.ready();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  baseUrl = typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : '';

  const credential = (app as unknown as { launchCredential?: string }).launchCredential ?? '';
  setCredential(credential);
  client = new ContentManagerClient(baseUrl);
});

afterAll(async () => {
  resetCredential();
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test('client deleteCategory resolves on 204 (no json body) and deletes the category', async () => {
  const rev = (await client.getCategories()).rev;

  await expect(client.deleteCategory('c2', rev)).resolves.toBeUndefined();

  const after = await client.getCategories();
  expect(after.categories.some((c) => c.id === 'c2')).toBe(false);
});

test('client surfaces the server 409 message with status on stale base_revision', async () => {
  const rev = (await client.getCategories()).rev;

  await expect(client.updateCategory('c1', { active: false }, rev - 1)).rejects.toMatchObject({
    status: 409,
  });
});

test('client deleteNavGroup resolves on 204', async () => {
  const rev = (await client.getCategories()).rev;

  await expect(client.deleteNavGroup('g2', rev)).resolves.toBeUndefined();
});

test('client throws ApiRequestError with status for 404', async () => {
  try {
    await client.updateCategory('does-not-exist', { active: false }, 0);
    expect.unreachable('should have thrown');
  } catch (err) {
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).status).toBe(404);
  }
});

test('client getProducts paginates (page/limit/total contract)', async () => {
  await client.createProduct({ name: 'Page A', price: 100, category: 'cat1' });
  await client.createProduct({ name: 'Page B', price: 200, category: 'cat1' });
  await client.createProduct({ name: 'Page C', price: 300, category: 'cat1' });

  const first = await client.getProducts({ page: 1, limit: 2 });
  expect(first.items).toHaveLength(2);
  expect(first.total).toBeGreaterThanOrEqual(3);

  const second = await client.getProducts({ page: 2, limit: 2 });
  expect(second.items.length).toBeGreaterThan(0);
  expect(second.items.length).toBeLessThanOrEqual(2);
  const overlap = first.items.filter((p) => second.items.some((q) => q.id === p.id));
  expect(overlap).toHaveLength(0);
});

test('client bulkApply round-trips changed counts and skipped (plan 172 additive field)', async () => {
  const ids: string[] = [];
  for (const name of ['Bulk A', 'Bulk B', 'Bulk C']) {
    const created = await client.createProduct({ name, price: 1000, category: 'cat1' });
    ids.push(created.product.id);
  }

  const result = await client.bulkApply('set_discount_fixed', 100, ids);
  expect(result.changed).toBe(3);
  // `skipped` is server-additive (plan 172); the client type adopts it in
  // plan 197 — read it loosely here so the contract is still pinned.
  expect((result as unknown as { skipped?: number }).skipped).toBe(0);

  const check = await client.getProducts({ q: 'Bulk', limit: 50 });
  for (const item of check.items) {
    expect(item.discount).toBe(100);
  }
});

test('client reorderProducts applies a full-catalog permutation', async () => {
  const all = await client.getProducts({ limit: 200 });
  expect(all.total).toBe(all.items.length);
  const ids = all.items.map((p) => p.id).filter(Boolean) as string[];
  expect(ids.length).toBeGreaterThan(0);

  const reversed = [...ids].reverse();
  const result = await client.reorderProducts(reversed);
  expect(result.reordered).toBe(ids.length);

  const after = await client.getProducts({ limit: 200 });
  expect(after.items.map((p) => p.id)).toEqual(reversed);
});

test('client importPreview propagates the server 400 error shape', async () => {
  try {
    await client.importPreview({ nope: 1 });
    expect.unreachable('should have thrown');
  } catch (err) {
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).status).toBe(400);
  }
});

test('client exportCsv pins the current raw-fetch behavior (plan 197 owns the fix)', async () => {
  const res = await client.exportCsv();
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/csv');
});

test('real 409 race through the client resolves exactly-once, then recovers', async () => {
  const created = await client.createProduct({ name: 'Race', price: 100, category: 'cat1' });
  const id = created.product.id;
  const rev = created.product.rev;

  // Stale base revision surfaces a 409 with the conflict envelope.
  await expect(client.updateProduct(id, 0, { price: 101 })).rejects.toMatchObject({
    status: 409,
  });

  // Fresh revision succeeds (the retry leg of withFreshRev, plan 141).
  const ok = await client.updateProduct(id, rev, { price: 101 });
  expect(ok.product.price).toBe(101);

  // Two concurrent edits on the same base revision: exactly one wins.
  const fresh = ok.product.rev;
  const [a, b] = await Promise.allSettled([
    client.updateProduct(id, fresh, { price: 102 }),
    client.updateProduct(id, fresh, { price: 103 }),
  ]);
  const statuses = [a, b]
    .map((r) => (r.status === 'fulfilled' ? 200 : (r.reason as ApiRequestError).status))
    .sort();
  expect(statuses).toEqual([200, 409]);

  // Recovery: refetch and retry once with the fresh revision.
  const current = await client.getProducts({ q: 'Race', limit: 10 });
  expect(current.items).toHaveLength(1);
  const recovered = await client.updateProduct(id, current.items[0].rev, { price: 104 });
  expect(recovered.product.price).toBe(104);
});
