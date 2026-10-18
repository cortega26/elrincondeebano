import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/server/app.ts';

const origin = 'https://admin.elrincondeebano.com';
const credential = 'dedicated-remote-credential';
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function isolatedRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'ebano-remote-security-'));
  tempDirs.push(root);
  mkdirSync(join(root, 'data'));
  writeFileSync(
    join(root, 'data', 'product_data.json'),
    JSON.stringify({ version: 'v1', last_updated: '', rev: 0, products: [] })
  );
  return root;
}

test('remote mode requires an admin credential on reads, even from loopback', async () => {
  const app = createApp({
    repoRoot: isolatedRepo(),
    enableWrites: true,
    logger: false,
    launchCredential: credential,
    remoteOrigin: origin,
  });
  try {
    await app.ready();
    const url = '/api/v1/products';
    const headers = { host: 'admin.elrincondeebano.com' };
    expect((await app.inject({ method: 'GET', url, headers })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url, headers: { ...headers, 'x-admin-credential': credential } }))
        .statusCode
    ).toBe(200);
    // Plan 223: remote mode gates health too — no unauthenticated recon.
    expect((await app.inject({ method: 'GET', url: '/api/v1/health', headers })).statusCode).toBe(
      401
    );
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/health',
          headers: { ...headers, 'x-admin-credential': credential },
        })
      ).statusCode
    ).toBe(200);
  } finally {
    await app.close();
  }
});

test('remote mode never trusts loopback source for mutations; validates HTTPS origin', async () => {
  const app = createApp({
    repoRoot: isolatedRepo(),
    enableWrites: true,
    logger: false,
    launchCredential: credential,
    remoteOrigin: origin,
  });
  const post = (headers: Record<string, string>) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: { host: 'admin.elrincondeebano.com', 'Content-Type': 'application/json', ...headers },
      payload: { command_id: 'remote-security-1', payload: { name: 'Test', price: 1, category: 'c' } },
    });
  try {
    await app.ready();
    expect((await post({ origin })).statusCode).toBe(401);
    expect((await post({ 'x-admin-credential': credential, origin: 'https://evil.example' })).statusCode).toBe(403);
    expect((await post({ 'x-admin-credential': credential, origin })).statusCode).toBe(201);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/products', headers: { host: 'wrong.example', 'x-admin-credential': credential } })).statusCode
    ).toBe(403);
  } finally {
    await app.close();
  }
});

test('remote mode rejects non-HTTPS and non-origin URLs at initialization', () => {
  const repoRoot = isolatedRepo();
  for (const remoteOrigin of ['http://admin.elrincondeebano.com', 'https://admin.elrincondeebano.com/path', 'https://admin.elrincondeebano.com/']) {
    expect(() => createApp({ repoRoot, logger: false, remoteOrigin })).toThrow(
      'ADMIN_REMOTE_ORIGIN must be an exact HTTPS origin'
    );
  }
});
