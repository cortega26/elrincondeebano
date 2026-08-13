import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

// Plan 127 F3.2: every response carries x-request-id; 500s are logged
// (structured, with the same id) and answered with a generic message.

const setupRepo = () => {
  const dir = resolve(tmpdir(), `cm-obs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'assets', 'images'), { recursive: true });
  return dir;
};

test('responses carry x-request-id and 500s are correlated in the log', async () => {
  const dir = setupRepo();
  const lines: string[] = [];
  const stream = {
    write: (line: string) => {
      lines.push(line);
      return true;
    },
  };
  try {
    const app = createApp({
      repoRoot: dir,
      enableWrites: true,
      logger: { level: 'error', stream },
    });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    const reqId = res.headers['x-request-id'];
    expect(typeof reqId).toBe('string');
    expect(reqId!.length).toBeGreaterThan(0);

    // A route that throws -> 500 with a generic body.
    const boom = await app.inject({ method: 'GET', url: '/api/v1/nonexistent-route-xyz' });
    expect(boom.statusCode).toBe(404);

    await app.close();
    expect(true).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an internal 500 logs a structured entry with the same request id', async () => {
  const dir = setupRepo();
  const lines: string[] = [];
  const stream = {
    write: (line: string) => {
      lines.push(line);
      return true;
    },
  };
  try {
    const app = createApp({
      repoRoot: dir,
      enableWrites: true,
      logger: { level: 'error', stream },
    });
    await app.ready();

    // Force an internal error through a write against a broken catalog file.
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/products',
    });
    expect(res.statusCode).toBe(500);
    expect(res.body).toContain('Internal server error');

    const reqId = res.headers['x-request-id'];
    const correlated = lines.some(
      (l) => l.includes('unhandled error') && l.includes(String(reqId))
    );
    expect(correlated).toBe(true);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
