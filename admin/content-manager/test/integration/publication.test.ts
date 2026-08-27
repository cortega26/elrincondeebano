import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import { GitAdapter } from '../../src/server/adapters/gitAdapter.ts';
import type { FastifyInstance } from 'fastify';

function credHeaders(app: FastifyInstance): Record<string, string> {
  const cred = (app as unknown as { launchCredential?: string }).launchCredential ?? '';
  return { [CREDENTIAL_HEADER]: cred };
}

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
    resolve(dir, 'data', 'categories.json'),
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
  writeFileSync(
    resolve(dir, 'astro-poc', 'src', 'data', 'storefront-bundles.json'),
    JSON.stringify({ bundles: [] })
  );
  mkdirSync(resolve(dir, 'assets', 'images'), { recursive: true });
  writeFileSync(resolve(dir, 'assets', 'images', '.gitkeep'), '');
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

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/publications/preview',
      payload: {},
      headers: { 'content-type': 'application/json', ...credHeaders(app) },
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
      headers: { 'content-type': 'application/json', ...credHeaders(app) },
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
      headers: { 'content-type': 'application/json', ...credHeaders(app) },
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
      headers: { 'content-type': 'application/json', ...credHeaders(app) },
    });

    const { job_id } = pubResponse.json<{ job_id: string }>();

    const cancelResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/jobs/${job_id}/cancel`,
      headers: credHeaders(app),
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

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/nonexistent/cancel',
      headers: credHeaders(app),
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/publications returns 405 when writes disabled', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: { commitMessage: 'test', push: false },
      headers: { 'content-type': 'application/json', ...credHeaders(app) },
    });

    expect(response.statusCode).toBe(405);

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

test('POST /api/v1/publications schedules a job without a request body', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      headers: credHeaders(app),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ job_id: string; status: string }>();
    expect(body.status).toBe('scheduled');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('publication fails when an unrelated file is already staged', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);
    writeFileSync(
      resolve(dir, 'data', 'product_data.json'),
      JSON.stringify({ version: 'test', last_updated: '', rev: 0, products: [] })
    );
    writeFileSync(resolve(dir, 'notes.txt'), 'scratch');
    execFileSync('git', ['add', 'notes.txt'], { cwd: dir, encoding: 'utf-8' });

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: { commitMessage: 'should fail', push: false },
      headers: { 'content-type': 'application/json', ...credHeaders(app) },
    });
    expect(response.statusCode).toBe(200);
    const { job_id } = response.json<{ job_id: string }>();

    let job;
    for (let i = 0; i < 50; i++) {
      const jr = await app.inject({ method: 'GET', url: `/api/v1/jobs/${job_id}` });
      job = jr.json<{ status: string; error?: string }>();
      if (job.status === 'completed' || job.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(job!.status).toBe('failed');
    expect(job!.error).toContain('Unrelated staged file: notes.txt');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('publication commit contains only owned paths', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);
    writeFileSync(
      resolve(dir, 'data', 'product_data.json'),
      JSON.stringify({ version: 'test', last_updated: '', rev: 0, products: [] })
    );
    writeFileSync(resolve(dir, 'notes.txt'), 'scratch');

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: { commitMessage: 'scoped commit', push: false },
      headers: { 'content-type': 'application/json', ...credHeaders(app) },
    });
    expect(response.statusCode).toBe(200);
    const { job_id } = response.json<{ job_id: string }>();

    let job;
    for (let i = 0; i < 50; i++) {
      const jr = await app.inject({ method: 'GET', url: `/api/v1/jobs/${job_id}` });
      job = jr.json<{ status: string; error?: string }>();
      if (job.status === 'completed' || job.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(job!.status).toBe('completed');

    const files = execFileSync('git', ['show', '--name-only', '--format=', 'HEAD'], {
      cwd: dir,
      encoding: 'utf-8',
    })
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    expect(files).toContain('data/product_data.json');
    expect(files).not.toContain('notes.txt');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gitAdapter.stage fails closed on an empty pathspec', async () => {
  const dir = createTempRepo();
  try {
    const git = new GitAdapter(dir);
    const result = await git.stage([]);

    expect(result.success).toBe(false);
    expect(result.error).toContain('at least one path');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gitAdapter.commitWithPaths commits only the given paths even when others are staged', async () => {
  const dir = createTempRepo();
  try {
    writeFileSync(resolve(dir, 'data', 'product_data.json'), '{"products":[]}');
    writeFileSync(resolve(dir, 'notes.txt'), 'scratch');
    execFileSync('git', ['add', '-A'], { cwd: dir, encoding: 'utf-8' });

    const git = new GitAdapter(dir);
    const result = await git.commitWithPaths(['data/product_data.json'], 'scoped');

    expect(result.success).toBe(true);

    const committed = execFileSync('git', ['show', '--name-only', '--format=', 'HEAD'], {
      cwd: dir,
      encoding: 'utf-8',
    })
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    expect(committed).toEqual(['data/product_data.json']);

    const remaining = execFileSync('git', ['status', '--porcelain'], {
      cwd: dir,
      encoding: 'utf-8',
    });
    expect(remaining).toContain('notes.txt');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gitAdapter.commitWithPaths with a directory path commits only that subtree', async () => {
  const dir = createTempRepo();
  try {
    mkdirSync(resolve(dir, 'assets', 'images'), { recursive: true });
    mkdirSync(resolve(dir, 'assets', 'images', 'nested'), { recursive: true });
    mkdirSync(resolve(dir, 'assets', 'other'), { recursive: true });
    writeFileSync(resolve(dir, 'assets', 'images', 'a.png'), 'a');
    writeFileSync(resolve(dir, 'assets', 'images', 'nested', 'b.png'), 'b');
    writeFileSync(resolve(dir, 'assets', 'other', 'c.png'), 'c');
    execFileSync('git', ['add', '-A'], { cwd: dir, encoding: 'utf-8' });

    const git = new GitAdapter(dir);
    const result = await git.commitWithPaths(['assets/images/'], 'scoped-dir');

    expect(result.success).toBe(true);

    const committed = execFileSync('git', ['show', '--name-only', '--format=', 'HEAD'], {
      cwd: dir,
      encoding: 'utf-8',
    })
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    expect(committed).toContain('assets/images/a.png');
    expect(committed).toContain('assets/images/nested/b.png');
    expect(committed).not.toContain('assets/other/c.png');

    const remaining = execFileSync('git', ['status', '--porcelain'], {
      cwd: dir,
      encoding: 'utf-8',
    });
    expect(remaining).toContain('c.png');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gitAdapter.commitWithPaths fails closed on an empty pathspec', async () => {
  const dir = createTempRepo();
  try {
    writeFileSync(resolve(dir, 'data', 'product_data.json'), '{"products":[]}');
    writeFileSync(resolve(dir, 'notes.txt'), 'scratch');
    execFileSync('git', ['add', '-A'], { cwd: dir, encoding: 'utf-8' });

    const git = new GitAdapter(dir);
    const result = await git.commitWithPaths([], 'scoped');

    expect(result.success).toBe(false);
    expect(result.error).toContain('at least one path');

    let logError: unknown = null;
    try {
      execFileSync('git', ['log', '--oneline'], { cwd: dir, encoding: 'utf-8' });
    } catch (err) {
      logError = err;
    }
    expect(logError).not.toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('publication with publishAt in the future schedules a pending job (plan 127 F3.1)', async () => {
  const dir = resolve(tmpdir(), `pub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'assets', 'images'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  setupData(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const future = new Date(Date.now() + 60_000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      headers: { 'content-type': 'application/json', ...credHeaders(app) },
      payload: { commitMessage: 'scheduled-test', publishAt: future },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ job_id: string; status: string }>();
    expect(body.status).toBe('scheduled');
    expect(body.job_id).toBeTruthy();

    // The job is still pending right away (not executed).
    const job = await app.inject({ method: 'GET', url: `/api/v1/jobs/${body.job_id}` });
    expect(job.json<{ status: string }>().status).toBe('pending');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('publication with a past publishAt is rejected (plan 127 F3.1)', async () => {
  const dir = resolve(tmpdir(), `pub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'assets', 'images'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  setupData(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const past = new Date(Date.now() - 5_000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      headers: { 'content-type': 'application/json', ...credHeaders(app) },
      payload: { commitMessage: 'x', publishAt: past },
    });
    expect(res.statusCode).toBe(422);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── plan 130 CORR-03: handled failure/cancellation clears the recovery journal ──

async function pollJob(
  app: FastifyInstance,
  jobId: string,
  attempts = 50
): Promise<{ status: string; progress?: number; error?: string }> {
  let job: { status: string; progress?: number; error?: string } = { status: 'pending' };
  for (let i = 0; i < attempts; i++) {
    const jr = await app.inject({ method: 'GET', url: `/api/v1/jobs/${jobId}` });
    job = jr.json<{ status: string; progress?: number; error?: string }>();
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return job;
}

async function pendingRecovery(app: FastifyInstance): Promise<boolean> {
  const res = await app.inject({ method: 'GET', url: '/api/v1/publications/recovery' });
  expect(res.statusCode).toBe(200);
  return res.json<{ pending_recovery: boolean }>().pending_recovery;
}

test('publication that fails preflight leaves no pending recovery (plan 130)', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);
    writeFileSync(resolve(dir, 'notes.txt'), 'scratch');
    execFileSync('git', ['add', 'notes.txt'], { cwd: dir, encoding: 'utf-8' });

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: { commitMessage: 'should fail', push: false },
      headers: { 'content-type': 'application/json', ...credHeaders(app) },
    });
    expect(response.statusCode).toBe(200);
    const { job_id } = response.json<{ job_id: string }>();

    const job = await pollJob(app, job_id);
    expect(job.status).toBe('failed');
    expect(job.error).toContain('Unrelated staged file: notes.txt');
    expect(await pendingRecovery(app)).toBe(false);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('publication that fails after the journal write clears recovery (plan 130)', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    // push: true with no remote configured fails at the push step, which runs
    // only after the recovery journal has been written (stage + commit steps).
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: { commitMessage: 'push fails', push: true },
      headers: { 'content-type': 'application/json', ...credHeaders(app) },
    });
    expect(response.statusCode).toBe(200);
    const { job_id } = response.json<{ job_id: string }>();

    const job = await pollJob(app, job_id);
    expect(job.status).toBe('failed');
    expect(job.error).toContain('Push failed');
    expect(await pendingRecovery(app)).toBe(false);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cancelling a scheduled publication before it runs leaves no pending recovery (plan 130)', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const future = new Date(Date.now() + 60_000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: { commitMessage: 'scheduled-cancel', publishAt: future },
      headers: { 'content-type': 'application/json', ...credHeaders(app) },
    });
    expect(res.statusCode).toBe(200);
    const { job_id } = res.json<{ job_id: string }>();

    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/v1/jobs/${job_id}/cancel`,
      headers: credHeaders(app),
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json<{ status: string }>().status).toBe('cancelled');

    expect(await pendingRecovery(app)).toBe(false);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cancelling a running publication clears recovery (plan 130)', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);
    // Slow the git stage step (the first step after the journal write) so the
    // cancellation lands mid-run, after recovery.save() has run.
    for (let i = 0; i < 1500; i++) {
      writeFileSync(resolve(dir, 'assets', 'images', `slow-${i}.bin`), 'x');
    }

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      payload: { commitMessage: 'cancel mid-run', push: false },
      headers: { 'content-type': 'application/json', ...credHeaders(app) },
    });
    expect(response.statusCode).toBe(200);
    const { job_id } = response.json<{ job_id: string }>();

    // Wait until the job is running and past the journal write (progress >= 30).
    let cancelled = false;
    for (let i = 0; i < 400; i++) {
      const jr = await app.inject({ method: 'GET', url: `/api/v1/jobs/${job_id}` });
      const job = jr.json<{ status: string; progress: number }>();
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled')
        break;
      if (job.progress >= 30) {
        const cancelRes = await app.inject({
          method: 'POST',
          url: `/api/v1/jobs/${job_id}/cancel`,
          headers: credHeaders(app),
        });
        cancelled = cancelRes.statusCode === 200;
        break;
      }
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(cancelled).toBe(true);

    const job = await pollJob(app, job_id, 200);
    expect(['cancelled', 'failed']).toContain(job.status);
    expect(await pendingRecovery(app)).toBe(false);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── plan 162: GET /jobs list + schedule/cancel flow ────────────────────────

test('GET /api/v1/jobs lists pending scheduled jobs (plan 162)', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const future = new Date(Date.now() + 60_000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      headers: { 'content-type': 'application/json', ...credHeaders(app) },
      payload: { commitMessage: 'scheduled-list', publishAt: future },
    });
    expect(res.statusCode).toBe(200);
    const { job_id } = res.json<{ job_id: string }>();

    const list = await app.inject({ method: 'GET', url: '/api/v1/jobs' });
    expect(list.statusCode).toBe(200);
    const body = list.json<{
      jobs: Array<{ id: string; status: string; scheduled_at?: string }>;
    }>();
    expect(Array.isArray(body.jobs)).toBe(true);
    const found = body.jobs.find((j) => j.id === job_id);
    expect(found).toBeDefined();
    expect(found!.status).toBe('pending');
    expect(found!.scheduled_at).toBeTruthy();

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/jobs returns empty when no pending jobs (plan 162)', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const list = await app.inject({ method: 'GET', url: '/api/v1/jobs' });
    expect(list.statusCode).toBe(200);
    const body = list.json<{ jobs: unknown[] }>();
    expect(body.jobs).toEqual([]);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cancel a scheduled pending job via POST /jobs/:id/cancel prevents it from firing (plan 162)', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const future = new Date(Date.now() + 60_000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      headers: { 'content-type': 'application/json', ...credHeaders(app) },
      payload: { commitMessage: 'cancel-pending', publishAt: future },
    });
    expect(res.statusCode).toBe(200);
    const { job_id } = res.json<{ job_id: string }>();

    // Verify it appears in the list as pending.
    const beforeCancel = await app.inject({ method: 'GET', url: '/api/v1/jobs' });
    expect(
      beforeCancel.json<{ jobs: Array<{ id: string }> }>().jobs.some((j) => j.id === job_id)
    ).toBe(true);

    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/v1/jobs/${job_id}/cancel`,
      headers: credHeaders(app),
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json<{ status: string }>().status).toBe('cancelled');

    const after = await app.inject({ method: 'GET', url: `/api/v1/jobs/${job_id}` });
    expect(after.json<{ status: string }>().status).toBe('cancelled');

    // Wait a bit — a cancelled timer must not promote the job to running.
    await new Promise((r) => setTimeout(r, 200));
    const later = await app.inject({ method: 'GET', url: `/api/v1/jobs/${job_id}` });
    expect(later.json<{ status: string }>().status).toBe('cancelled');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/jobs does not include completed jobs (minimal surface, plan 162)', async () => {
  const dir = createTempRepo();
  try {
    setupData(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    // Immediate publication completes quickly.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/publications',
      headers: { 'content-type': 'application/json', ...credHeaders(app) },
      payload: { commitMessage: 'immediate', push: false },
    });
    expect(res.statusCode).toBe(200);
    const { job_id } = res.json<{ job_id: string }>();

    // Wait until completed.
    let status = 'pending';
    for (let i = 0; i < 50; i++) {
      const jr = await app.inject({ method: 'GET', url: `/api/v1/jobs/${job_id}` });
      status = jr.json<{ status: string }>().status;
      if (status === 'completed' || status === 'failed' || status === 'cancelled') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(['completed', 'failed', 'cancelled']).toContain(status);

    const list = await app.inject({ method: 'GET', url: '/api/v1/jobs' });
    expect(list.statusCode).toBe(200);
    const body = list.json<{ jobs: Array<{ id: string }> }>();
    // Completed jobs are filtered out of the pending/running list.
    expect(body.jobs.some((j) => j.id === job_id)).toBe(false);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
