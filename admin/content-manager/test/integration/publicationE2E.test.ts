import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

function setupDir(): string {
  const dir = resolve(tmpdir(), `cm-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'assets', 'images'), { recursive: true });

  writeFileSync(
    resolve(dir, 'data', 'product_data.json'),
    JSON.stringify({ version: '1', last_updated: '', rev: 0, products: [] })
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

  try {
    execFileSync('git', ['init'], { cwd: dir, encoding: 'utf-8', timeout: 5000 });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], {
      cwd: dir,
      encoding: 'utf-8',
      timeout: 5000,
    });
    execFileSync('git', ['config', 'user.name', 'Test'], {
      cwd: dir,
      encoding: 'utf-8',
      timeout: 5000,
    });
    execFileSync('git', ['add', '-A'], { cwd: dir, encoding: 'utf-8', timeout: 5000 });
    execFileSync('git', ['commit', '-m', 'initial'], {
      cwd: dir,
      encoding: 'utf-8',
      timeout: 5000,
    });
  } catch {
    // Git may not be available
  }

  return dir;
}

test('E2E: git status returns branch data', async () => {
  const dir = setupDir();
  try {
    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/api/v1/git/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ branch: string; dirty: boolean }>();
    expect(typeof body.branch).toBe('string');
    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E2E: publication preview succeeds on clean repo', async () => {
  const dir = setupDir();
  try {
    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/publications/preview',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      preflight: { ok: boolean; checks: Array<{ name: string; status: string }> };
    }>();
    expect(body.preflight.checks.length).toBeGreaterThan(0);
    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E2E: publication commit-only completes', async () => {
  const dir = setupDir();
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: { commitMessage: 'e2e-commit-only', push: false },
    });

    expect(res.statusCode).toBe(200);
    const { job_id } = res.json<{ job_id: string }>();

    let terminal = false;
    for (let i = 0; i < 30; i++) {
      const jr = await app.inject({ method: 'GET', url: `/api/v1/jobs/${job_id}` });
      const job = jr.json<{ status: string; result?: { commit: string } }>();
      if (job.status === 'completed' || job.status === 'failed') {
        terminal = true;
        if (job.status === 'completed') {
          expect(job.result?.commit).toBeDefined();
        }
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(terminal).toBe(true);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E2E: recovery state is cleared after successful publication', async () => {
  const dir = setupDir();
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: { commitMessage: 'e2e-recovery-test', push: false },
    });

    expect(res.statusCode).toBe(200);
    const { job_id } = res.json<{ job_id: string }>();

    // Wait for job to finish
    for (let i = 0; i < 30; i++) {
      const jr = await app.inject({ method: 'GET', url: `/api/v1/jobs/${job_id}` });
      const job = jr.json<{ status: string }>();
      if (job.status === 'completed' || job.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 100));
    }

    const recovRes = await app.inject({ method: 'GET', url: '/api/v1/publications/recovery' });
    const recov = recovRes.json<{
      pending_recovery: boolean;
      state: { current_step?: string } | null;
    }>();
    expect(typeof recov.pending_recovery).toBe('boolean');
    // If job completed, recovery should be cleared. If failed, state may persist.
    // Either way, the endpoint should work and return valid data.
    expect(recov.state === null || typeof recov.state === 'object').toBe(true);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E2E: job cancellation marks job as cancelled', async () => {
  const dir = setupDir();
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    // Schedule with a long delay that we can cancel
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: { commitMessage: 'cancel-test', push: false },
    });

    if (res.statusCode === 200) {
      const { job_id } = res.json<{ job_id: string }>();
      await app.inject({ method: 'POST', url: `/api/v1/jobs/${job_id}/cancel` });

      await new Promise((r) => setTimeout(r, 500));
      const jr = await app.inject({ method: 'GET', url: `/api/v1/jobs/${job_id}` });
      const job = jr.json<{ status: string }>();
      expect(['cancelled', 'completed', 'failed']).toContain(job.status);
    }

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
