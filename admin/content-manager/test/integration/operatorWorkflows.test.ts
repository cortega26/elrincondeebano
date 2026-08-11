import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import type { FastifyInstance } from 'fastify';

function getCredential(app: FastifyInstance): string {
  const cred = (app as unknown as { launchCredential?: string }).launchCredential;
  return typeof cred === 'string' ? cred : '';
}

function credHeaders(app: FastifyInstance): Record<string, string> {
  return { [CREDENTIAL_HEADER]: getCredential(app) };
}

function createTempDir(): string {
  return resolve(tmpdir(), `cm-operator-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
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
      rev: 1,
      products: [
        {
          id: 'p1',
          name: 'Café',
          description: 'Grano',
          price: 4500,
          discount: 500,
          stock: true,
          category: 'bebidas',
          image_path: 'assets/images/cafe.jpg',
          image_avif_path: 'assets/images/cafe.avif',
          order: 0,
          is_archived: false,
          rev: 1,
          field_last_modified: {},
        },
        {
          id: 'p2',
          name: 'Agua',
          description: 'Mineral',
          price: 1000,
          discount: 0,
          stock: false,
          category: 'bebidas',
          image_path: '',
          image_avif_path: '',
          order: 1,
          is_archived: false,
          rev: 1,
          field_last_modified: {},
        },
      ],
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

// ── min/max price filters ────────────────────────────────────────────────────

test('GET /api/v1/products filters by min_price and max_price', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const min = await app.inject({ method: 'GET', url: '/api/v1/products?min_price=2000' });
    expect(min.statusCode).toBe(200);
    expect(min.json<{ total: number }>().total).toBe(1);
    expect(min.json<{ items: Array<{ name: string }> }>().items[0].name).toBe('Café');

    const max = await app.inject({ method: 'GET', url: '/api/v1/products?max_price=2000' });
    expect(max.json<{ total: number }>().total).toBe(1);
    expect(max.json<{ items: Array<{ name: string }> }>().items[0].name).toBe('Agua');

    const range = await app.inject({
      method: 'GET',
      url: '/api/v1/products?min_price=2000&max_price=3000',
    });
    expect(range.json<{ total: number }>().total).toBe(0);

    const both = await app.inject({
      method: 'GET',
      url: '/api/v1/products?min_price=500&max_price=5000',
    });
    expect(both.json<{ total: number }>().total).toBe(2);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/products tolerates empty or invalid price params', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const empty = await app.inject({ method: 'GET', url: '/api/v1/products?min_price=' });
    expect(empty.statusCode).toBe(200);
    expect(empty.json<{ total: number }>().total).toBe(2);

    const invalid = await app.inject({ method: 'GET', url: '/api/v1/products?min_price=abc' });
    expect(invalid.statusCode).toBe(200);
    expect(invalid.json<{ total: number }>().total).toBe(0);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── full-field create / duplicate semantics ──────────────────────────────────

test('POST /api/v1/products persists every editable field', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: credHeaders(app),
      payload: {
        command_id: 'cmd-full',
        payload: {
          name: 'Té Verde',
          description: 'Suelto',
          price: 2500,
          discount: 300,
          stock: true,
          category: 'bebidas',
          image_path: 'assets/images/te.png',
          image_avif_path: 'assets/images/te.avif',
        },
      },
    });
    expect(res.statusCode).toBe(201);
    const created = res.json<{
      product: {
        id: string;
        name: string;
        discount: number;
        image_path: string;
        image_avif_path: string;
        rev: number;
      };
    }>().product;
    expect(created.discount).toBe(300);
    expect(created.image_path).toBe('assets/images/te.png');
    expect(created.image_avif_path).toBe('assets/images/te.avif');
    expect(created.rev).toBe(1);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('create-from-copy yields a fresh identity with full field parity', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const original = (await app.inject({ method: 'GET', url: '/api/v1/products/p1' })).json<{
      id: string;
      name: string;
      price: number;
      discount: number;
      stock: boolean;
      category: string;
      image_path: string;
      image_avif_path: string;
      rev: number;
    }>();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: ch,
      payload: {
        command_id: 'cmd-dup',
        payload: {
          name: 'Café (copia)',
          price: original.price,
          description: 'Grano',
          discount: original.discount,
          stock: original.stock,
          category: original.category,
          image_path: original.image_path,
          image_avif_path: original.image_avif_path,
        },
      },
    });
    expect(res.statusCode).toBe(201);
    const copy = res.json<{
      product: {
        id: string;
        name: string;
        rev: number;
        field_last_modified: Record<string, unknown>;
      };
    }>().product;

    expect(copy.id).not.toBe(original.id);
    expect(copy.rev).toBe(1);
    // Fresh metadata: the copy only records its own creation, nothing from the
    // source product (which was seeded with empty field_last_modified).
    expect(copy.field_last_modified['price']).toBeUndefined();
    expect(copy.field_last_modified['name']?.rev).toBe(1);

    const fetched = (await app.inject({ method: 'GET', url: `/api/v1/products/${copy.id}` })).json<{
      price: number;
      discount: number;
      stock: boolean;
      category: string;
      image_path: string;
      image_avif_path: string;
    }>();
    expect(fetched.price).toBe(original.price);
    expect(fetched.discount).toBe(original.discount);
    expect(fetched.stock).toBe(original.stock);
    expect(fetched.category).toBe(original.category);
    expect(fetched.image_path).toBe(original.image_path);
    expect(fetched.image_avif_path).toBe(original.image_avif_path);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
