import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import type { FastifyInstance } from 'fastify';
import { ChangeSetRepository } from '../../src/server/repositories/changeSetRepository.ts';
import { ConflictRepository } from '../../src/server/repositories/conflictRepository.ts';

function credHeaders(app: FastifyInstance): Record<string, string> {
  const cred = (app as unknown as { launchCredential?: string }).launchCredential ?? '';
  return { [CREDENTIAL_HEADER]: cred };
}

function createTempDir(): string {
  const dir = resolve(tmpdir(), `cm-cat-conc-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  return dir;
}

function setupRegistry(dir: string, rev: number): void {
  writeFileSync(
    resolve(dir, 'data', 'category_registry.json'),
    JSON.stringify({
      rev,
      nav_groups: [{ id: 'g1', active: true, sort_order: 0 }],
      categories: [
        {
          id: 'cat1',
          key: 'bebidas',
          slug: 'bebidas',
          display_name: { default: 'Bebidas' },
          nav_group: 'g1',
          sort_order: 0,
          active: true,
          subcategories: [
            { id: 's1', title: 'S1', product_key: 's1', slug: 's1', order: 0, enabled: true },
          ],
        },
      ],
    })
  );
}

test('GET /api/v1/categories returns the registry revision', async () => {
  const dir = createTempDir();
  try {
    setupRegistry(dir, 3);
    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/v1/categories' });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ rev: number }>().rev).toBe(3);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PATCH category with stale base_revision returns 409 and does not write', async () => {
  const dir = createTempDir();
  try {
    setupRegistry(dir, 5);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/categories/cat1',
      headers: credHeaders(app),
      payload: { display_name: { default: 'Actualizado' }, base_revision: 4 },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json<{ error: { message: string } }>();
    expect(body.error.message).toContain('Stale category registry revision');

    const after = await app.inject({ method: 'GET', url: '/api/v1/categories' });
    expect(after.json<{ rev: number }>().rev).toBe(5);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PATCH category with fresh base_revision succeeds and bumps rev', async () => {
  const dir = createTempDir();
  try {
    setupRegistry(dir, 5);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/categories/cat1',
      headers: credHeaders(app),
      payload: { display_name: { default: 'Actualizado' }, base_revision: 5 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ rev: number }>().rev).toBe(6);

    const after = await app.inject({ method: 'GET', url: '/api/v1/categories' });
    expect(after.json<{ rev: number }>().rev).toBe(6);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('two concurrent category patches serialize: one wins, the other 409s', async () => {
  const dir = createTempDir();
  try {
    setupRegistry(dir, 0);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const patch = (name: string) =>
      app.inject({
        method: 'PATCH',
        url: '/api/v1/categories/cat1',
        headers: credHeaders(app),
        payload: { display_name: { default: name }, base_revision: 0 },
      });

    const [a, b] = await Promise.all([patch('A'), patch('B')]);
    const statuses = [a.statusCode, b.statusCode].sort();

    expect(statuses).toEqual([200, 409]);

    const after = await app.inject({ method: 'GET', url: '/api/v1/categories' });
    expect(after.json<{ rev: number }>().rev).toBe(1);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('traversal ids in change-set/conflict/backup routes return 400', async () => {
  const dir = createTempDir();
  try {
    setupRegistry(dir, 0);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const probes: Array<[string, string]> = [
      ['PATCH', '/api/v1/change-sets/..%2F..%2Fdata%2Fx'],
      ['POST', '/api/v1/change-sets/..%2F..%2Fdata%2Fx/discard'],
      ['POST', '/api/v1/conflicts/..%2F..%2Fdata%2Fx/resolve'],
      ['POST', '/api/v1/conflicts/..%2F..%2Fdata%2Fx/retry'],
      ['POST', '/api/v1/backup/..%2F..%2Fdata/restore'],
    ];

    for (const [method, url] of probes) {
      const res = await app.inject({ method, url, headers: credHeaders(app) });
      expect(res.statusCode, `${method} ${url}`).toBe(400);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('INVALID_ID');
    }

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('change-set id is immutable: rename and traversal ids in PATCH body return 400', async () => {
  const dir = createTempDir();
  try {
    setupRegistry(dir, 0);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/change-sets',
      headers: credHeaders(app),
      payload: {},
    });
    expect(create.statusCode).toBe(201);
    const id = create.json<{ id: string }>().id;

    for (const evil of ['evil-renamed', '../../x', '..%2F..%2Fdata%2Fx']) {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/change-sets/${id}`,
        headers: credHeaders(app),
        payload: { id: evil },
      });
      expect(res.statusCode, `PATCH id=${evil}`).toBe(400);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('INVALID_ID');
    }

    const list = await app.inject({ method: 'GET', url: '/api/v1/change-sets' });
    const items = list.json<{ items: Array<{ id: string }> }>().items;
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(id);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('category reorder with fresh base_revision succeeds, stale returns 409', async () => {
  const dir = createTempDir();
  try {
    setupRegistry(dir, 0);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const fresh = await app.inject({
      method: 'POST',
      url: '/api/v1/categories/reorder',
      headers: credHeaders(app),
      payload: { ordered_ids: ['cat1'], base_revision: 0 },
    });
    expect(fresh.statusCode).toBe(200);
    expect(fresh.json<{ rev: number }>().rev).toBe(1);

    const stale = await app.inject({
      method: 'POST',
      url: '/api/v1/categories/reorder',
      headers: credHeaders(app),
      payload: { ordered_ids: ['cat1'], base_revision: 0 },
    });
    expect(stale.statusCode).toBe(409);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('subcategory reorder with fresh base_revision succeeds, stale returns 409', async () => {
  const dir = createTempDir();
  try {
    setupRegistry(dir, 0);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const payload = { ordered_ids: ['s1'], base_revision: 0 };
    const fresh = await app.inject({
      method: 'POST',
      url: '/api/v1/categories/cat1/subcategories/reorder',
      headers: credHeaders(app),
      payload,
    });
    expect(fresh.statusCode).toBe(200);
    expect(fresh.json<{ rev: number }>().rev).toBe(1);

    const stale = await app.inject({
      method: 'POST',
      url: '/api/v1/categories/cat1/subcategories/reorder',
      headers: credHeaders(app),
      payload,
    });
    expect(stale.statusCode).toBe(409);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('repositories never touch the filesystem with an unsafe id', async () => {
  const dir = createTempDir();
  try {
    const changeSets = new ChangeSetRepository(dir);
    const conflicts = new ConflictRepository(dir);

    expect(changeSets.load('../../data/x')).toBeNull();
    expect(changeSets.delete('../../data/x')).toBe(false);
    expect(conflicts.load('../../data/x')).toBeNull();
    expect(conflicts.delete('../../data/x')).toBe(false);

    changeSets.save({ id: '../../x' } as never);
    conflicts.save({ id: '../../x' } as never);

    const escapedPath = resolve(dir, '..', 'x.json');
    expect(existsSync(escapedPath)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
