import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../../src/server/app.ts';
import type { FastifyInstance } from 'fastify';
import { classifyRoute, ROUTE_POLICY } from '../../src/server/security/routePolicy.ts';

// Plan 090: the registration contract — every route declared in
// src/server/routes/*.ts must be exactly declared in ROUTE_POLICY (no
// fail-closed fallback), and every table entry must be registered (no
// phantoms). Both directions fail this suite.
function declaredRoutes(): Array<{ method: string; path: string }> {
  const routesDir = resolve(process.cwd(), 'src', 'server', 'routes');
  const declared: Array<{ method: string; path: string }> = [];
  for (const file of readdirSync(routesDir).filter((f) => f.endsWith('.ts'))) {
    const source = readFileSync(resolve(routesDir, file), 'utf8');
    for (const match of source.matchAll(/app\.(get|post|put|patch|delete)\('([^']+)'/g)) {
      declared.push({ method: match[1].toUpperCase(), path: `/api/v1${match[2]}` });
    }
  }
  return declared;
}

// Guarantee test (plan 071 Step 2): every mutation route in the policy table
// must actually be registered AND require the credential. A route that is
// registered but missing from the table would answer 401 thanks to the
// fail-closed classifier only if it exists; a phantom table entry answers 404.
// Either drift fails this test — fix the table, never weaken the test.
const mutationUrls = ROUTE_POLICY.filter((e) => e.class === 'mutation')
  .map((e) => e.path)
  .map((p) => p.replace(/:[A-Za-z]+/g, 'probe'))
  .filter((p, i, all) => all.indexOf(p) === i);

describe('registered mutation routes (guarantee)', () => {
  let app: FastifyInstance;
  let dir: string;

  beforeAll(async () => {
    dir = resolve(tmpdir(), `cm-policy-guard-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(resolve(dir, 'data'), { recursive: true });
    mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
    writeFileSync(
      resolve(dir, 'data', 'product_data.json'),
      JSON.stringify({ version: 't', products: [] })
    );
    writeFileSync(
      resolve(dir, 'data', 'category_registry.json'),
      JSON.stringify({ nav_groups: [], categories: [] })
    );
    writeFileSync(
      resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
      JSON.stringify({ trustBar: {}, home: {}, bundles: [] })
    );
    app = createApp({ repoRoot: dir, enableWrites: true });
    // Registered-but-unlisted probe: must be blocked by the fail-closed
    // classifier. Registered before ready() — Fastify rejects routes after.
    app.post('/api/v1/unlisted-probe', async () => ({ ok: true }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('every mutation route in the table is registered and credential-gated', async () => {
    for (const url of mutationUrls) {
      // Loopback bypass (2026-08-29, single-operator 127.0.0.1): mutations from
      // loopback no longer require a credential — they proceed to the handler
      // (400/422/etc) instead of 401. Non-loopback Host is blocked 403.
      const response = await app.inject({ method: 'POST', url, payload: {} });
      expect(response.statusCode, `POST ${url} without credential (loopback bypass)`).not.toBe(401);
      const blocked = await app.inject({
        method: 'POST',
        url,
        payload: {},
        headers: { host: '192.168.1.10:3000' },
      });
      expect(
        [401, 403].includes(blocked.statusCode),
        `POST ${url} non-loopback should be blocked`
      ).toBe(true);
    }
  });

  it('unlisted routes fail closed for write methods and stay readable for GET', async () => {
    const probe = await app.inject({ method: 'POST', url: '/api/v1/unlisted-probe' });
    expect(probe.statusCode).not.toBe(401);
    const probeBlocked = await app.inject({
      method: 'POST',
      url: '/api/v1/unlisted-probe',
      headers: { host: '192.168.1.10:3000' },
    });
    expect([401, 403].includes(probeBlocked.statusCode)).toBe(true);

    const read = await app.inject({ method: 'GET', url: '/api/v1/unlisted-probe' });
    expect(read.statusCode).not.toBe(401);
  });
});

describe('classifyRoute', () => {
  it('classifies a listed exact route', () => {
    expect(classifyRoute('POST', '/api/v1/products')).toEqual({ class: 'mutation', exact: true });
    expect(classifyRoute('GET', '/api/v1/products')).toEqual({ class: 'read', exact: true });
  });

  it('classifies a listed param route', () => {
    expect(classifyRoute('PATCH', '/api/v1/products/abc-123')).toEqual({
      class: 'mutation',
      exact: true,
    });
    expect(classifyRoute('POST', '/api/v1/backup/2026-08-03/restore')).toEqual({
      class: 'mutation',
      exact: true,
    });
  });

  it('classifies preview routes', () => {
    expect(classifyRoute('POST', '/api/v1/products/bulk/preview')).toEqual({
      class: 'preview',
      exact: true,
    });
    expect(classifyRoute('POST', '/api/v1/publications/preview')).toEqual({
      class: 'preview',
      exact: true,
    });
  });

  it('fails open to read only for unlisted GET', () => {
    expect(classifyRoute('GET', '/api/v1/unknown-thing')).toEqual({ class: 'read', exact: false });
  });

  it('fails closed to mutation for unlisted write methods', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(classifyRoute(method, '/api/v1/unknown-thing')).toEqual({
        class: 'mutation',
        exact: false,
      });
    }
  });

  it('ignores query strings', () => {
    expect(classifyRoute('GET', '/api/v1/products?page=2')).toEqual({
      class: 'read',
      exact: true,
    });
  });
});

describe('ROUTE_POLICY table', () => {
  it('contains no duplicate method+path entries', () => {
    const keys = ROUTE_POLICY.map((e) => `${e.method} ${e.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has no phantom preview entries that are really mutations', () => {
    const previews = ROUTE_POLICY.filter((e) => e.class === 'preview').map((e) => e.path);
    expect(previews.sort()).toEqual([
      '/api/v1/backup/prune-preview',
      '/api/v1/import/preview',
      '/api/v1/products/bulk/preview',
      '/api/v1/publications/preview',
    ]);
  });

  it('every declared route is exactly declared — no fail-closed fallback', () => {
    const declared = declaredRoutes();
    expect(declared.length).toBeGreaterThan(40);
    const undeclared = declared.filter((r) => !classifyRoute(r.method, r.path).exact);
    expect(undeclared).toEqual([]);
  });

  it('every policy entry is registered — no phantom routes', () => {
    const declared = new Set(declaredRoutes().map((r) => `${r.method} ${r.path}`));
    const phantom = ROUTE_POLICY.filter((e) => !declared.has(`${e.method} ${e.path}`));
    expect(phantom).toEqual([]);
  });

  it('diff is classified read (no write credential needed for a pure diff)', () => {
    expect(classifyRoute('POST', '/api/v1/diff')).toEqual({ class: 'read', exact: true });
  });
});
