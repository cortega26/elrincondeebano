import { test, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../../src/server/app.ts';
import type { FastifyInstance } from 'fastify';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';

// Plan 071 write boundary: every mutation route requires the launch
// credential (401 without / with wrong one), read-only mode rejects writes
// (405) even in handlers, and the credential is never served by bootstrap.
interface Probe {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  payload?: unknown;
}

const MUTATION_PROBES: Probe[] = [
  {
    method: 'POST',
    url: '/api/v1/products',
    payload: { command_id: 'wb-1', payload: { name: 'X', price: 100 } },
  },
  { method: 'POST', url: '/api/v1/backup' },
  { method: 'POST', url: '/api/v1/backup/does-not-exist/restore' },
  { method: 'POST', url: '/api/v1/change-sets', payload: {} },
  { method: 'POST', url: '/api/v1/conflicts/does-not-exist/resolve' },
  { method: 'POST', url: '/api/v1/media/intents', payload: {} },
  { method: 'POST', url: '/api/v1/publications', payload: {} },
  { method: 'PUT', url: '/api/v1/sync/config', payload: {} },
];

const baseCatalog = {
  version: '20260803-wb',
  last_updated: '2026-08-03T00:00:00.000Z',
  rev: 1,
  products: [],
};
const baseCategories = { nav_groups: [], categories: [] };
const baseStorefront = {
  trustBar: { highlights: [], statusItems: [] },
  home: {
    primaryCategories: [],
    secondaryCategories: [],
    fallbackQuickPicks: [],
    featuredStaples: [],
  },
  bundles: [],
  companionRules: [],
};

let dir: string;
let operatorApp: FastifyInstance;
let readOnlyApp: FastifyInstance;
let credential: string;

beforeAll(async () => {
  dir = resolve(tmpdir(), `cm-write-boundary-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  writeFileSync(resolve(dir, 'data', 'product_data.json'), JSON.stringify(baseCatalog));
  writeFileSync(resolve(dir, 'data', 'category_registry.json'), JSON.stringify(baseCategories));
  writeFileSync(
    resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
    JSON.stringify(baseStorefront)
  );

  operatorApp = createApp({ repoRoot: dir, enableWrites: true });
  readOnlyApp = createApp({ repoRoot: dir, enableWrites: false });
  await operatorApp.ready();
  await readOnlyApp.ready();
  credential = (operatorApp as unknown as { launchCredential: string }).launchCredential;
});

afterAll(async () => {
  await operatorApp.close();
  await readOnlyApp.close();
  rmSync(dir, { recursive: true, force: true });
});

test('mutation routes reject requests without a credential (401)', async () => {
  for (const probe of MUTATION_PROBES) {
    const response = await operatorApp.inject({
      method: probe.method,
      url: probe.url,
      payload: probe.payload,
    });
    expect(response.statusCode, `${probe.method} ${probe.url}`).toBe(401);
  }
});

test('mutation routes reject requests with a wrong credential (401)', async () => {
  for (const probe of MUTATION_PROBES) {
    const response = await operatorApp.inject({
      method: probe.method,
      url: probe.url,
      payload: probe.payload,
      headers: { [CREDENTIAL_HEADER]: 'a'.repeat(credential.length) },
    });
    expect(response.statusCode, `${probe.method} ${probe.url}`).toBe(401);
  }
});

test('mutation routes are rejected in read-only mode even with a valid credential (405)', async () => {
  for (const probe of MUTATION_PROBES) {
    const response = await readOnlyApp.inject({
      method: probe.method,
      url: probe.url,
      payload: probe.payload,
      headers: { [CREDENTIAL_HEADER]: credential },
    });
    expect(response.statusCode, `${probe.method} ${probe.url}`).toBe(405);
  }
});

test('mutation routes do not answer 401/405 with a valid credential in operator mode', async () => {
  for (const probe of MUTATION_PROBES) {
    const response = await operatorApp.inject({
      method: probe.method,
      url: probe.url,
      payload: probe.payload,
      headers: { [CREDENTIAL_HEADER]: credential },
    });
    expect(
      [401, 405].includes(response.statusCode),
      `${probe.method} ${probe.url} -> ${response.statusCode}`
    ).toBe(false);
  }
});

test('bootstrap never serves the launch credential', async () => {
  const response = await operatorApp.inject({ method: 'GET', url: '/api/v1/bootstrap' });
  expect(response.statusCode).toBe(200);
  const body = response.json<Record<string, unknown>>();
  expect(body.credential).toBeUndefined();
  expect(body.counts).toBeDefined();
});

test('Host header not in the allowlist is rejected with 403 (DNS rebinding)', async () => {
  const response = await operatorApp.inject({
    method: 'GET',
    url: '/api/v1/health',
    headers: { host: 'evil.example' },
  });
  expect(response.statusCode).toBe(403);
  const allowed = await operatorApp.inject({
    method: 'GET',
    url: '/api/v1/health',
    headers: { host: 'localhost' },
  });
  expect(allowed.statusCode).toBe(200);
});
