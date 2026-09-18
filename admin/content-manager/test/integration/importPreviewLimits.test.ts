// Plan 013 Step 1: server-side duplicate of the import byte cap.
import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import type { FastifyInstance } from 'fastify';
import { MAX_IMPORT_BYTES } from '../../src/shared/schemas/importExport.ts';

function getCredential(app: FastifyInstance): string {
  const cred = (app as unknown as Record<string, unknown>).launchCredential;
  return typeof cred === 'string' ? cred : '';
}

function credHeaders(app: FastifyInstance): Record<string, string> {
  return { [CREDENTIAL_HEADER]: getCredential(app) };
}

function createTempDir(): string {
  return resolve(
    tmpdir(),
    `cm-import-limits-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

test('POST /api/v1/import/preview rejects payloads over MAX_IMPORT_BYTES with 413', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const bigDescription = 'x'.repeat(MAX_IMPORT_BYTES + 1);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/preview',
      headers: credHeaders(app),
      payload: {
        products: [{ name: 'Big', description: bigDescription, price: 100, category: 'x' }],
      },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('PAYLOAD_TOO_LARGE');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/import/preview accepts the largest real catalog (~148 KB)', async () => {
  // Repo-truth anchor: data/product_data.json must stay far below the cap.
  const candidates = [
    resolve(__dirname, '../../../../data/product_data.json'),
    '/home/carlos/VS_Code_Projects/products/el-rincon-de-ebano/data/product_data.json',
  ];
  const catalogPath = candidates.find((p) => existsSync(p));
  if (!catalogPath) return;
  const raw = readFileSync(catalogPath, 'utf8');
  expect(Buffer.byteLength(raw, 'utf8')).toBeLessThan(MAX_IMPORT_BYTES);
  const catalog = JSON.parse(raw) as { products: unknown[] };
  expect(catalog.products.length).toBeGreaterThan(0);

  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/preview',
      headers: credHeaders(app),
      payload: { products: catalog.products },
    });
    expect(res.statusCode).toBe(200);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
