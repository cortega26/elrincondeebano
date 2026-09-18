// Plan 173: reorder set-membership — length + duplicates is not enough; the
// submitted id SET must equal the catalog id set, or unknown ids are skipped
// while missing products keep stale orders (duplicate `order` values, 200).
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

function jsonHeaders(app: FastifyInstance): Record<string, string> {
  return { [CREDENTIAL_HEADER]: getCredential(app), 'Content-Type': 'application/json' };
}

function createTempDir(): string {
  return resolve(
    tmpdir(),
    `cm-reorder-membership-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function seedProduct(id: string, order: number) {
  return {
    id,
    name: `Product ${id}`,
    description: '',
    price: 100,
    discount: 0,
    stock: true,
    category: 'abarrotes',
    order,
    is_archived: false,
    rev: 0,
    field_last_modified: {},
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
      products: [seedProduct('a', 0), seedProduct('b', 1), seedProduct('c', 2)],
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

async function ordersById(app: FastifyInstance): Promise<Record<string, number>> {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/products',
    headers: jsonHeaders(app),
  });
  const entries = res.json().items as Array<{ id: string; order: number }>;
  return Object.fromEntries(entries.map((p) => [p.id, p.order]));
}

test('reorder with unknown ids is rejected and leaves orders untouched', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/products/reorder',
        headers: jsonHeaders(app),
        payload: { command_id: 're-1', ordered_ids: ['c', 'b', 'X'] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).toContain('exactly the catalog id set');
      expect(await ordersById(app)).toEqual({ a: 0, b: 1, c: 2 });
    } finally {
      await app.close();
    }
  } finally {
    cleanup(dir);
  }
});

test('reorder with missing ids still fails the length guard', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/products/reorder',
        headers: jsonHeaders(app),
        payload: { command_id: 're-2', ordered_ids: ['c', 'b'] },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('REORDER_SCOPE_AMBIGUOUS');
      expect(await ordersById(app)).toEqual({ a: 0, b: 1, c: 2 });
    } finally {
      await app.close();
    }
  } finally {
    cleanup(dir);
  }
});

test('exact permutation reorders 0..N correctly', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/products/reorder',
        headers: jsonHeaders(app),
        payload: { command_id: 're-3', ordered_ids: ['c', 'b', 'a'] },
      });
      expect(res.statusCode).toBe(200);
      expect(await ordersById(app)).toEqual({ c: 0, b: 1, a: 2 });
    } finally {
      await app.close();
    }
  } finally {
    cleanup(dir);
  }
});
