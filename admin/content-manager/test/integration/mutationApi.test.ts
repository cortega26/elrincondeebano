import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { FastifyInstance } from 'fastify';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';

function createTempDir(): string {
  const dir = resolve(tmpdir(), `cm-api-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  return dir;
}

function getCredential(app: FastifyInstance): string {
  const cred = (app as unknown as Record<string, unknown>).launchCredential;
  return typeof cred === 'string' ? cred : '';
}

function credHeaders(app: FastifyInstance): Record<string, string> {
  return { [CREDENTIAL_HEADER]: getCredential(app) };
}

const baseCatalog = {
  version: '20260715-test',
  last_updated: '2026-07-15T00:00:00.000Z',
  rev: 5,
  products: [
    {
      name: 'Producto Uno',
      description: 'Primer producto',
      price: 1000,
      discount: 0,
      stock: true,
      category: 'cat1',
      image_path: '',
      image_avif_path: '',
      order: 0,
      is_archived: false,
      rev: 1,
      field_last_modified: {},
    },
  ],
};

const baseCategories = {
  nav_groups: [],
  categories: [],
};

const baseStorefront = {
  trustBar: { highlights: [], statusItems: [] },
  home: {
    primaryCategories: [],
    secondaryCategories: [],
    fallbackQuickPicks: [],
    featuredStaples: [],
  },
  bundles: [],
  companionRules: [],
};

function setupDir(dir: string, catalog: unknown = baseCatalog): void {
  writeFileSync(resolve(dir, 'data', 'product_data.json'), JSON.stringify(catalog));
  writeFileSync(resolve(dir, 'data', 'category_registry.json'), JSON.stringify(baseCategories));
  writeFileSync(
    resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
    JSON.stringify(baseStorefront)
  );
}

test('POST /api/v1/products is blocked when writes disabled (read-only mode)', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);
    const app = createApp({ repoRoot: dir, enableWrites: false });

    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      payload: { command_id: 'cmd-1', payload: { name: 'X', price: 100 } },
    });

    expect(response.statusCode).toBe(405);
    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PATCH /api/v1/products/:id is blocked when writes disabled (read-only mode)', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);
    const app = createApp({ repoRoot: dir, enableWrites: false });

    await app.ready();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/products/some-id',
      payload: { command_id: 'cmd-2', base_revision: 1, payload: {} },
    });

    expect(response.statusCode).toBe(405);
    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/products creates a product when writes enabled', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true });

    await app.ready();
    const ch = credHeaders(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: ch,
      payload: {
        command_id: 'cmd-create-1',
        payload: { name: 'Nuevo', price: 5000, description: 'Creado vía API', category: 'cat1' },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ product: { name: string; id: string } }>();
    expect(body.product.name).toBe('Nuevo');
    expect(body.product.id).toBeDefined();

    // Verify GET returns the new product
    const listResponse = await app.inject({ method: 'GET', url: '/api/v1/products' });
    const list = listResponse.json<{ total: number }>();
    expect(list.total).toBe(2);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/products rejects missing command_id', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true });

    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: credHeaders(app),
      payload: { payload: { name: 'X', price: 100 } },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/products rejects invalid product data', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true });

    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: credHeaders(app),
      payload: { command_id: 'cmd-bad', payload: { name: '', price: -1 } },
    });

    expect(response.statusCode).toBe(422);
    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PATCH /api/v1/products/:id updates a product', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);

    const app1 = createApp({ repoRoot: dir, enableWrites: true });
    await app1.ready();
    const ch1 = credHeaders(app1);
    const createRes = await app1.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: ch1,
      payload: {
        command_id: 'cmd-create',
        payload: { name: 'Editable', price: 3000, stock: true, category: 'cat1' },
      },
    });
    const created = createRes.json<{
      product: { id: string; rev: number };
      resulting_revision: number;
    }>();
    const productId = created.product.id;
    await app1.close();

    const app2 = createApp({ repoRoot: dir, enableWrites: true });
    await app2.ready();
    const ch2 = credHeaders(app2);
    const editRes = await app2.inject({
      method: 'PATCH',
      url: `/api/v1/products/${productId}`,
      headers: ch2,
      payload: {
        command_id: 'cmd-edit',
        base_revision: 1,
        payload: { price: 4000, stock: false },
      },
    });

    expect(editRes.statusCode).toBe(200);
    const edited = editRes.json<{
      product: { price: number; stock: boolean };
      changed_fields: string[];
    }>();
    expect(edited.product.price).toBe(4000);
    expect(edited.product.stock).toBe(false);
    expect(edited.changed_fields).toContain('price');
    expect(edited.changed_fields).toContain('stock');

    await app2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PATCH /api/v1/products/:id returns 409 for stale revision', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);

    const app1 = createApp({ repoRoot: dir, enableWrites: true });
    await app1.ready();
    const createRes = await app1.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: credHeaders(app1),
      payload: {
        command_id: 'cmd-a',
        payload: { name: 'Conflict Test', price: 1000, category: 'cat1' },
      },
    });
    const {
      product: { id },
    } = createRes.json<{ product: { id: string } }>();
    await app1.close();

    const app2 = createApp({ repoRoot: dir, enableWrites: true });
    await app2.ready();
    const editRes = await app2.inject({
      method: 'PATCH',
      url: `/api/v1/products/${id}`,
      headers: credHeaders(app2),
      payload: {
        command_id: 'cmd-stale',
        base_revision: 99,
        payload: { price: 9999 },
      },
    });

    expect(editRes.statusCode).toBe(409);
    await app2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/products with same command_id is idempotent', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true });
    await app.ready();
    const ch = credHeaders(app);

    const payload = {
      command_id: 'cmd-idem',
      payload: { name: 'Idempotent', price: 1000, category: 'cat1' },
    };

    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: ch,
      payload,
    });
    expect(res1.statusCode).toBe(201);

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: ch,
      payload,
    });
    expect(res2.statusCode).toBe(201);

    // Only one product should have been created
    const listRes = await app.inject({ method: 'GET', url: '/api/v1/products' });
    const list = listRes.json<{ total: number }>();
    expect(list.total).toBe(2); // 1 original + 1 created once

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PATCH /api/v1/products/:id rejects a price lowered below the existing discount', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);

    const app1 = createApp({ repoRoot: dir, enableWrites: true });
    await app1.ready();
    const createRes = await app1.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: credHeaders(app1),
      payload: {
        command_id: 'cmd-create-discounted',
        payload: { name: 'Con descuento', price: 1000, discount: 800, category: 'cat1' },
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json<{ product: { id: string } }>();
    await app1.close();

    const app2 = createApp({ repoRoot: dir, enableWrites: true });
    await app2.ready();
    const editRes = await app2.inject({
      method: 'PATCH',
      url: `/api/v1/products/${created.product.id}`,
      headers: credHeaders(app2),
      payload: {
        command_id: 'cmd-lower-price',
        base_revision: 1,
        payload: { price: 500 },
      },
    });

    expect(editRes.statusCode).toBe(422);
    const body = editRes.json<{ error: { message: string } }>();
    expect(body.error.message).toContain('Price');

    await app2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/products still loads a legacy catalog with discount > price', async () => {
  const dir = createTempDir();
  try {
    const legacyCatalog = {
      ...baseCatalog,
      products: [
        { ...baseCatalog.products[0], name: 'Legacy corrupto', price: 100, discount: 300 },
      ],
    };
    setupDir(dir, legacyCatalog);

    const app = createApp({ repoRoot: dir, enableWrites: false });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/v1/products' });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ items: Array<{ discount: number; price: number }> }>();
    expect(body.items[0].discount).toBe(300);
    expect(body.items[0].price).toBe(100);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── plan 097 deferred: media relocation on category change ───────────────────

test('PATCH category relocates image files and updates the paths', async () => {
  const dir = createTempDir();
  setupDir(dir);
  try {
    mkdirSync(resolve(dir, 'assets', 'images', 'oldcat'), { recursive: true });
    mkdirSync(resolve(dir, 'assets', 'images', 'newcat'), { recursive: true });
    writeFileSync(resolve(dir, 'assets', 'images', 'oldcat', 'foto.webp'), 'FAKE-WEBP');
    writeFileSync(resolve(dir, 'assets', 'images', 'oldcat', 'foto.avif'), 'FAKE-AVIF');

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    // Create the product via the API (the fixture products have no ids).
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: ch,
      payload: {
        command_id: 'reloc-create',
        payload: {
          name: 'Reloc Target',
          price: 1000,
          category: 'oldcat',
          image_path: 'assets/images/oldcat/foto.webp',
          image_avif_path: 'assets/images/oldcat/foto.avif',
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const pid = created.json<{ product: { id: string } }>().product.id;

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/products/${pid}`,
      headers: ch,
      payload: {
        command_id: 'reloc-move',
        base_revision: 1,
        payload: { category: 'newcat' },
      },
    });
    expect(patched.statusCode).toBe(200);
    const body = patched.json<{
      product: { image_path: string; image_avif_path: string };
    }>();
    expect(body.product.image_path).toBe('assets/images/newcat/foto.webp');
    expect(body.product.image_avif_path).toBe('assets/images/newcat/foto.avif');

    expect(existsSync(resolve(dir, 'assets', 'images', 'oldcat', 'foto.webp'))).toBe(false);
    expect(existsSync(resolve(dir, 'assets', 'images', 'newcat', 'foto.webp'))).toBe(true);
    expect(readFileSync(resolve(dir, 'assets', 'images', 'newcat', 'foto.webp'), 'utf8')).toBe(
      'FAKE-WEBP'
    );
    expect(existsSync(resolve(dir, 'assets', 'images', 'newcat', 'foto.avif'))).toBe(true);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PATCH product rejects category with path traversal (plan 100)', async () => {
  const dir = createTempDir();
  setupDir(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: ch,
      payload: {
        command_id: 'traversal-create',
        payload: { name: 'Traversal Target', price: 1000, category: 'okcat' },
      },
    });
    expect(created.statusCode).toBe(201);
    const pid = created.json<{ product: { id: string } }>().product.id;

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/products/${pid}`,
      headers: ch,
      payload: {
        command_id: 'traversal-move',
        base_revision: 1,
        payload: { category: '../../../../../../tmp/escaped' },
      },
    });
    expect(patched.statusCode).toBe(422);

    const product = await app.inject({
      method: 'GET',
      url: `/api/v1/products/${pid}`,
    });
    expect(product.json<{ category: string }>().category).toBe('okcat');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('concurrent catalog edits do not leak into each other (plan 105)', async () => {
  const dir = createTempDir();
  setupDir(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const mk = async (name: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        headers: ch,
        payload: { command_id: `mk-${name}`, payload: { name, price: 1000, category: 'cat1' } },
      });
      expect(res.statusCode).toBe(201);
      return res.json<{ product: { id: string } }>().product.id;
    };
    const a = await mk('Concurrent A');
    const b = await mk('Concurrent B');

    const [ra, rb] = await Promise.all([
      app.inject({
        method: 'PATCH',
        url: `/api/v1/products/${a}`,
        headers: ch,
        payload: { command_id: 'conc-a', base_revision: 1, payload: { price: 2000 } },
      }),
      app.inject({
        method: 'PATCH',
        url: `/api/v1/products/${b}`,
        headers: ch,
        payload: { command_id: 'conc-b', base_revision: 1, payload: { price: 3000 } },
      }),
    ]);

    // Exactly one succeeds; the loser gets 409 AND its edit is not on disk
    // (pre-plan-105 the shared cache wrote both edits under one command).
    console.log(
      'STATUSES',
      ra.statusCode,
      rb.statusCode,
      ra.body.slice(0, 120),
      rb.body.slice(0, 120)
    );
    // Contract: a 200 means the edit is on disk; a 409 means it is NOT —
    // pre-plan-105 a concurrent loser got 409 while its edit was silently
    // merged into the winner's write. (Requests may serialize: both 200 is
    // valid — each re-reads fresh state at its write time.)
    const okA = ra.statusCode === 200;
    const okB = rb.statusCode === 200;
    expect([ra.statusCode, rb.statusCode].sort()).toEqual([200, okA === okB ? 200 : 409]);
    const readBack = async (id: string) => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/products/${id}` });
      return res.json<{ price: number }>().price;
    };
    if (okA) expect(await readBack(a)).toBe(2000);
    else expect(await readBack(a)).toBe(1000);
    if (okB) expect(await readBack(b)).toBe(3000);
    else expect(await readBack(b)).toBe(1000);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('batch-update applies all ops in one write and rejects stale batches atomically (plan 121)', async () => {
  const dir = createTempDir();
  setupDir(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const mk = async (name: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        headers: ch,
        payload: { command_id: `mk-${name}`, payload: { name, price: 1000, category: 'cat1' } },
      });
      expect(res.statusCode).toBe(201);
      return res.json<{ product: { id: string; rev: number } }>().product;
    };
    const a = await mk('Batch A');
    const b = await mk('Batch B');

    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/products/batch-update',
      headers: ch,
      payload: {
        command_id: 'batch-ok',
        updates: [
          { id: a.id, rev: a.rev, patch: { price: 2000 } },
          { id: b.id, rev: b.rev, patch: { stock: true } },
        ],
      },
    });
    expect(ok.statusCode).toBe(200);
    const okBody = ok.json<{ applied: number; resulting_revision: number }>();
    expect(okBody.applied).toBe(2);

    const ga = await app.inject({ method: 'GET', url: `/api/v1/products/${a.id}` });
    const gb = await app.inject({ method: 'GET', url: `/api/v1/products/${b.id}` });
    expect(ga.json<{ price: number }>().price).toBe(2000);
    expect(gb.json<{ stock: boolean }>().stock).toBe(true);

    // Stale rev in ANY op aborts the whole batch with no partial writes.
    const stale = await app.inject({
      method: 'POST',
      url: '/api/v1/products/batch-update',
      headers: ch,
      payload: {
        command_id: 'batch-stale',
        updates: [
          { id: a.id, rev: a.rev, patch: { price: 9999 } },
          { id: b.id, rev: 999, patch: { price: 8888 } },
        ],
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(
      stale.json<{ error: { details: string[] } }>().error.details.some((d) => d.includes('stale'))
    ).toBe(true);

    const after = await app.inject({ method: 'GET', url: `/api/v1/products/${a.id}` });
    expect(after.json<{ price: number }>().price).toBe(2000);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
