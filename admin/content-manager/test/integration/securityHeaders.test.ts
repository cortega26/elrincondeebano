import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

function createTempDir(): string {
  const dir = resolve(
    tmpdir(),
    `cm-security-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  return dir;
}

function setupDir(dir: string): void {
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

test('security headers are present on API responses', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CSP header exists on GET /api/v1/health', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers['content-security-policy']).toContain("style-src 'self'");

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('X-Content-Type-Options: nosniff is present', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/bootstrap',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mutation with cross-site Sec-Fetch-Site returns 403', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/publications/preview',
      headers: {
        'content-type': 'application/json',
        'sec-fetch-site': 'cross-site',
      },
      payload: {},
    });

    expect(response.statusCode).toBe(403);
    const body = response.json<{ error: { message: string } }>();
    expect(body.error.message).toContain('Cross-site');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mutation with wrong Origin returns 403', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/publications/preview',
      headers: {
        'content-type': 'application/json',
        origin: 'http://evil.com',
      },
      payload: {},
    });

    expect(response.statusCode).toBe(403);
    const body = response.json<{ error: { message: string } }>();
    expect(body.error.message).toContain('Invalid origin');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET requests without Origin still work', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET requests with wrong Origin still work', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: {
        origin: 'http://evil.com',
      },
    });

    expect(response.statusCode).toBe(200);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('health endpoint is exempt from security hooks', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/health',
      headers: {
        'sec-fetch-site': 'cross-site',
        origin: 'http://evil.com',
      },
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
