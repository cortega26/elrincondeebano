import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { FastifyInstance } from 'fastify';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';

function getCredential(app: FastifyInstance): string {
  const cred = (app as unknown as { launchCredential?: string }).launchCredential;
  return typeof cred === 'string' ? cred : '';
}

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

test('mutation with a legitimate same-origin Origin (including port) succeeds', async () => {
  // Regression test: expectedOrigin used to be built from request.hostname,
  // which drops the port — so a real browser's Origin header (which always
  // includes the port on a non-default port, e.g. this app's default 3000)
  // was rejected as "Invalid origin" on every real deployment. Confirmed
  // live against a running instance before this test existed: an Origin
  // with the port got a 403; the same request without the port succeeded
  // (i.e. exactly backwards from what should happen).
  const dir = createTempDir();
  try {
    setupDir(dir);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: {
        'content-type': 'application/json',
        host: '127.0.0.1:3000',
        origin: 'http://127.0.0.1:3000',
        'sec-fetch-site': 'same-origin',
        [CREDENTIAL_HEADER]: getCredential(app),
      },
      payload: {
        command_id: 'origin-with-port',
        payload: { name: 'Origin With Port', price: 500, category: 'x' },
      },
    });

    expect(response.statusCode).toBe(201);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mutation with Origin missing the port is rejected as a mismatch', async () => {
  // Inverse of the regression above: an Origin that omits the port the
  // request actually arrived on must NOT be treated as same-origin, even
  // though the old buggy comparison (host/port stripped on both sides)
  // would have accepted it.
  const dir = createTempDir();
  try {
    setupDir(dir);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: {
        'content-type': 'application/json',
        host: '127.0.0.1:3000',
        origin: 'http://127.0.0.1',
        [CREDENTIAL_HEADER]: getCredential(app),
      },
      payload: {
        command_id: 'origin-missing-port',
        payload: { name: 'Origin Missing Port', price: 500, category: 'x' },
      },
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

// ── plan 090: internal error details never reach the client ─────────────────

test('internal errors return a generic message without filesystem paths', async () => {
  const dir = resolve(tmpdir(), `cm-leak-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  // Corrupt the catalog so loadCatalog throws with the file path embedded.
  writeFileSync(resolve(dir, 'data', 'product_data.json'), '{ this is not valid json');
  writeFileSync(
    resolve(dir, 'data', 'category_registry.json'),
    JSON.stringify({ nav_groups: [], categories: [] })
  );
  writeFileSync(
    resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
    JSON.stringify({ trustBar: {}, home: {}, bundles: [] })
  );
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/v1/products' });
    expect(res.statusCode).toBe(500);
    const body = res.json<{ error: { code: string; message: string } }>();
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Internal server error');
    expect(res.body).not.toContain('/home/');
    expect(res.body).not.toContain(dir);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
