// Plan 180: import-preview hardening — the preview persists server-side
// state, so it requires the launch credential (mutation class); oversized
// payloads are rejected fast on declared size; consumed previews are
// deleted and the directory is capped.
import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { PreviewRepository } from '../../src/server/repositories/previewRepository.ts';
import { writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import { MAX_IMPORT_BYTES } from '../../src/shared/schemas/importExport.ts';
import type { FastifyInstance } from 'fastify';

function getCredential(app: FastifyInstance): string {
  const cred = (app as unknown as Record<string, unknown>).launchCredential;
  return typeof cred === 'string' ? cred : '';
}

function createTempDir(): string {
  return resolve(
    tmpdir(),
    `cm-preview-hardening-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

const TINY_PRODUCTS = { products: [] };

test('import preview requires the launch credential off loopback', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    try {
      // Loopback without credential: the single-operator flow is intact.
      const local = await app.inject({
        method: 'POST',
        url: '/api/v1/import/preview',
        headers: { 'Content-Type': 'application/json' },
        payload: TINY_PRODUCTS,
      });
      expect(local.statusCode).toBe(200);

      // Non-loopback Host is rejected by the independent Host allowlist
      // (defense-in-depth retains a check for any non-loopback ip/host),
      // with or without a credential.
      const remoteDenied = await app.inject({
        method: 'POST',
        url: '/api/v1/import/preview',
        headers: { host: '192.168.1.10:3000', 'Content-Type': 'application/json' },
        payload: TINY_PRODUCTS,
      });
      expect([401, 403]).toContain(remoteDenied.statusCode);
      const remoteAuthed = await app.inject({
        method: 'POST',
        url: '/api/v1/import/preview',
        headers: {
          host: '192.168.1.10:3000',
          'Content-Type': 'application/json',
          [CREDENTIAL_HEADER]: getCredential(app),
        },
        payload: TINY_PRODUCTS,
      });
      expect([401, 403]).toContain(remoteAuthed.statusCode);
      // NOTE (plan 182 follow-up): a non-loopback SOURCE IP presenting a
      // loopback Host still bypasses on the Host half of isLoopbackRequest
      // until the bypass goes IP-only — the full credential-demand matrix
      // (remote-IP + loopback-Host => 401) is pinned by plan 182's tests,
      // not duplicated here. The reclassification itself is pinned at unit
      // level in routePolicy.test.ts ('classifies persisting previews').
    } finally {
      await app.close();
    }
  } finally {
    cleanup(dir);
  }
});

test('oversized payloads are rejected with 413 before any preview is built', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    try {
      // NOTE on inject limits: an explicit content-length header cannot
      // survive app.inject (duplicate-length requests fail at the HTTP
      // layer), so the pre-gate is exercised here with a genuinely
      // oversized body — its declared length trips the pre-gate first, and
      // the post-parse measurement stays authoritative behind it.
      const bigDescription = 'x'.repeat(MAX_IMPORT_BYTES + 128 * 1024);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/import/preview',
        headers: {
          [CREDENTIAL_HEADER]: getCredential(app),
          'Content-Type': 'application/json',
        },
        payload: {
          products: [{ name: 'Big', price: 1, category: 'c', description: bigDescription }],
        },
      });
      expect(res.statusCode).toBe(413);
      expect(res.json().error.code).toBe('PAYLOAD_TOO_LARGE');
      // Rejected before any preview was built or persisted.
      expect(readdirSync(resolve(dir, 'data', 'import-previews'))).toHaveLength(0);
    } finally {
      await app.close();
    }
  } finally {
    cleanup(dir);
  }
});

test('successful apply deletes its preview; re-apply is a clean 404', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    try {
      const headers = {
        [CREDENTIAL_HEADER]: getCredential(app),
        'Content-Type': 'application/json',
      };
      const preview = await app.inject({
        method: 'POST',
        url: '/api/v1/import/preview',
        headers,
        payload: {
          products: [{ name: 'Quinoa', price: 1500, category: 'abarrotes' }],
        },
      });
      expect(preview.statusCode).toBe(200);
      const previewId = preview.json().preview_id as string;

      const applied = await app.inject({
        method: 'POST',
        url: '/api/v1/import/apply',
        headers,
        payload: { preview_id: previewId, resolutions: [] },
      });
      expect(applied.statusCode).toBe(200);

      expect(new PreviewRepository(dir).load(previewId)).toBeNull();

      const replay = await app.inject({
        method: 'POST',
        url: '/api/v1/import/apply',
        headers,
        payload: { preview_id: previewId, resolutions: [] },
      });
      expect(replay.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  } finally {
    cleanup(dir);
  }
});

test('preview directory is capped — oldest records are evicted', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    try {
      const headers = {
        [CREDENTIAL_HEADER]: getCredential(app),
        'Content-Type': 'application/json',
      };
      const ids: string[] = [];
      for (let i = 0; i < 51; i += 1) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/import/preview',
          headers,
          payload: TINY_PRODUCTS,
        });
        expect(res.statusCode).toBe(200);
        ids.push(res.json().preview_id as string);
      }
      const files = readdirSync(resolve(dir, 'data', 'import-previews'));
      expect(files.length).toBeLessThanOrEqual(50);
      expect(new PreviewRepository(dir).load(ids[0])).toBeNull();
      expect(new PreviewRepository(dir).load(ids[ids.length - 1])).not.toBeNull();
    } finally {
      await app.close();
    }
  } finally {
    cleanup(dir);
  }
});
