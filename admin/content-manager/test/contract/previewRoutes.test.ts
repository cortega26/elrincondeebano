// Plan 211: build+preview route — containment, policy, single-flight.
import { test, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../../src/server/app.ts';
import type { FastifyInstance } from 'fastify';
import { resolvePreviewFilePath } from '../../src/server/routes/previewRoutes.ts';
import { classifyRoute } from '../../src/server/security/routePolicy.ts';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';

function createTempDir(): string {
  return resolve(
    tmpdir(),
    `cm-preview-211-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function setup(dir: string): void {
  const dataDir = resolve(dir, 'data');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    resolve(dataDir, 'product_data.json'),
    JSON.stringify({ version: 't', last_updated: '', rev: 1, products: [] })
  );
  writeFileSync(
    resolve(dataDir, 'category_registry.json'),
    JSON.stringify({ nav_groups: [], categories: [] })
  );
  // Minimal preview dist: only what containment needs to resolve.
  const dist = resolve(dir, 'astro-poc', 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(resolve(dist, 'index.html'), '<html>preview</html>');
}

function getCredential(app: FastifyInstance): string {
  const cred = (app as unknown as { launchCredential?: string }).launchCredential;
  return typeof cred === 'string' ? cred : '';
}

// ── resolvePreviewFilePath: containment unit pins ──

test('containment rejects encoded, double-encoded and bare traversals', () => {
  const root = '/repo';
  for (const evil of [
    '/api/v1/preview/%2e%2e/%2e%2e/etc/passwd',
    '/api/v1/preview/%2e%2e/secret.txt',
    '/api/v1/preview/../etc/passwd',
    '/api/v1/preview/%252e%252e/x',
  ]) {
    expect(resolvePreviewFilePath(root, evil)).toBeNull();
  }
});

test('containment rejects malformed encodings', () => {
  expect(resolvePreviewFilePath('/repo', '/api/v1/preview/%zz/top')).toBeNull();
});

test('containment resolves valid asset paths inside dist', () => {
  const root = resolve(tmpdir(), `cm-preview-resolve-${Date.now()}`);
  const dist = resolve(root, 'astro-poc', 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(resolve(dist, 'index.html'), '<html>x</html>');
  try {
    const file = resolvePreviewFilePath(root, '/api/v1/preview/index.html?x=1');
    expect(file).toBe(resolve(dist, 'index.html'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('containment falls back to index.html for unknown non-asset routes', () => {
  const root = resolve(tmpdir(), `cm-preview-fallback-${Date.now()}`);
  const dist = resolve(root, 'astro-poc', 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(resolve(dist, 'index.html'), '<html>x</html>');
  try {
    const file = resolvePreviewFilePath(root, '/api/v1/preview/despensa/');
    expect(file).toBe(resolve(dist, 'index.html'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── policy classification ──

test('preview build POST is a mutation; preview GETs are reads', () => {
  expect(classifyRoute('POST', '/api/v1/preview/build')).toEqual({
    class: 'mutation',
    exact: true,
  });
  expect(classifyRoute('GET', '/api/v1/preview')).toEqual({ class: 'read', exact: true });
  expect(classifyRoute('GET', '/api/v1/preview/index.html')).toEqual({
    class: 'read',
    exact: true,
  });
  expect(classifyRoute('GET', '/api/v1/preview/_astro/app.js')).toEqual({
    class: 'read',
    exact: true,
  });
});

// ── wired routes (flag-gated) ──

let app: FastifyInstance;
let dir: string;
let prevFlag: string | undefined;

beforeAll(async () => {
  prevFlag = process.env.PREVIEW_BUILD_ENABLED;
  process.env.PREVIEW_BUILD_ENABLED = '1';
  dir = createTempDir();
  setup(dir);
  app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  if (prevFlag === undefined) {
    delete process.env.PREVIEW_BUILD_ENABLED;
  } else {
    process.env.PREVIEW_BUILD_ENABLED = prevFlag;
  }
  rmSync(dir, { recursive: true, force: true });
});

test('POST /preview/build schedules a job (202) and a second build is 409 busy', async () => {
  const ch = { [CREDENTIAL_HEADER]: getCredential(app) };
  const first = await app.inject({ method: 'POST', url: '/api/v1/preview/build', headers: ch });
  expect(first.statusCode).toBe(202);
  const firstBody = first.json<{ job_id: string }>();
  expect(typeof firstBody.job_id).toBe('string');

  // The first job is still pending/running (npm spawn takes seconds) —
  // single-flight must refuse with the live job id, not queue silently.
  const second = await app.inject({ method: 'POST', url: '/api/v1/preview/build', headers: ch });
  expect(second.statusCode).toBe(409);
  expect(second.json<{ error: { code: string; job_id: string } }>().error.code).toBe(
    'PREVIEW_BUSY'
  );
  expect(second.json<{ error: { code: string; job_id: string } }>().error.job_id).toBe(
    firstBody.job_id
  );
});

test('GET /preview serves the built index; missing asset is 404', async () => {
  const index = await app.inject({ method: 'GET', url: '/api/v1/preview/' });
  expect(index.statusCode).toBe(200);
  expect(index.body).toContain('preview');

  const missing = await app.inject({ method: 'GET', url: '/api/v1/preview/assets/nope.webp' });
  expect(missing.statusCode).toBe(404);
});

test('preview routes are absent with the flag off', async () => {
  const dir2 = createTempDir();
  setup(dir2);
  const saved = process.env.PREVIEW_BUILD_ENABLED;
  delete process.env.PREVIEW_BUILD_ENABLED;
  try {
    const plain = createApp({ repoRoot: dir2, enableWrites: true, logger: false });
    await plain.ready();
    try {
      const res = await plain.inject({ method: 'POST', url: '/api/v1/preview/build' });
      expect(res.statusCode).toBe(404);
    } finally {
      await plain.close();
    }
  } finally {
    if (saved !== undefined) process.env.PREVIEW_BUILD_ENABLED = saved;
    rmSync(dir2, { recursive: true, force: true });
  }
});
