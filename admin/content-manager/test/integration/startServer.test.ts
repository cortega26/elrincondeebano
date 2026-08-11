import { test, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

// Plan 057 leftover: the real start.ts process must boot in operator mode
// with a launch credential sourced from the environment, answer /health, and
// shut down cleanly on SIGTERM.

function createTempDir(): string {
  return resolve(tmpdir(), `cm-start-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

function setup(dir: string): void {
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  writeFileSync(
    resolve(dir, 'data', 'product_data.json'),
    JSON.stringify({ version: 'test', last_updated: '', rev: 0, products: [] })
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

test(
  'start.ts boots in operator mode with an env credential and serves health',
  { timeout: 30_000 },
  async () => {
    const dir = createTempDir();
    setup(dir);

    const server = spawn(process.execPath, ['--import', 'tsx', 'src/server/start.ts'], {
      cwd: resolve(process.cwd()),
      env: {
        ...process.env,
        REPO_ROOT: dir,
        ADMIN_MODE: 'operator',
        ADMIN_CREDENTIAL: 'spawn-test-credential',
        PORT: '3199',
        HOST: '127.0.0.1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let listeningUrl: string | null = null;
    const started = new Promise<void>((resolvePromise) => {
      const check = (): void => {
        const match = output.match(/listening at (http:\/\/[^\s"]+)/);
        if (match && !listeningUrl) listeningUrl = match[1];
        if (listeningUrl && output.includes('mode: operator')) resolvePromise();
      };
      server.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        check();
      });
      server.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        check();
      });
    });

    try {
      await Promise.race([
        started,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Server did not report listening')), 15_000)
        ),
      ]);

      expect(listeningUrl).not.toBeNull();
      expect(output).toContain('mode: operator');

      const health = await fetch(`${listeningUrl}/api/v1/health`);
      expect(health.status).toBe(200);
      const body = (await health.json()) as { status: string };
      expect(body.status).toBe('ok');

      // Mutations require the credential (spawned process, real gate).
      const unauthorized = await fetch(`${listeningUrl}/api/v1/sync/now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(unauthorized.status).toBe(401);

      const authorized = await fetch(`${listeningUrl}/api/v1/sync/now`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-credential': 'spawn-test-credential',
        },
        body: '{}',
      });
      expect(authorized.status).toBe(200);
    } finally {
      server.kill('SIGTERM');
      await new Promise((resolvePromise) => server.on('exit', resolvePromise));
      rmSync(dir, { recursive: true, force: true });
    }
  }
);
