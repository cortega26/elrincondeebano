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
