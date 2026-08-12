import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { FastifyInstance } from 'fastify';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';

function createTempDir(): string {
  const dir = resolve(tmpdir(), `cm-cat-mut-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  return dir;
}

function getCredential(app: FastifyInstance): string {
  const cred = (app as unknown as { launchCredential?: string }).launchCredential;
  return typeof cred === 'string' ? cred : '';
}

function credHeaders(app: FastifyInstance): Record<string, string> {
  return { [CREDENTIAL_HEADER]: getCredential(app) };
}

function setupData(dir: string): void {
  writeFileSync(
    resolve(dir, 'data', 'category_registry.json'),
    JSON.stringify({
      rev: 5,
      nav_groups: [{ id: 'g1', sort_order: 0 }],
      categories: [
        {
          id: 'cat1',
          key: 'bebidas',
          slug: 'bebidas',
          display_name: { default: 'Bebidas' },
          nav_group: 'g1',
          sort_order: 0,
        },
      ],
    })
  );
  writeFileSync(
    resolve(dir, 'data', 'product_data.json'),
    JSON.stringify({
      version: '20260811-test',
      last_updated: '2026-08-11T00:00:00.000Z',
      rev: 1,
      products: [
        {
          name: 'Agua Mineral',
          description: '',
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
    })
  );
}

function readRegistry(dir: string): { rev: number; categories: Array<{ id: string }> } {
  return JSON.parse(readFileSync(resolve(dir, 'data', 'category_registry.json'), 'utf8'));
}

test('POST /api/v1/categories creates a category and writes the file', async () => {
  const dir = createTempDir();
  try {
    setupData(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: credHeaders(app),
      payload: {
        id: 'cat2',
        key: 'snacks',
        slug: 'snacks',
        display_name: { default: 'Snacks' },
        base_revision: 5,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; rev: number }>();
    expect(body.id).toBe('cat2');
    expect(body.rev).toBeGreaterThan(5);

    const onDisk = readRegistry(dir);
    expect(onDisk.rev).toBeGreaterThan(5);
    expect(onDisk.categories.some((c) => c.id === 'cat2')).toBe(true);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/categories rejects missing fields and duplicates', async () => {
  const dir = createTempDir();
  try {
    setupData(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: ch,
      payload: { id: 'cat2', slug: 'snacks', base_revision: 5 },
    });
    expect(missing.statusCode).toBe(400);

    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: ch,
      payload: { id: 'cat1', key: 'x', slug: 'x', base_revision: 5 },
    });
    expect(dup.statusCode).toBe(409);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/categories rejects a stale base_revision with 409', async () => {
  const dir = createTempDir();
  try {
    setupData(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: credHeaders(app),
      payload: { id: 'cat2', key: 'snacks', slug: 'snacks', base_revision: 99 },
    });

    expect(res.statusCode).toBe(409);

    const onDisk = readRegistry(dir);
    expect(onDisk.categories.some((c) => c.id === 'cat2')).toBe(false);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PATCH /api/v1/categories/:id edits a category and writes the file', async () => {
  const dir = createTempDir();
  try {
    setupData(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/categories/cat1',
      headers: credHeaders(app),
      payload: { display_name: { default: 'Bebidas y Aguas' }, base_revision: 5 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ id: string; display_name?: { default?: string } }>();
    expect(body.id).toBe('cat1');
    expect(body.display_name?.default).toBe('Bebidas y Aguas');

    const onDisk = readRegistry(dir);
    expect(onDisk.rev).toBeGreaterThan(5);

    const missing = await app.inject({
      method: 'PATCH',
      url: '/api/v1/categories/nope',
      headers: credHeaders(app),
      payload: { sort_order: 9, base_revision: 5 },
    });
    expect(missing.statusCode).toBe(404);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('DELETE /api/v1/categories/:id is blocked while products use the category', async () => {
  const dir = createTempDir();
  try {
    setupData(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const inUse = await app.inject({
      method: 'DELETE',
      url: '/api/v1/categories/cat1',
      headers: ch,
      payload: { base_revision: 5 },
    });
    expect(inUse.statusCode).toBe(409);
    expect(inUse.json<{ error: { message: string; code: string } }>().error.message).toContain(
      'en uso'
    );

    // Remove the product usage, then the delete succeeds
    writeFileSync(
      resolve(dir, 'data', 'product_data.json'),
      JSON.stringify({
        version: '20260811-test',
        last_updated: '2026-08-11T00:00:00.000Z',
        rev: 2,
        products: [],
      })
    );

    const ok = await app.inject({
      method: 'DELETE',
      url: '/api/v1/categories/cat1',
      headers: ch,
      payload: { base_revision: 5 },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json<{ status: string }>().status).toBe('deleted');
    expect(readRegistry(dir).categories.some((c) => c.id === 'cat1')).toBe(false);

    const gone = await app.inject({
      method: 'DELETE',
      url: '/api/v1/categories/cat1',
      headers: ch,
      payload: { base_revision: 5 },
    });
    expect(gone.statusCode).toBe(404);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/nav-groups creates and rejects duplicates', async () => {
  const dir = createTempDir();
  try {
    setupData(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/nav-groups',
      headers: ch,
      payload: { id: 'g2', base_revision: 5 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ id: string }>().id).toBe('g2');
    expect(readRegistry(dir).rev).toBeGreaterThan(5);

    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/nav-groups',
      headers: ch,
      payload: { id: 'g2', base_revision: 5 },
    });
    expect(dup.statusCode).toBe(409);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('DELETE /api/v1/nav-groups/:id is blocked in use and succeeds when unused', async () => {
  const dir = createTempDir();
  try {
    setupData(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const inUse = await app.inject({
      method: 'DELETE',
      url: '/api/v1/nav-groups/g1',
      headers: ch,
      payload: { base_revision: 5 },
    });
    expect(inUse.statusCode).toBe(409);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/nav-groups',
      headers: ch,
      payload: { id: 'g2', base_revision: 5 },
    });
    expect(created.statusCode).toBe(201);
    const createdRev = created.json<{ rev: number }>().rev;

    const ok = await app.inject({
      method: 'DELETE',
      url: '/api/v1/nav-groups/g2',
      headers: ch,
      payload: { base_revision: createdRev },
    });
    expect(ok.statusCode).toBe(204);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('category mutations reject requests without a credential (401)', async () => {
  const dir = createTempDir();
  try {
    setupData(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      payload: { id: 'cat2', key: 'snacks', slug: 'snacks', base_revision: 5 },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('category mutations are rejected in read-only mode (405)', async () => {
  const dir = createTempDir();
  try {
    setupData(dir);
    const app = createApp({ repoRoot: dir, enableWrites: false, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      payload: { id: 'cat2', key: 'snacks', slug: 'snacks', base_revision: 5 },
    });

    expect(res.statusCode).toBe(405);
    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── plan 096: reassign delete + nav-group edit ───────────────────────────────

test('DELETE /api/v1/categories/:id reassigns products and deletes', async () => {
  const dir = createTempDir();
  setupData(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    // Products referencing cat1 (fixture has one in cat1); cat2 is the
    // reassignment target — create it first.
    const cat2 = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: ch,
      payload: {
        id: 'cat2',
        key: 'cat2',
        slug: 'cat2',
        display_name: { default: 'Cat 2' },
        base_revision: 5,
      },
    });
    expect(cat2.statusCode).toBe(201);

    const del = await app.inject({
      method: 'DELETE',
      url: '/api/v1/categories/cat1',
      headers: ch,
      payload: { reassign_to: 'cat2', base_revision: 6 },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json<{ status: string; reassigned: number }>().status).toBe('deleted');
    expect(del.json<{ reassigned: number }>().reassigned).toBeGreaterThan(0);

    const catalog = JSON.parse(readFileSync(resolve(dir, 'data', 'product_data.json'), 'utf8'));
    for (const p of catalog.products) {
      expect(p.category).not.toBe('cat1');
    }
    const registry = readRegistry(dir);
    expect(registry.categories.some((c: { id: string }) => c.id === 'cat1')).toBe(false);

    // Reassign to a missing target is rejected.
    const bad = await app.inject({
      method: 'DELETE',
      url: '/api/v1/categories/cat2',
      headers: ch,
      payload: { reassign_to: 'nope', base_revision: 6 },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('REASSIGN_TARGET_NOT_FOUND');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PATCH /api/v1/nav-groups/:id edits label and active', async () => {
  const dir = createTempDir();
  setupData(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/nav-groups',
      headers: ch,
      payload: { id: 'g-edit', display_name: { default: 'Viejo' }, base_revision: 5 },
    });
    expect(created.statusCode).toBe(201);

    const patched = await app.inject({
      method: 'PATCH',
      url: '/api/v1/nav-groups/g-edit',
      headers: ch,
      payload: { display_name: { default: 'Nuevo' }, active: false, base_revision: 6 },
    });
    expect(patched.statusCode).toBe(200);
    const body = patched.json<{ display_name: { default: string }; active: boolean }>();
    expect(body.display_name.default).toBe('Nuevo');
    expect(body.active).toBe(false);

    const unknown = await app.inject({
      method: 'PATCH',
      url: '/api/v1/nav-groups/g-edit',
      headers: ch,
      payload: { evil: true },
    });
    expect(unknown.statusCode).toBe(400);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── plan 096 deferred: automatic OG lifecycle ────────────────────────────────

test('category create triggers the OG intent lifecycle without blocking the write', async () => {
  const dir = createTempDir();
  setupData(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: ch,
      payload: {
        id: 'og-cat',
        key: 'og-cat',
        slug: 'og-cat',
        display_name: { default: 'OG Cat' },
        base_revision: 5,
      },
    });
    expect(created.statusCode).toBe(201);

    // The OG lifecycle runs fire-and-forget: an intent appears for the slug.
    await new Promise((r) => setTimeout(r, 1500));
    const intentsDir = resolve(dir, 'data', 'media-intents');
    const files = readdirSync(intentsDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    const intent = JSON.parse(readFileSync(resolve(intentsDir, files[0]), 'utf8'));
    expect(intent.type).toBe('og');
    expect(intent.category_slug).toBe('og-cat');
    // In CI/tests the canonical tool (python3 + tools.category_og) may be
    // unavailable — the intent records the failure visibly instead of
    // blocking the category operation.
    expect(['applied', 'failed']).toContain(intent.status);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST category schedules an OG intent (plan 096/106)', async () => {
  const dir = createTempDir();
  try {
    setupData(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: credHeaders(app),
      payload: {
        id: 'cat-og',
        key: 'ogcat',
        slug: 'ogcat',
        display_name: { default: 'OG Cat' },
        base_revision: 5,
      },
    });
    expect(res.statusCode).toBe(201);

    // The OG intent is durable in data/media-intents/ (the job itself may
    // fail in the test env — creation + shape is the contract here; the
    // state machine is covered by the contract suite).
    const intentsDir = resolve(dir, 'data', 'media-intents');
    let files: string[] = [];
    for (let i = 0; i < 20 && files.length === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 100));
      files = readdirSync(intentsDir);
    }
    expect(files.length).toBeGreaterThan(0);
    const intent = JSON.parse(readFileSync(resolve(intentsDir, files[0]), 'utf8')) as {
      type: string;
      category_slug: string;
    };
    expect(intent.type).toBe('og');
    expect(intent.category_slug).toBe('ogcat');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
