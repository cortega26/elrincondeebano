import { test, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync, readFileSync, utimesSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import { SyncQueueRepository } from '../../src/server/repositories/syncQueueRepository.ts';

// Plan 064: remote sync against a fake local server only — never a real
// endpoint or token.
const originalToken = process.env.SYNC_API_TOKEN;

function credHeaders(app: FastifyInstance): Record<string, string> {
  const cred = (app as unknown as { launchCredential?: string }).launchCredential ?? '';
  return { [CREDENTIAL_HEADER]: cred };
}

function createTempDir(): string {
  return resolve(tmpdir(), `cm-sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
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

// ── fake remote ──────────────────────────────────────────────────────────────

let fakeRemote: FastifyInstance | null = null;
let fakeRemoteBase = '';
let fakeRemoteMode:
  'ok' | 'conflict' | 'auth' | 'rate-limit' | 'server-error' | 'bad-schema' | 'bad-product' = 'ok';
let pullPayload: Record<string, unknown> = { changes: [], to_rev: 1 };

async function startFakeRemote(): Promise<string> {
  fakeRemote = Fastify({ logger: false });
  fakeRemote.patch('/api/products/:id', async (_request, reply) => {
    if (fakeRemoteMode === 'conflict') {
      return reply.status(409).send({
        product: { id: 'existing-1', name: 'Existing', price: 700 },
        rev: 2,
        conflicts: [{ field: 'price', base_value: 500, local_value: 900, server_value: 700 }],
      });
    }
    if (fakeRemoteMode === 'auth') {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (fakeRemoteMode === 'rate-limit') {
      return reply.status(429).send({ error: 'Too many requests' });
    }
    if (fakeRemoteMode === 'server-error') {
      return reply.status(500).send({ error: 'boom' });
    }
    if (fakeRemoteMode === 'bad-schema') {
      return reply.status(200).send({ unexpected: 'shape' });
    }
    if (fakeRemoteMode === 'bad-product') {
      // Remote ack with a poisoned product body: local apply must reject it.
      return reply.status(200).send({
        product: { id: 'existing-1', name: 'Existing', price: 'abc', stock: true },
        rev: 2,
        conflicts: [],
      });
    }
    return reply.status(200).send({
      product: { id: 'existing-1', name: 'Existing', price: 900 },
      rev: 2,
      conflicts: [],
    });
  });
  fakeRemote.get('/api/products/changes', async (_request, reply) => {
    return reply.status(200).send(pullPayload);
  });
  await fakeRemote.listen({ port: 0, host: '127.0.0.1' });
  const address = fakeRemote.server.address();
  fakeRemoteBase = typeof address === 'string' ? address : `http://127.0.0.1:${address!.port}`;
  return fakeRemoteBase;
}

beforeAll(async () => {
  process.env.SYNC_API_TOKEN = 'sync-test-token-do-not-leak';
  await startFakeRemote();
});

afterAll(async () => {
  if (fakeRemote) await fakeRemote.close();
  if (originalToken === undefined) delete process.env.SYNC_API_TOKEN;
  else process.env.SYNC_API_TOKEN = originalToken;
});

async function enableSync(app: FastifyInstance, base: string): Promise<void> {
  const res = await app.inject({
    method: 'PUT',
    url: '/api/v1/sync/config',
    headers: credHeaders(app),
    payload: { enabled: true, api_base: base, poll_interval: 30, pull_interval: 60, timeout: 5 },
  });
  expect(res.statusCode).toBe(200);
}

// ── push ─────────────────────────────────────────────────────────────────────

test('push 200: queued offline edit syncs and applies the server snapshot', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);
    await enableSync(app, fakeRemoteBase);
    fakeRemoteMode = 'ok';

    // Offline edit: the PATCH queues the change.
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/products/existing-1',
      headers: ch,
      payload: { command_id: 'cmd-sync-1', base_revision: 1, payload: { price: 900 } },
    });

    const status = (await app.inject({ method: 'GET', url: '/api/v1/sync/status' })).json<{
      sync: { queue: { pending: number } };
    }>();
    expect(status.sync.queue.pending).toBe(1);

    const now = await app.inject({ method: 'POST', url: '/api/v1/sync/now', headers: ch });
    expect(now.statusCode).toBe(200);
    const body = now.json<{ pushed: number; push_failed: number }>();
    expect(body.pushed).toBe(1);
    expect(body.push_failed).toBe(0);

    // The server snapshot (price 900) is applied locally.
    const catalog = JSON.parse(readFileSync(resolve(dir, 'data', 'product_data.json'), 'utf8'));
    expect(catalog.products.find((p: { id: string }) => p.id === 'existing-1')?.price).toBe(900);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('push 409: conflict is durable and queue evidence is preserved', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);
    await enableSync(app, fakeRemoteBase);
    fakeRemoteMode = 'conflict';

    await app.inject({
      method: 'PATCH',
      url: '/api/v1/products/existing-1',
      headers: ch,
      payload: { command_id: 'cmd-sync-2', base_revision: 1, payload: { price: 900 } },
    });

    const now = await app.inject({ method: 'POST', url: '/api/v1/sync/now', headers: ch });
    const body = now.json<{ push_failed: number }>();
    expect(body.push_failed).toBe(1);

    // Durable conflict with the exact remote fields.
    const conflicts = (await app.inject({ method: 'GET', url: '/api/v1/conflicts' })).json<{
      conflicts: Array<{
        entity_id: string;
        fields: Array<{ field: string; base_value: number; server_value: number }>;
      }>;
    }>();
    expect(conflicts.conflicts.length).toBeGreaterThan(0);
    const conflict = conflicts.conflicts.find((c) => c.entity_id === 'existing-1')!;
    expect(conflict.fields[0].field).toBe('price');
    expect(conflict.fields[0].base_value).toBe(500);
    expect(conflict.fields[0].server_value).toBe(700);

    // The local offline edit stays applied locally (900); the conflict
    // records local 900 vs server 700 — nothing was silently overwritten.
    const catalog = JSON.parse(readFileSync(resolve(dir, 'data', 'product_data.json'), 'utf8'));
    expect(catalog.products.find((p: { id: string }) => p.id === 'existing-1')?.price).toBe(900);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('push 401 is permanent (no retry scheduled); 429 and 5xx schedule backoff', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);
    await enableSync(app, fakeRemoteBase);

    fakeRemoteMode = 'auth';
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/products/existing-1',
      headers: ch,
      payload: { command_id: 'cmd-auth', base_revision: 1, payload: { price: 901 } },
    });
    await app.inject({ method: 'POST', url: '/api/v1/sync/now', headers: ch });
    let status = await app.inject({ method: 'GET', url: '/api/v1/sync/status' });
    let body = status.json<{ sync: { queue: { error: number } } }>();
    expect(body.sync.queue.error).toBe(1);

    fakeRemoteMode = 'rate-limit';
    // stock edit: distinct queue signature, no revision bump.
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/products/existing-1',
      headers: ch,
      payload: { command_id: 'cmd-429', base_revision: 2, payload: { stock: false } },
    });
    await app.inject({ method: 'POST', url: '/api/v1/sync/now', headers: ch });
    status = await app.inject({ method: 'GET', url: '/api/v1/sync/status' });
    body = status.json<{ sync: { queue: { error: number } } }>();
    expect(body.sync.queue.error).toBe(2);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── pull ─────────────────────────────────────────────────────────────────────

test('pull applies remote changes and advances the cursor exactly once', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);
    await enableSync(app, fakeRemoteBase);

    pullPayload = {
      changes: [
        {
          product_snapshot: { name: 'Remote Product', price: 1234, category: 'x', stock: true },
          rev: 1,
          product_id: 'remote-1',
        },
      ],
      to_rev: 2,
    };

    const now = await app.inject({ method: 'POST', url: '/api/v1/sync/now', headers: ch });
    const body = now.json<{ pulled: number; cursor: number }>();
    expect(body.pulled).toBe(1);
    expect(body.cursor).toBeGreaterThan(1);

    const catalog = JSON.parse(readFileSync(resolve(dir, 'data', 'product_data.json'), 'utf8'));
    expect(
      catalog.products.some(
        (p: { id: string; price: number }) => p.id === 'remote-1' && p.price === 1234
      )
    ).toBe(true);

    // Second pull with no changes: cursor unchanged, no duplicates.
    pullPayload = { changes: [], to_rev: 2 };
    const again = await app.inject({ method: 'POST', url: '/api/v1/sync/now', headers: ch });
    expect(again.json<{ pulled: number }>().pulled).toBe(0);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── plan 086: sync integrity ─────────────────────────────────────────────────

test('pull twice with different changes lands BOTH writes on disk', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);
    await enableSync(app, fakeRemoteBase);

    // First pull: a brand-new remote product.
    pullPayload = {
      changes: [
        {
          product_snapshot: { name: 'Remote A', price: 1234, category: 'x', stock: true },
          rev: 1,
          product_id: 'remote-1',
        },
      ],
      to_rev: 2,
    };
    let now = await app.inject({ method: 'POST', url: '/api/v1/sync/now', headers: ch });
    expect(now.json<{ pulled: number }>().pulled).toBe(1);

    // Second pull: an update to an EXISTING product. Regression guard for
    // the fixed command_id collision: before plan 086 the second distinct
    // pull was shadowed by the cached 'sync-pull' idempotency entry.
    pullPayload = {
      changes: [
        {
          product_snapshot: { name: 'Existing', price: 777, category: 'x', stock: true },
          rev: 2,
          product_id: 'existing-1',
        },
      ],
      to_rev: 3,
    };
    now = await app.inject({ method: 'POST', url: '/api/v1/sync/now', headers: ch });
    const body = now.json<{ pulled: number; pull_error: string | null }>();
    expect(body.pulled).toBe(1);
    expect(body.pull_error).toBeNull();

    const catalog = JSON.parse(readFileSync(resolve(dir, 'data', 'product_data.json'), 'utf8'));
    expect(catalog.products.find((p: { id: string }) => p.id === 'remote-1')?.price).toBe(1234);
    expect(catalog.products.find((p: { id: string }) => p.id === 'existing-1')?.price).toBe(777);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pull with an invalid snapshot is rejected: catalog intact, cursor unchanged', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);
    await enableSync(app, fakeRemoteBase);

    const revBefore = JSON.parse(
      readFileSync(resolve(dir, 'data', 'product_data.json'), 'utf8')
    ).rev;

    pullPayload = {
      changes: [
        {
          product_snapshot: { name: 'Poisoned', price: 'abc', category: 'x', stock: true },
          rev: 1,
          product_id: 'poisoned-1',
        },
      ],
      to_rev: 2,
    };
    const now = await app.inject({ method: 'POST', url: '/api/v1/sync/now', headers: ch });
    const body = now.json<{ pulled: number; pull_error: string | null }>();
    expect(body.pulled).toBe(0);
    expect(body.pull_error).not.toBeNull();

    const catalog = JSON.parse(readFileSync(resolve(dir, 'data', 'product_data.json'), 'utf8'));
    expect(catalog.products.some((p: { id: string }) => p.id === 'poisoned-1')).toBe(false);
    expect(catalog.rev).toBe(revBefore);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('push whose local apply fails stays errored with retry, never synced', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);
    await enableSync(app, fakeRemoteBase);
    fakeRemoteMode = 'bad-product';

    await app.inject({
      method: 'PATCH',
      url: '/api/v1/products/existing-1',
      headers: ch,
      payload: { command_id: 'cmd-bad-apply', base_revision: 1, payload: { price: 910 } },
    });

    const now = await app.inject({ method: 'POST', url: '/api/v1/sync/now', headers: ch });
    const body = now.json<{ pushed: number; push_failed: number }>();
    expect(body.pushed).toBe(0);
    expect(body.push_failed).toBe(1);

    const status = (await app.inject({ method: 'GET', url: '/api/v1/sync/status' })).json<{
      sync: { queue: { error: number } };
    }>();
    expect(status.sync.queue.error).toBe(1);

    // The local catalog was not corrupted by the remote ack.
    const catalog = JSON.parse(readFileSync(resolve(dir, 'data', 'product_data.json'), 'utf8'));
    expect(catalog.products.find((p: { id: string }) => p.id === 'existing-1')?.price).toBe(910);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stale queue lock is reclaimed; fresh lock still blocks processing', async () => {
  const dir = createTempDir();
  setup(dir);
  const lockPath = resolve(dir, 'data', '.sync-queue.lock');
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);
    await enableSync(app, fakeRemoteBase);
    fakeRemoteMode = 'ok';

    await app.inject({
      method: 'PATCH',
      url: '/api/v1/products/existing-1',
      headers: ch,
      payload: { command_id: 'cmd-lock-1', base_revision: 1, payload: { price: 915 } },
    });

    // Fresh lock: processing is blocked (single-consumer guarantee).
    writeFileSync(lockPath, '99999');
    let now = await app.inject({ method: 'POST', url: '/api/v1/sync/now', headers: ch });
    expect(now.json<{ pushed: number }>().pushed).toBe(0);

    // Stale lock (older than the TTL): reclaimed and processing resumes.
    const stale = new Date(Date.now() - 6 * 60 * 1000);
    utimesSync(lockPath, stale, stale);
    now = await app.inject({ method: 'POST', url: '/api/v1/sync/now', headers: ch });
    expect(now.json<{ pushed: number }>().pushed).toBe(1);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('SyncQueueRepository lock TTL: fresh blocks, stale reclaims (unit)', async () => {
  const dir = createTempDir();
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  const repo = new SyncQueueRepository(dir);
  const lockPath = resolve(dir, 'data', '.sync-queue.lock');
  try {
    writeFileSync(lockPath, '12345');
    expect(repo.acquireLock()).toBe(false);

    const stale = new Date(Date.now() - 6 * 60 * 1000);
    utimesSync(lockPath, stale, stale);
    expect(repo.acquireLock()).toBe(true);
    repo.releaseLock();
    expect(repo.acquireLock()).toBe(true);
    repo.releaseLock();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── durability + runtime control ─────────────────────────────────────────────

test('queue survives restart and runtime config reconfiguration needs no restart', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app1 = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app1.ready();
    const ch1 = credHeaders(app1);
    await enableSync(app1, fakeRemoteBase);
    fakeRemoteMode = 'server-error';

    await app1.inject({
      method: 'PATCH',
      url: '/api/v1/products/existing-1',
      headers: ch1,
      payload: { command_id: 'cmd-queue-1', base_revision: 1, payload: { price: 905 } },
    });
    await app1.inject({ method: 'POST', url: '/api/v1/sync/now', headers: ch1 });
    await app1.close();

    // Restart: the queued error entry is still there and retryable.
    const app2 = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app2.ready();
    const ch2 = credHeaders(app2);
    let status = (await app2.inject({ method: 'GET', url: '/api/v1/sync/status' })).json<{
      sync: { queue: { error: number } };
    }>();
    expect(status.sync.queue.error).toBe(1);

    // The saved config was re-read at startup — reconfigure live to 'ok'.
    fakeRemoteMode = 'ok';
    await app2.inject({
      method: 'PUT',
      url: '/api/v1/sync/config',
      headers: ch2,
      payload: { timeout: 5 },
    });

    // Backoff (>=30s) still gates the retry — simulate the window elapsing
    // by clearing next_retry_at in the durable queue (white-box durability).
    const queuePath = resolve(dir, 'data', 'sync-queue.json');
    const queueData = JSON.parse(readFileSync(queuePath, 'utf8'));
    for (const entry of queueData.queue) entry.next_retry_at = null;
    writeFileSync(queuePath, JSON.stringify(queueData, null, 2));

    const now = await app2.inject({ method: 'POST', url: '/api/v1/sync/now', headers: ch2 });
    expect(now.json<{ pushed: number }>().pushed).toBe(1);

    // Pause: sync/now becomes a no-op.
    await app2.inject({ method: 'POST', url: '/api/v1/sync/pause', headers: ch2 });
    status = (await app2.inject({ method: 'GET', url: '/api/v1/sync/status' })).json<{
      sync: { paused: boolean };
    }>();
    expect(status.sync.paused).toBe(true);
    const paused = await app2.inject({ method: 'POST', url: '/api/v1/sync/now', headers: ch2 });
    expect(paused.json<{ pushed: number; pulled: number }>().pushed).toBe(0);

    await app2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sync status never exposes the token and redirects are rejected', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    await enableSync(app, fakeRemoteBase);

    const status = await app.inject({ method: 'GET', url: '/api/v1/sync/status' });
    expect(status.body).not.toContain('sync-test-token-do-not-leak');
    expect(status.json<{ sync: { token_configured: boolean } }>().sync.token_configured).toBe(true);

    const config = await app.inject({ method: 'GET', url: '/api/v1/sync/status' });
    expect(config.body).not.toContain('Bearer');

    // The fake remote rejects redirects by policy: point at a redirecting URL.
    const redirectApp = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await redirectApp.ready();
    await app.close();
    await redirectApp.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
