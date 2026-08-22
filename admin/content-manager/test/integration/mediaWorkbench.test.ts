import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
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
  return resolve(tmpdir(), `cm-media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

function setup(dir: string): void {
  const dataDir = resolve(dir, 'data');
  const astroDataDir = resolve(dir, 'astro-poc', 'src', 'data');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(astroDataDir, { recursive: true });
  mkdirSync(resolve(dir, 'assets', 'images'), { recursive: true });

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

// 1x1 white PNG
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

async function uploadStaged(
  app: FastifyInstance,
  data: string,
  contentType: string
): Promise<{ staged_file: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/media/upload',
    headers: credHeaders(app),
    payload: {
      data,
      targetPath: 'assets/images/product.png',
      content_type: contentType,
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json<{ staged_file: string }>();
}

async function waitForIntent(
  app: FastifyInstance,
  id: string,
  terminal: string[] = ['succeeded', 'failed', 'cancelled']
): Promise<Record<string, unknown>> {
  for (let i = 0; i < 50; i++) {
    const res = await app.inject({ method: 'GET', url: '/api/v1/media' });
    const body = res.json<{ intents: Array<Record<string, unknown>> }>();
    const intent = body.intents.find((x) => x.id === id);
    if (intent && terminal.includes(String(intent.status))) return intent;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('intent did not finish');
}

// ── upload inspection (step 2) ───────────────────────────────────────────────

test('upload rejects spoofed MIME and garbage bytes without staging', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    // PNG bytes declared as jpeg.
    const spoofed = await app.inject({
      method: 'POST',
      url: '/api/v1/media/upload',
      headers: credHeaders(app),
      payload: {
        data: PNG_B64,
        targetPath: 'assets/images/product.jpg',
        content_type: 'image/jpeg',
      },
    });
    expect(spoofed.statusCode).toBe(415);
    expect(spoofed.json<{ error: { code: string } }>().error.code).toBe('CONTENT_MISMATCH');

    // Garbage bytes declared as png.
    const garbage = await app.inject({
      method: 'POST',
      url: '/api/v1/media/upload',
      headers: credHeaders(app),
      payload: {
        data: Buffer.from('not-an-image-at-all').toString('base64'),
        targetPath: 'assets/images/bad.png',
        content_type: 'image/png',
      },
    });
    expect(garbage.statusCode).toBe(415);

    // Nothing staged, nothing canonical.
    expect(existsSync(resolve(dir, 'data', '.media-staging'))).toBe(true);
    const { readdirSync } = await import('node:fs');
    expect(readdirSync(resolve(dir, 'data', '.media-staging'))).toHaveLength(0);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── intent lifecycle + avif job + apply (steps 1, 3, 4) ─────────────────────

test('upload -> intent -> avif run -> apply promotes asset and product ref atomically', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const { staged_file } = await uploadStaged(app, PNG_B64, 'image/png');

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents',
      headers: ch,
      payload: {
        type: 'avif',
        staged_file,
        target_path: 'assets/images/product.png',
        product_id: 'existing-1',
      },
    });
    expect(created.statusCode).toBe(201);
    const intentId = created.json<{ id: string }>().id;

    const run = await app.inject({
      method: 'POST',
      url: `/api/v1/media/intents/${intentId}/run`,
      headers: ch,
    });
    expect(run.statusCode).toBe(200);

    const finished = await waitForIntent(app, intentId);
    expect(finished.status).toBe('succeeded');
    expect((finished.outputs as string[]).length).toBeGreaterThan(0);

    // Nothing canonical before apply.
    expect(existsSync(resolve(dir, 'assets', 'images', 'product.avif'))).toBe(false);

    const apply = await app.inject({
      method: 'POST',
      url: `/api/v1/media/intents/${intentId}/apply`,
      headers: ch,
    });
    expect(apply.statusCode).toBe(200);

    const canonical = resolve(dir, 'assets', 'images', 'product.avif');
    expect(existsSync(canonical)).toBe(true);
    const bytes = readFileSync(canonical);
    expect(bytes.toString('ascii', 4, 8)).toBe('ftyp');

    const catalog = JSON.parse(readFileSync(resolve(dir, 'data', 'product_data.json'), 'utf8'));
    const product = catalog.products.find((p: { id: string }) => p.id === 'existing-1');
    expect(product.image_avif_path).toBe('assets/images/product.avif');
    expect(catalog.rev).toBe(2);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('intents survive restart and apply requires a succeeded status', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app1 = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app1.ready();
    const ch1 = credHeaders(app1);

    const { staged_file } = await uploadStaged(app1, PNG_B64, 'image/png');
    const created = await app1.inject({
      method: 'POST',
      url: '/api/v1/media/intents',
      headers: ch1,
      payload: {
        type: 'variant',
        staged_file,
        target_path: 'assets/images/product.png',
        product_id: 'existing-1',
      },
    });
    const intentId = created.json<{ id: string }>().id;

    // Apply before run must be refused.
    const early = await app1.inject({
      method: 'POST',
      url: `/api/v1/media/intents/${intentId}/apply`,
      headers: ch1,
    });
    expect(early.statusCode).toBe(409);
    await app1.close();

    // Restart: the intent is durable and still runnable.
    const app2 = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app2.ready();
    const run = await app2.inject({
      method: 'POST',
      url: `/api/v1/media/intents/${intentId}/run`,
      headers: credHeaders(app2),
    });
    expect(run.statusCode).toBe(200);
    const finished = await waitForIntent(app2, intentId);
    expect(finished.status).toBe('succeeded');

    const apply = await app2.inject({
      method: 'POST',
      url: `/api/v1/media/intents/${intentId}/apply`,
      headers: credHeaders(app2),
    });
    expect(apply.statusCode).toBe(200);
    expect(existsSync(resolve(dir, 'assets', 'images', 'product-480.png'))).toBe(true);

    await app2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('discard removes staging only and never canonical assets', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const { staged_file } = await uploadStaged(app, PNG_B64, 'image/png');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents',
      headers: ch,
      payload: {
        type: 'variant',
        staged_file,
        target_path: 'assets/images/product.png',
        product_id: 'existing-1',
      },
    });
    const intentId = created.json<{ id: string }>().id;

    const discard = await app.inject({
      method: 'DELETE',
      url: `/api/v1/media/intents/${intentId}`,
      headers: ch,
    });
    expect(discard.statusCode).toBe(200);
    expect(discard.json<{ status: string }>().status).toBe('discarded');

    expect(existsSync(resolve(dir, 'data', '.media-staging', staged_file))).toBe(false);
    expect(existsSync(resolve(dir, 'assets', 'images', 'product.png'))).toBe(false);

    const gone = await app.inject({
      method: 'POST',
      url: `/api/v1/media/intents/${intentId}/run`,
      headers: ch,
    });
    expect(gone.statusCode).toBe(404);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cancel marks a pending/running intent as cancelled', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const { staged_file } = await uploadStaged(app, PNG_B64, 'image/png');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents',
      headers: ch,
      payload: {
        type: 'variant',
        staged_file,
        target_path: 'assets/images/product.png',
        product_id: 'existing-1',
      },
    });
    const intentId = created.json<{ id: string }>().id;

    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/v1/media/intents/${intentId}/cancel`,
      headers: ch,
    });
    expect(cancelled.statusCode).toBe(200);

    const inventory = (await app.inject({ method: 'GET', url: '/api/v1/media' })).json<{
      intents: Array<{ id: string; status: string }>;
    }>();
    expect(inventory.intents.find((i) => i.id === intentId)?.status).toBe('cancelled');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── plan 089: category OG intents ────────────────────────────────────────────

const OG_CANONICAL_REL = 'assets/images/og/categories/bebidas.png';

function writeIntentState(dir: string, intentId: string, patch: Record<string, unknown>): void {
  const intentPath = resolve(dir, 'data', 'media-intents', `${intentId}.json`);
  const current = JSON.parse(readFileSync(intentPath, 'utf8'));
  writeFileSync(intentPath, JSON.stringify({ ...current, ...patch }, null, 2));
}

test('og intent creation carries the canonical category target (plan 089)', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents',
      headers: ch,
      payload: { type: 'og', target_path: OG_CANONICAL_REL, category_slug: 'bebidas' },
    });
    expect(created.statusCode).toBe(201);
    const intent = created.json<{ id: string; type: string; target_path: string }>();
    expect(intent.type).toBe('og');
    expect(intent.target_path).toBe(OG_CANONICAL_REL);

    // og-delete requires the same shape.
    const deleted = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents',
      headers: ch,
      payload: { type: 'og-delete', target_path: OG_CANONICAL_REL, category_slug: 'bebidas' },
    });
    expect(deleted.statusCode).toBe(201);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('og intent apply verifies the canonical image and transitions to applied', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    mkdirSync(resolve(dir, 'assets', 'images', 'og', 'categories'), { recursive: true });
    writeFileSync(resolve(dir, OG_CANONICAL_REL), 'FAKE-OG-PNG');

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents',
      headers: ch,
      payload: { type: 'og', target_path: OG_CANONICAL_REL, category_slug: 'bebidas' },
    });
    const intentId = created.json<{ id: string }>().id;

    // White-box: the real run spawns tools.category_og (python3); the apply
    // contract is what plan 089 fixes, so set the intent to the post-run
    // state directly.
    writeIntentState(dir, intentId, {
      status: 'succeeded',
      outputs: [resolve(dir, OG_CANONICAL_REL)],
    });

    const apply = await app.inject({
      method: 'POST',
      url: `/api/v1/media/intents/${intentId}/apply`,
      headers: ch,
    });
    expect(apply.statusCode).toBe(200);
    expect(apply.json<{ status: string; canonical: string }>().status).toBe('applied');

    // The canonical file was not renamed/promoted — it stays byte-identical.
    expect(readFileSync(resolve(dir, OG_CANONICAL_REL), 'utf8')).toBe('FAKE-OG-PNG');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('og apply fails closed when the canonical image is missing (422 MISSING_OUTPUT)', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents',
      headers: ch,
      payload: { type: 'og', target_path: OG_CANONICAL_REL, category_slug: 'bebidas' },
    });
    const intentId = created.json<{ id: string }>().id;
    writeIntentState(dir, intentId, { status: 'succeeded', outputs: [] });

    const apply = await app.inject({
      method: 'POST',
      url: `/api/v1/media/intents/${intentId}/apply`,
      headers: ch,
    });
    expect(apply.statusCode).toBe(422);
    expect(apply.json().error.code).toBe('MISSING_OUTPUT');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('og-delete apply verifies the canonical image is gone; rejects when present', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    // Case 1: canonical absent → apply succeeds (the delete already ran).
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents',
      headers: ch,
      payload: { type: 'og-delete', target_path: OG_CANONICAL_REL, category_slug: 'bebidas' },
    });
    const intentId = created.json<{ id: string }>().id;
    writeIntentState(dir, intentId, { status: 'succeeded', outputs: [] });
    let apply = await app.inject({
      method: 'POST',
      url: `/api/v1/media/intents/${intentId}/apply`,
      headers: ch,
    });
    expect(apply.statusCode).toBe(200);
    expect(apply.json<{ status: string }>().status).toBe('applied');

    // Case 2: canonical still present → fail closed.
    mkdirSync(resolve(dir, 'assets', 'images', 'og', 'categories'), { recursive: true });
    writeFileSync(resolve(dir, OG_CANONICAL_REL), 'FAKE-OG-PNG');
    const created2 = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents',
      headers: ch,
      payload: { type: 'og-delete', target_path: OG_CANONICAL_REL, category_slug: 'bebidas' },
    });
    const intentId2 = created2.json<{ id: string }>().id;
    writeIntentState(dir, intentId2, { status: 'succeeded', outputs: [] });
    apply = await app.inject({
      method: 'POST',
      url: `/api/v1/media/intents/${intentId2}/apply`,
      headers: ch,
    });
    expect(apply.statusCode).toBe(422);
    expect(apply.json().error.code).toBe('OUTPUT_STILL_PRESENT');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('batch intent ops: cancel pending + discard, skip finished (plan 127 F2.4)', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const create = async (id: string, type = 'og') => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/media/intents',
        headers: ch,
        payload: {
          type,
          target_path: `assets/images/og/categories/${id}.png`,
          category_slug: id,
        },
      });
      expect(res.statusCode).toBe(201);
      return res.json<{ id: string }>().id;
    };
    const a = await create('batch-a');
    const b = await create('batch-b');
    const c = await create('batch-c');

    // Cancel all three (pending -> cancelled).
    const cancel = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents/batch',
      headers: ch,
      payload: { action: 'cancel', ids: [a, b, c] },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json<{ applied: number; skipped: unknown[] }>()).toMatchObject({
      applied: 3,
      skipped: [],
    });

    // Cancel again: now they are cancelled — the single-route contract
    // allows cancelling cancelled intents (only succeeded/failed skip).
    const cancelAgain = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents/batch',
      headers: ch,
      payload: { action: 'cancel', ids: [a, b, c] },
    });
    expect(cancelAgain.statusCode).toBe(200);
    expect(cancelAgain.json<{ applied: number }>().applied).toBe(3);

    // Discard all: rows gone.
    const discard = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents/batch',
      headers: ch,
      payload: { action: 'discard', ids: [a, b, c] },
    });
    expect(discard.statusCode).toBe(200);
    expect(discard.json<{ applied: number }>().applied).toBe(3);

    const after = (await app.inject({ method: 'GET', url: '/api/v1/media' })).json<{
      intents: Array<{ id: string }>;
    }>();
    expect(after.intents.some((i) => i.id === a || i.id === b || i.id === c)).toBe(false);

    // Unknown ids -> 404 before anything is applied.
    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents/batch',
      headers: ch,
      payload: { action: 'run', ids: ['does-not-exist'] },
    });
    expect(missing.statusCode).toBe(404);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('batch discard cleans outputs and staged file after successful avif (plan 138)', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const { staged_file } = await uploadStaged(app, PNG_B64, 'image/png');
    const stagingRoot = resolve(dir, 'data', '.media-staging');
    expect(existsSync(resolve(stagingRoot, staged_file))).toBe(true);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents',
      headers: ch,
      payload: {
        type: 'avif',
        staged_file,
        target_path: 'assets/images/product.png',
        product_id: 'existing-1',
      },
    });
    expect(created.statusCode).toBe(201);
    const intentId = created.json<{ id: string }>().id;

    const run = await app.inject({
      method: 'POST',
      url: `/api/v1/media/intents/${intentId}/run`,
      headers: ch,
    });
    expect(run.statusCode).toBe(200);
    const finished = (await waitForIntent(app, intentId)) as {
      status: string;
      outputs: string[];
      staged_file: string;
      source_path: string;
    };
    expect(finished.status).toBe('succeeded');
    expect(finished.outputs.length).toBeGreaterThan(0);
    for (const out of finished.outputs) {
      expect(existsSync(out)).toBe(true);
    }
    expect(existsSync(resolve(stagingRoot, staged_file))).toBe(true);

    const batchDiscard = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents/batch',
      headers: ch,
      payload: { action: 'discard', ids: [intentId] },
    });
    expect(batchDiscard.statusCode).toBe(200);
    expect(batchDiscard.json<{ applied: number }>().applied).toBe(1);

    for (const out of finished.outputs) {
      expect(existsSync(out)).toBe(false);
    }
    expect(existsSync(resolve(stagingRoot, staged_file))).toBe(false);
    if (finished.source_path) {
      expect(existsSync(finished.source_path)).toBe(false);
    }

    const after = (await app.inject({ method: 'GET', url: '/api/v1/media' })).json<{
      intents: Array<{ id: string }>;
    }>();
    expect(after.intents.some((i) => i.id === intentId)).toBe(false);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('raster intents reject .svg targets with 422 VALIDATION_ERROR (plan 138)', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const { staged_file } = await uploadStaged(app, PNG_B64, 'image/png');

    const variantSvg = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents',
      headers: ch,
      payload: {
        type: 'variant',
        staged_file,
        target_path: 'assets/images/product.svg',
        product_id: 'existing-1',
      },
    });
    expect(variantSvg.statusCode).toBe(422);
    expect(variantSvg.json<{ error: { code: string; message: string } }>().error.code).toBe(
      'VALIDATION_ERROR',
    );
    expect(variantSvg.json<{ error: { message: string } }>().error.message).toMatch(/\.svg/i);

    const avifSvg = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents',
      headers: ch,
      payload: {
        type: 'avif',
        staged_file,
        target_path: 'assets/images/photo.SVG',
        product_id: 'existing-1',
      },
    });
    expect(avifSvg.statusCode).toBe(422);
    expect(avifSvg.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');

    // Raster rejection must not affect other valid raster extensions.
    const variantOk = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents',
      headers: ch,
      payload: {
        type: 'variant',
        staged_file,
        target_path: 'assets/images/product.png',
        product_id: 'existing-1',
      },
    });
    expect(variantOk.statusCode).toBe(201);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('og intents are not affected by raster svg validation (plan 138)', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const ogSvg = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents',
      headers: ch,
      payload: { type: 'og', target_path: OG_CANONICAL_REL, category_slug: 'bebidas' },
    });
    expect(ogSvg.statusCode).toBe(201);

    const ogVariantSvg = await app.inject({
      method: 'POST',
      url: '/api/v1/media/intents',
      headers: ch,
      payload: { type: 'og', target_path: 'assets/images/og/categories/bebidas.svg', category_slug: 'bebidas' },
    });
    // OG should not be rejected for svg-like extensions (not a raster job).
    expect(ogVariantSvg.statusCode).toBe(201);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
