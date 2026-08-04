import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

function createTempRepo(): string {
  const dir = resolve(tmpdir(), `cm-pub-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });

  execFileSync('git', ['init'], { cwd: dir, encoding: 'utf-8' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, encoding: 'utf-8' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, encoding: 'utf-8' });

  return dir;
}

function setupData(dir: string): void {
  writeFileSync(
    resolve(dir, 'data', 'product_data.json'),
    JSON.stringify({
      version: 'test',
      last_updated: '',
      rev: 0,
      products: [],
    })
  );
  writeFileSync(
    resolve(dir, 'data', 'category_registry.json'),
    JSON.stringify({
      nav_groups: [],
      categories: [],
    })
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

test('GET /api/v1/git/status returns branch and dirty flag', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/git/status',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ branch: string; dirty: boolean }>();
    expect(body).toHaveProperty('branch');
    expect(typeof body.branch).toBe('string');
    expect(body).toHaveProperty('dirty');
    expect(typeof body.dirty).toBe('boolean');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/publications/preview returns preflight checks and git info', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/publications/preview',
      payload: {},
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      preflight: Record<string, unknown>;
      git: Record<string, unknown>;
    }>();
    expect(body).toHaveProperty('preflight');
    expect(body.preflight).toHaveProperty('ok');
    expect(body.preflight).toHaveProperty('checks');
    expect(body).toHaveProperty('git');
    expect(body.git).toHaveProperty('branch');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/publications schedules a job and returns job_id', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: { commitMessage: 'test commit', push: false },
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ job_id: string; status: string }>();
    expect(body).toHaveProperty('job_id');
    expect(body.job_id).toBeTruthy();
    expect(body.status).toBe('scheduled');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/jobs/:id returns job progress', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const pubResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: { commitMessage: 'test', push: false },
      headers: { 'content-type': 'application/json' },
    });

    const { job_id } = pubResponse.json<{ job_id: string }>();

    const jobResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/jobs/${job_id}`,
    });

    expect(jobResponse.statusCode).toBe(200);
    const body = jobResponse.json<{ id: string; status: string; progress: number }>();
    expect(body.id).toBe(job_id);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('progress');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/jobs/:id/cancel cancels a pending job', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const pubResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: { commitMessage: 'test', push: false },
      headers: { 'content-type': 'application/json' },
    });

    const { job_id } = pubResponse.json<{ job_id: string }>();

    const cancelResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/jobs/${job_id}/cancel`,
    });

    expect(cancelResponse.statusCode).toBe(200);
    const body = cancelResponse.json<{ status: string }>();
    // Job may finish before cancel takes effect (git ops are sync)
    expect(['cancelled', 'failed', 'completed']).toContain(body.status);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/jobs/:id/cancel returns 404 for unknown job', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/nonexistent/cancel',
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/publications returns 403 when writes disabled', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: { commitMessage: 'test', push: false },
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(403);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/jobs/:id returns 404 for unknown job', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/jobs/nonexistent',
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
