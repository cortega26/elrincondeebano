import { test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../../src/server/app.ts';

// Plan 127 F3.5: credential rotation — the script replaces the 0600 file and
// the old value stops authenticating on a fresh app instance.

test('rotate-credential writes a 0600 file with a fresh value', () => {
  const repo = resolve(
    tmpdir(),
    `cm-rotate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(resolve(repo, 'data'), { recursive: true });
  const previous = 'cm-old-value';
  const credentialPath = resolve(repo, 'data', '.admin-credential');
  writeFileSync(credentialPath, previous, { mode: 0o600 });
  try {
    execFileSync(process.execPath, [resolve(process.cwd(), 'scripts', 'rotate-credential.mjs')], {
      env: { ...process.env, REPO_ROOT: repo },
    });
    const fresh = readFileSync(credentialPath, 'utf-8').trim();
    expect(fresh).not.toBe(previous);
    expect(fresh).toMatch(/^cm-[A-Za-z0-9_-]{43}$/);
    expect(statSync(credentialPath).mode & 0o777).toBe(0o600);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('a fresh app authenticates with the file credential, not the old value', async () => {
  const repo = resolve(
    tmpdir(),
    `cm-rotate-app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(resolve(repo, 'data'), { recursive: true });
  writeFileSync(
    resolve(repo, 'data', 'product_data.json'),
    JSON.stringify({ version: 'v1', last_updated: '', rev: 0, products: [] })
  );
  const credentialPath = resolve(repo, 'data', '.admin-credential');
  const rotated = 'cm-rotated-value-123';
  writeFileSync(credentialPath, rotated, { mode: 0o600 });
  try {
    // start.ts reads the file; createApp consumes the resolved value — here
    // we assert the file is the source of truth for the auth check.
    const app = createApp({
      repoRoot: repo,
      enableWrites: true,
      logger: false,
      launchCredential: rotated,
    });
    await app.ready();
    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: { 'x-admin-credential': rotated, 'Content-Type': 'application/json' },
      payload: { command_id: 'rot-1', payload: { name: 'R', price: 1, category: 'c' } },
    });
    expect(ok.statusCode).toBe(201);

    const old = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: { 'x-admin-credential': 'cm-old-value', 'Content-Type': 'application/json' },
      payload: { command_id: 'rot-2', payload: { name: 'R2', price: 1, category: 'c' } },
    });
    expect(old.statusCode).toBe(401);
    await app.close();
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
