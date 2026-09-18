// Plan 175: change-set apply crash-safety + single-flight + replay honesty.
// - A throw inside apply must land the set in `failed` (never strand it in
//   `publishing`), and the flow must be retryable to `published`.
// - Concurrent double-apply runs the engine exactly once.
// - A replayed command_id returns the recorded outcome WITHOUT re-running
//   apply (no phantom products, no rev advance).
// - A set stranded in `publishing` (pre-fix crash) recovers via the
//   operator PATCH publishing→failed transition (already legal).
import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { HistoryRepository } from '../../src/server/repositories/historyRepository.ts';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
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

// Bodyless requests must NOT carry Content-Type: application/json — Fastify
// rejects an empty JSON body with 400 before any handler runs.
function authHeaders(app: FastifyInstance): Record<string, string> {
  return { [CREDENTIAL_HEADER]: getCredential(app) };
}

function createTempDir(): string {
  return resolve(
    tmpdir(),
    `cm-apply-robustness-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function setup(dir: string): void {
  const dataDir = resolve(dir, 'data');
  const astroDataDir = resolve(dir, 'astro-poc', 'src', 'data');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(astroDataDir, { recursive: true });
  writeFileSync(
    resolve(dataDir, 'product_data.json'),
    JSON.stringify({ version: 'test', last_updated: '', rev: 0, products: [] })
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

const CREATE_OP = {
  action: 'create',
  data: { name: 'Porotos', price: 800, category: 'abarrotes' },
};

async function createValidatedSet(app: FastifyInstance, op: unknown): Promise<string> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/change-sets',
    headers: jsonHeaders(app),
    payload: { product_ops: [op] },
  });
  expect(created.statusCode).toBe(201);
  const id = created.json().id as string;

  const validating = await app.inject({
    method: 'PATCH',
    url: `/api/v1/change-sets/${id}`,
    headers: jsonHeaders(app),
    payload: { status: 'validating' },
  });
  expect(validating.statusCode).toBe(200);

  const validated = await app.inject({
    method: 'PATCH',
    url: `/api/v1/change-sets/${id}`,
    headers: jsonHeaders(app),
    payload: { status: 'validated' },
  });
  expect(validated.statusCode).toBe(200);
  return id;
}

test('throwing apply lands the set in failed, then retries to published', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    try {
      const id = await createValidatedSet(app, CREATE_OP);
      const catalogPath = resolve(dir, 'data', 'product_data.json');
      const originalBytes = readFileSync(catalogPath, 'utf-8');

      writeFileSync(catalogPath, '{corrupted-json');
      const crashed = await app.inject({
        method: 'POST',
        url: `/api/v1/change-sets/${id}/apply`,
        headers: authHeaders(app),
      });
      expect(crashed.statusCode).toBe(500);
      expect(crashed.json().error.code).toBe('APPLY_FAILED');

      const stranded = await app.inject({
        method: 'GET',
        url: `/api/v1/change-sets/${id}`,
        headers: jsonHeaders(app),
      });
      expect(stranded.json().status).toBe('failed');

      writeFileSync(catalogPath, originalBytes);
      for (const status of ['validating', 'validated']) {
        const step = await app.inject({
          method: 'PATCH',
          url: `/api/v1/change-sets/${id}`,
          headers: jsonHeaders(app),
          payload: { status },
        });
        expect(step.statusCode).toBe(200);
      }
      const retry = await app.inject({
        method: 'POST',
        url: `/api/v1/change-sets/${id}/apply`,
        headers: authHeaders(app),
      });
      expect(retry.statusCode).toBe(200);

      const done = await app.inject({
        method: 'GET',
        url: `/api/v1/change-sets/${id}`,
        headers: jsonHeaders(app),
      });
      expect(done.json().status).toBe('published');

      const catalog = await app.inject({
        method: 'GET',
        url: '/api/v1/products',
        headers: jsonHeaders(app),
      });
      expect(catalog.json().items.map((p: { name: string }) => p.name)).toContain('Porotos');
    } finally {
      await app.close();
    }
  } finally {
    cleanup(dir);
  }
});

test('concurrent double-apply runs the engine exactly once', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    try {
      const id = await createValidatedSet(app, {
        action: 'create',
        data: { name: 'Lentejas', price: 700, category: 'abarrotes' },
      });
      const p1 = app.inject({
        method: 'POST',
        url: `/api/v1/change-sets/${id}/apply`,
        headers: authHeaders(app),
      });
      const p2 = app.inject({
        method: 'POST',
        url: `/api/v1/change-sets/${id}/apply`,
        headers: authHeaders(app),
      });
      const [r1, r2] = await Promise.all([p1, p2]);
      const codes = [r1.statusCode, r2.statusCode].sort();
      expect(codes).toEqual([200, 409]);

      const applied = new HistoryRepository(dir)
        .load()
        .filter((e) => e.kind === 'change-set-applied' && e.change_set_id === id);
      expect(applied).toHaveLength(1);
    } finally {
      await app.close();
    }
  } finally {
    cleanup(dir);
  }
});

test('replayed command_id returns the recorded outcome without re-running apply', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    try {
      const first = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        headers: jsonHeaders(app),
        payload: {
          command_id: 'rpl-1',
          payload: { name: 'Garbanzos', price: 900, category: 'abarrotes' },
        },
      });
      expect(first.statusCode).toBe(201);
      const rev1 = first.json().resulting_revision as number;
      expect(first.json().product).toBeDefined();

      const replay = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        headers: jsonHeaders(app),
        payload: {
          command_id: 'rpl-1',
          payload: { name: 'Garbanzos', price: 900, category: 'abarrotes' },
        },
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.json().deduplicated).toBe(true);
      expect(replay.json().resulting_revision).toBe(rev1);
      expect(replay.json().product).toBeUndefined();

      const list = await app.inject({
        method: 'GET',
        url: '/api/v1/products',
        headers: jsonHeaders(app),
      });
      expect(list.json().total).toBe(1);

      const revision = await app.inject({
        method: 'GET',
        url: '/api/v1/products/revision',
        headers: jsonHeaders(app),
      });
      expect(revision.json().rev).toBe(rev1);

      // Same-id conflict replay stays a conflict without poisoning the retry path.
      const conflicted = await app.inject({
        method: 'PATCH',
        url: `/api/v1/products/${first.json().product.id}`,
        headers: jsonHeaders(app),
        payload: { command_id: 'rpl-c', base_revision: 99, payload: { price: 950 } },
      });
      expect(conflicted.statusCode).toBe(409);
      const conflictReplay = await app.inject({
        method: 'PATCH',
        url: `/api/v1/products/${first.json().product.id}`,
        headers: jsonHeaders(app),
        payload: { command_id: 'rpl-c', base_revision: 99, payload: { price: 950 } },
      });
      expect(conflictReplay.statusCode).toBe(409);

      const current = await app.inject({
        method: 'GET',
        url: `/api/v1/products/${first.json().product.id}`,
        headers: jsonHeaders(app),
      });
      expect(current.json().price).toBe(900);
    } finally {
      await app.close();
    }
  } finally {
    cleanup(dir);
  }
});

test('a set stranded in publishing recovers via PATCH to failed, then resumes', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    try {
      const id = await createValidatedSet(app, {
        action: 'create',
        data: { name: 'Arvejas', price: 600, category: 'abarrotes' },
      });
      // Simulate a pre-fix crash: validated→publishing persisted, apply never ran.
      const storedPath = resolve(dir, 'data', 'change-sets', `${id}.json`);
      const stored = JSON.parse(readFileSync(storedPath, 'utf-8'));
      stored.status = 'publishing';
      writeFileSync(storedPath, JSON.stringify(stored, null, 2));

      const recover = await app.inject({
        method: 'PATCH',
        url: `/api/v1/change-sets/${id}`,
        headers: jsonHeaders(app),
        payload: { status: 'failed' },
      });
      expect(recover.statusCode).toBe(200);

      for (const status of ['validating', 'validated']) {
        const step = await app.inject({
          method: 'PATCH',
          url: `/api/v1/change-sets/${id}`,
          headers: jsonHeaders(app),
          payload: { status },
        });
        expect(step.statusCode).toBe(200);
      }
      const apply = await app.inject({
        method: 'POST',
        url: `/api/v1/change-sets/${id}/apply`,
        headers: authHeaders(app),
      });
      expect(apply.statusCode).toBe(200);

      const done = await app.inject({
        method: 'GET',
        url: `/api/v1/change-sets/${id}`,
        headers: jsonHeaders(app),
      });
      expect(done.json().status).toBe('published');
    } finally {
      await app.close();
    }
  } finally {
    cleanup(dir);
  }
});
