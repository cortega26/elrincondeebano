import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
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
  return resolve(tmpdir(), `cm-cs-flow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
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
          id: 'existing-1',
          name: 'Existing',
          description: 'Old',
          price: 500,
          discount: 0,
          stock: true,
          category: 'x',
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

function readCatalog(dir: string): {
  rev: number;
  products: Array<{ id: string; price: number; is_archived: boolean; rev: number }>;
} {
  return JSON.parse(readFileSync(resolve(dir, 'data', 'product_data.json'), 'utf8'));
}

async function createValidatedCs(
  app: FastifyInstance,
  ops: Array<Record<string, unknown>>
): Promise<{ id: string; status: string }> {
  const ch = credHeaders(app);
  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/change-sets',
    headers: ch,
    payload: { product_ops: ops },
  });
  expect(created.statusCode).toBe(201);
  const cs = created.json<{ id: string }>();
  for (const status of ['validating', 'validated']) {
    const hop = await app.inject({
      method: 'PATCH',
      url: `/api/v1/change-sets/${cs.id}`,
      headers: ch,
      payload: { status },
    });
    expect(hop.statusCode).toBe(200);
  }
  return { id: cs.id, status: 'validated' };
}

// ── state machine enforcement (step 1) ───────────────────────────────────────

test('PATCH rejects illegal transitions and unknown fields', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/change-sets',
      headers: ch,
      payload: { product_ops: [] },
    });
    const cs = created.json<{ id: string }>();

    const jump = await app.inject({
      method: 'PATCH',
      url: `/api/v1/change-sets/${cs.id}`,
      headers: ch,
      payload: { status: 'published' },
    });
    expect(jump.statusCode).toBe(409);
    expect(jump.json<{ error: { code: string } }>().error.code).toBe('ILLEGAL_TRANSITION');

    const unknown = await app.inject({
      method: 'PATCH',
      url: `/api/v1/change-sets/${cs.id}`,
      headers: ch,
      payload: { id: 'different-id' },
    });
    expect(unknown.statusCode).toBe(400);

    // Legal chain still works.
    for (const status of ['validating', 'validated']) {
      const hop = await app.inject({
        method: 'PATCH',
        url: `/api/v1/change-sets/${cs.id}`,
        headers: ch,
        payload: { status },
      });
      expect(hop.statusCode).toBe(200);
    }

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── apply engine (step 3) ────────────────────────────────────────────────────

test('apply executes create ops once, records evidence, and bumps the revision', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const { id } = await createValidatedCs(app, [
      {
        action: 'create',
        data: { name: 'Nuevo', price: 999, category: 'x', stock: true },
        idempotency_key: 'create-1',
      },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${id}/apply`,
      headers: ch,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ applied: number; resulting_revision: number }>();
    expect(body.applied).toBe(1);
    expect(body.resulting_revision).toBe(2);

    const catalog = readCatalog(dir);
    expect(catalog.rev).toBe(2);
    expect(catalog.products.some((p) => p.name === 'Nuevo' && p.price === 999)).toBe(true);

    const saved = (await app.inject({ method: 'GET', url: '/api/v1/change-sets' })).json<{
      items: Array<{
        id: string;
        status: string;
        product_ops: Array<{ after: Record<string, unknown>; resulting_revision: number }>;
      }>;
    }>();
    const applied = saved.items.find((csItem) => csItem.id === id)!;
    expect(applied.status).toBe('published');
    expect(applied.product_ops[0].after['name']).toBe('Nuevo');
    expect(applied.product_ops[0].resulting_revision).toBe(1);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('apply rejects a stale base revision and marks the change set failed', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const { id } = await createValidatedCs(app, [
      {
        action: 'edit',
        product_id: 'existing-1',
        data: { price: 777 },
        base_revision: 1,
        idempotency_key: 'stale-1',
      },
    ]);

    // Bump the product revision behind the change set's back.
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/products/existing-1',
      headers: ch,
      payload: { command_id: 'cmd-bump', base_revision: 1, payload: { price: 600 } },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${id}/apply`,
      headers: ch,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('STALE_REVISION');

    const catalog = readCatalog(dir);
    expect(catalog.products.find((p) => p.id === 'existing-1')?.price).toBe(600);

    const saved = (await app.inject({ method: 'GET', url: '/api/v1/change-sets' })).json<{
      items: Array<{ id: string; status: string }>;
    }>();
    expect(saved.items.find((csItem) => csItem.id === id)?.status).toBe('failed');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('apply requires a validated change set', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/change-sets',
      headers: ch,
      payload: { product_ops: [] },
    });
    const cs = created.json<{ id: string }>();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${cs.id}/apply`,
      headers: ch,
    });
    expect(res.statusCode).toBe(409);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── undo / redo (step 4) ─────────────────────────────────────────────────────

test('edit -> undo -> redo restores exact values without duplication', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const { id } = await createValidatedCs(app, [
      {
        action: 'edit',
        product_id: 'existing-1',
        data: { price: 900 },
        base_revision: 1,
        idempotency_key: 'edit-1',
      },
    ]);
    await app.inject({ method: 'POST', url: `/api/v1/change-sets/${id}/apply`, headers: ch });

    const undo = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${id}/undo`,
      headers: ch,
    });
    expect(undo.statusCode).toBe(200);
    const undoBody = undo.json<{ undo_change_set_id: string }>();
    const inverse = (
      await app.inject({ method: 'GET', url: `/api/v1/change-sets/${undoBody.undo_change_set_id}` })
    ).json<{ product_ops: Array<{ action: string; data: Record<string, unknown> }> }>();
    expect(inverse.product_ops[0].action).toBe('edit');
    expect(inverse.product_ops[0].data['price']).toBe(500); // exact before value

    await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${undoBody.undo_change_set_id}/apply`,
      headers: ch,
    });
    expect(readCatalog(dir).products.find((p) => p.id === 'existing-1')?.price).toBe(500);

    // Redo on the inverse reapplies the original semantics.
    const redo = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${undoBody.undo_change_set_id}/redo`,
      headers: ch,
    });
    expect(redo.statusCode).toBe(200);
    const redoBody = redo.json<{ redo_change_set_id: string }>();
    await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${redoBody.redo_change_set_id}/apply`,
      headers: ch,
    });
    expect(readCatalog(dir).products.find((p) => p.id === 'existing-1')?.price).toBe(900);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('create -> undo archives without duplicating; redo restores', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const { id } = await createValidatedCs(app, [
      {
        action: 'create',
        data: { name: 'Copiable', price: 123, category: 'x' },
        idempotency_key: 'create-undo-1',
      },
    ]);
    await app.inject({ method: 'POST', url: `/api/v1/change-sets/${id}/apply`, headers: ch });
    let catalog = readCatalog(dir);
    const createdId = catalog.products.find((p) => p.name === 'Copiable')?.id;
    expect(catalog.products.filter((p) => p.name === 'Copiable')).toHaveLength(1);

    const undo = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${id}/undo`,
      headers: ch,
    });
    const undoId = undo.json<{ undo_change_set_id: string }>().undo_change_set_id;
    const inverse = (
      await app.inject({ method: 'GET', url: `/api/v1/change-sets/${undoId}` })
    ).json<{ product_ops: Array<{ action: string; product_id?: string }> }>();
    expect(inverse.product_ops[0].action).toBe('archive');
    expect(inverse.product_ops[0].product_id).toBe(createdId);

    await app.inject({ method: 'POST', url: `/api/v1/change-sets/${undoId}/apply`, headers: ch });
    catalog = readCatalog(dir);
    expect(catalog.products.filter((p) => p.name === 'Copiable')).toHaveLength(1);
    expect(catalog.products.find((p) => p.name === 'Copiable')?.is_archived).toBe(true);

    const redo = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${undoId}/redo`,
      headers: ch,
    });
    const redoId = redo.json<{ redo_change_set_id: string }>().redo_change_set_id;
    await app.inject({ method: 'POST', url: `/api/v1/change-sets/${redoId}/apply`, headers: ch });
    catalog = readCatalog(dir);
    expect(catalog.products.filter((p) => p.name === 'Copiable')).toHaveLength(1);
    expect(catalog.products.find((p) => p.name === 'Copiable')?.is_archived).toBe(false);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('undo only applies to published change sets; stale inverses fail safely', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const { id } = await createValidatedCs(app, [
      {
        action: 'edit',
        product_id: 'existing-1',
        data: { price: 800 },
        base_revision: 1,
        idempotency_key: 'stale-inverse-1',
      },
    ]);
    await app.inject({ method: 'POST', url: `/api/v1/change-sets/${id}/apply`, headers: ch });

    const undo = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${id}/undo`,
      headers: ch,
    });
    const undoId = undo.json<{ undo_change_set_id: string }>().undo_change_set_id;

    // Mutate behind the inverse's back -> applying the inverse must fail.
    // (A price change advances the product revision via productService;
    // stock/description edits do not — plan 059 leftover semantics.)
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/products/existing-1',
      headers: ch,
      payload: { command_id: 'cmd-sneaky', base_revision: 2, payload: { price: 700 } },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${undoId}/apply`,
      headers: ch,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('STALE_REVISION');

    const undoDraft = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${id}/undo`,
      headers: ch,
    });
    expect(undoDraft.statusCode).toBe(200);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── history + restart durability ─────────────────────────────────────────────

test('history records applied change sets with before/after evidence and survives restart', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app1 = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app1.ready();
    const ch1 = credHeaders(app1);

    const { id } = await createValidatedCs(app1, [
      {
        action: 'edit',
        product_id: 'existing-1',
        data: { price: 750 },
        base_revision: 1,
        idempotency_key: 'hist-1',
      },
    ]);
    await app1.inject({ method: 'POST', url: `/api/v1/change-sets/${id}/apply`, headers: ch1 });
    await app1.close();

    const app2 = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app2.ready();

    const history = (await app2.inject({ method: 'GET', url: '/api/v1/history' })).json<{
      entries: Array<{
        field: string;
        before?: Record<string, unknown>;
        after?: Record<string, unknown>;
        change_set_id?: string;
      }>;
    }>();
    const logEntry = history.entries.find((e) => e.change_set_id === id);
    expect(logEntry).toBeDefined();
    expect(logEntry!.field).toContain('change-set:change-set-applied:edit');
    expect(logEntry!.before?.['price']).toBe(500);
    expect(logEntry!.after?.['price']).toBe(750);

    await app2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── plan 087: field allowlist ────────────────────────────────────────────────

test('POST /change-sets rejects ops with server-owned fields (422 INVALID_OP_FIELD)', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const cases: Array<Record<string, unknown>> = [
      { action: 'edit', product_id: 'existing-1', data: { price: 600, rev: 0 } },
      { action: 'edit', product_id: 'existing-1', data: { price: 600, order: 5 } },
      { action: 'edit', product_id: 'existing-1', data: { price: 600, id: 'stolen-id' } },
      {
        action: 'edit',
        product_id: 'existing-1',
        data: {
          price: 600,
          field_last_modified: {
            price: { ts: 'x', by: 'x', rev: 0, base_rev: 0, changeset_id: null },
          },
        },
      },
      { action: 'edit', product_id: 'existing-1', data: { price: 600, slug: 'crafted' } },
      { action: 'create', data: { name: 'X', price: 100, category: 'x', rev: 99 } },
    ];

    for (const op of cases) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/change-sets',
        headers: ch,
        payload: { product_ops: [op] },
      });
      expect(res.statusCode, JSON.stringify(op)).toBe(422);
      expect(res.json().error.code).toBe('INVALID_OP_FIELD');
    }

    // Nothing was persisted and the catalog is untouched.
    const catalog = readCatalog(dir);
    expect(catalog.products.find((p) => p.id === 'existing-1')?.price).toBe(500);
    expect(catalog.products.find((p) => p.id === 'existing-1')?.rev).toBe(1);

    // Create ops may still carry an explicit id.
    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/change-sets',
      headers: ch,
      payload: {
        product_ops: [
          {
            action: 'create',
            data: { id: 'explicit-1', name: 'N', price: 100, category: 'x', stock: true },
          },
        ],
      },
    });
    expect(ok.statusCode).toBe(201);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PATCH /change-sets rejects replaced product_ops with forbidden fields', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/change-sets',
      headers: ch,
      payload: {
        product_ops: [{ action: 'edit', product_id: 'existing-1', data: { price: 600 } }],
      },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ id: string }>().id;

    const bad = await app.inject({
      method: 'PATCH',
      url: `/api/v1/change-sets/${id}`,
      headers: ch,
      payload: {
        product_ops: [{ action: 'edit', product_id: 'existing-1', data: { price: 600, rev: 0 } }],
      },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('INVALID_OP_FIELD');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('apply rejects a stored change set carrying forbidden fields (applier guard)', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    // Bypass the route validation by writing the change set straight to the
    // durable store (defense-in-depth test of the applier guard).
    const csId = 'cs-drill-allowlist';
    mkdirSync(resolve(dir, 'data', 'change-sets'), { recursive: true });
    writeFileSync(
      resolve(dir, 'data', 'change-sets', `${csId}.json`),
      JSON.stringify({
        id: csId,
        status: 'validated',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        product_ops: [
          {
            action: 'edit',
            product_id: 'existing-1',
            data: { price: 600, rev: 0 },
            base_revision: 1,
          },
        ],
        category_ops: [],
        validation_evidence: null,
        publication_result: null,
      })
    );

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${csId}/apply`,
      headers: ch,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('INVALID_OP_FIELD');

    // The product was not mutated — price and rev are intact.
    const catalog = readCatalog(dir);
    expect(catalog.products.find((p) => p.id === 'existing-1')?.price).toBe(500);
    expect(catalog.products.find((p) => p.id === 'existing-1')?.rev).toBe(1);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── plan 095: purge + revert ─────────────────────────────────────────────────

test('DELETE /products/:id purges with before-evidence and refuses stale rev', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const del = await app.inject({
      method: 'DELETE',
      url: '/api/v1/products/existing-1',
      headers: ch,
      payload: { base_revision: 1 },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json<{ status: string }>().status).toBe('purged');

    const catalog = readCatalog(dir);
    expect(catalog.products.some((p) => p.id === 'existing-1')).toBe(false);

    // Purged product cannot be purged again.
    const again = await app.inject({
      method: 'DELETE',
      url: '/api/v1/products/existing-1',
      headers: ch,
      payload: { base_revision: 2 },
    });
    expect(again.statusCode).toBe(404);

    // Stale revision refuses the purge (rev-guarded through the applier).
    await app.inject({
      method: 'DELETE',
      url: '/api/v1/products/existing-1',
      headers: ch,
      payload: { base_revision: 1 },
    });
    // already purged — recreate to test stale rev
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: ch,
      payload: { command_id: 'recreate-1', payload: { name: 'Fresh', price: 1000, category: 'x' } },
    });
    const id = create.json<{ product: { id: string } }>().product.id;
    const stale = await app.inject({
      method: 'DELETE',
      url: `/api/v1/products/${id}`,
      headers: ch,
      payload: { base_revision: 999 },
    });
    expect(stale.statusCode).toBe(409);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /history/:id/revert restores before-values with rev guards', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    // One change-set edit: price 500 -> 900 (rev 1 -> 2).
    const { id } = await createValidatedCs(app, [
      { action: 'edit', product_id: 'existing-1', data: { price: 900 }, base_revision: 1 },
    ]);
    const apply = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${id}/apply`,
      headers: ch,
    });
    expect(apply.statusCode).toBe(200);
    let catalog = readCatalog(dir);
    expect(catalog.products.find((p) => p.id === 'existing-1')?.price).toBe(900);

    // Revert to rev 1 (the state before the edit).
    const revert = await app.inject({
      method: 'POST',
      url: '/api/v1/history/existing-1/revert',
      headers: ch,
      payload: { to_rev: 1 },
    });
    expect(revert.statusCode).toBe(200);
    catalog = readCatalog(dir);
    expect(catalog.products.find((p) => p.id === 'existing-1')?.price).toBe(500);

    // Revert to an unknown revision is not revertible.
    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/history/existing-1/revert',
      headers: ch,
      payload: { to_rev: 42 },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('NOT_REVERTIBLE');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
