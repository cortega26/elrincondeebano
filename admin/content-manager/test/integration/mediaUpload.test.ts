import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import type { FastifyInstance } from 'fastify';

function getCredential(app: FastifyInstance): string {
  const cred = (app as unknown as Record<string, unknown>).launchCredential;
  return typeof cred === 'string' ? cred : '';
}

function credHeaders(app: FastifyInstance): Record<string, string> {
  return { [CREDENTIAL_HEADER]: getCredential(app) };
}

function setup(dir: string): void {
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'assets', 'images'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  writeFileSync(
    resolve(dir, 'data', 'product_data.json'),
    JSON.stringify({ version: 't', last_updated: '', rev: 0, products: [] })
  );
  writeFileSync(
    resolve(dir, 'data', 'category_registry.json'),
    JSON.stringify({ nav_groups: [], categories: [] })
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

function smallImageBase64(): string {
  // 1x1 white PNG (67 bytes)
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
}

test('POST /api/v1/media/upload with valid base64 data stages the file (never canonical)', async () => {
  const dir = resolve(tmpdir(), `cm-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  setup(dir);

  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/media/upload',
      headers: credHeaders(app),
      payload: {
        data: smallImageBase64(),
        targetPath: 'assets/images/test-upload.png',
        content_type: 'image/png',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{
      status: string;
      targetPath: string;
      staged_file?: string;
      sha256?: string;
    }>();
    expect(body.status).toBe('staged');
    expect(body.targetPath).toBe('assets/images/test-upload.png');
    expect(body.staged_file).toBeDefined();
    expect(body.sha256).toMatch(/^[0-9a-f]{64}$/);

    // Plan 063: upload never writes canonical paths — only staging.
    const canonical = resolve(dir, 'assets', 'images', 'test-upload.png');
    expect(existsSync(canonical)).toBe(false);
    const staged = resolve(dir, 'data', '.media-staging', body.staged_file!);
    expect(existsSync(staged)).toBe(true);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/media/upload with oversized payload returns 413', async () => {
  const dir = resolve(tmpdir(), `cm-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  setup(dir);

  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const largeBuffer = Buffer.alloc(10 * 1024 * 1024 + 1);
    const largeData = largeBuffer.toString('base64');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/media/upload',
      headers: credHeaders(app),
      payload: {
        data: largeData,
        targetPath: 'assets/images/large.png',
        content_type: 'image/png',
      },
    });

    expect(res.statusCode).toBe(413);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/media/upload with invalid MIME type returns 415', async () => {
  const dir = resolve(tmpdir(), `cm-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  setup(dir);

  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/media/upload',
      headers: credHeaders(app),
      payload: {
        data: smallImageBase64(),
        targetPath: 'assets/images/test.bmp',
        content_type: 'image/bmp',
      },
    });

    expect(res.statusCode).toBe(415);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/media/upload with path traversal returns 400', async () => {
  const dir = resolve(tmpdir(), `cm-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  setup(dir);

  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/media/upload',
      headers: credHeaders(app),
      payload: {
        targetPath: '../etc/passwd',
        content_type: 'image/png',
      },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/media/upload without targetPath returns 400', async () => {
  const dir = resolve(tmpdir(), `cm-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  setup(dir);

  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/media/upload',
      headers: credHeaders(app),
      payload: {
        content_type: 'image/png',
      },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/media/upload respects repo root sandbox', async () => {
  const dir = resolve(tmpdir(), `cm-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  setup(dir);

  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/media/upload',
      headers: credHeaders(app),
      payload: {
        targetPath: '/absolute/path/image.png',
        content_type: 'image/png',
      },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
