// Plan 176: media apply output guards — empty outputs must 422 before the
// product reference is touched (never link to a never-promoted file), and
// multi-output intents are rejected (mediaJobs produces exactly one output
// on success). Rollback pairing itself is pinned by the existing async
// mediaWorkbench suite, which must stay green.
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

function headers(app: FastifyInstance): Record<string, string> {
  return { [CREDENTIAL_HEADER]: getCredential(app) };
}

function createTempDir(): string {
  return resolve(
    tmpdir(),
    `cm-media-apply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
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
      rev: 4,
      products: [
        {
          id: 'm-1',
          name: 'Media Product',
          description: '',
          price: 500,
          discount: 0,
          stock: true,
          category: 'x',
          image_path: '',
          image_avif_path: '',
          order: 0,
          is_archived: false,
          rev: 4,
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

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function craftIntent(dir: string, id: string, outputs: string[], type = 'variant'): void {
  mkdirSync(resolve(dir, 'data', 'media-intents'), { recursive: true });
  writeFileSync(
    resolve(dir, 'data', 'media-intents', `${id}.json`),
    JSON.stringify({
      version: 1,
      id,
      type,
      status: 'succeeded',
      target_path: 'assets/images/p1.webp',
      product_id: 'm-1',
      outputs,
      progress: 100,
      errors: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
  );
}

async function revision(app: FastifyInstance): Promise<number> {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/products/revision',
    headers: headers(app),
  });
  return res.json().rev as number;
}

async function productImage(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/products/m-1',
    headers: headers(app),
  });
  return res.json().image_path as string;
}

test('apply with empty outputs is rejected before touching the catalog', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    try {
      craftIntent(dir, 'intent-test-empty', []);
      const revBefore = await revision(app);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/media/intents/intent-test-empty/apply',
        headers: headers(app),
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('MISSING_OUTPUT');

      expect(await revision(app)).toBe(revBefore);
      expect(await productImage(app)).toBe('');
    } finally {
      await app.close();
    }
  } finally {
    cleanup(dir);
  }
});

test('apply with multiple outputs is rejected as a contract violation', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    try {
      craftIntent(dir, 'intent-test-multi', ['/staging/a.webp', '/staging/b.webp']);
      const revBefore = await revision(app);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/media/intents/intent-test-multi/apply',
        headers: headers(app),
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('MULTIPLE_OUTPUTS');

      expect(await revision(app)).toBe(revBefore);
      expect(await productImage(app)).toBe('');
    } finally {
      await app.close();
    }
  } finally {
    cleanup(dir);
  }
});
