import { test, expect } from 'vitest';
import { createApp } from './app.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

function createTempDir(): string {
  const dir = resolve(tmpdir(), `cm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  return dir;
}

function setupData(dir: string): void {
  writeFileSync(
    resolve(dir, 'data', 'product_data.json'),
    JSON.stringify({
      version: 'test',
      last_updated: '',
      rev: 0,
      products: [],
    })
  );
  writeFileSync(
    resolve(dir, 'data', 'category_registry.json'),
    JSON.stringify({
      nav_groups: [],
      categories: [],
    })
  );
  writeFileSync(
    resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
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

test('createApp returns a Fastify instance', async () => {
  const dir = createTempDir();
  try {
    setupData(dir);
    const app = createApp({ repoRoot: dir, logger: false });
    expect(app).toBeDefined();
    expect(typeof app.ready).toBe('function');
    await app.ready();
    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('health route returns valid JSON', async () => {
  const dir = createTempDir();
  try {
    setupData(dir);
    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string }>();
    expect(body.status).toBe('ok');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unknown route returns 404', async () => {
  const dir = createTempDir();
  try {
    setupData(dir);
    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/nonexistent',
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
