import { test, expect, vi } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import type { FastifyInstance } from 'fastify';

function credHeaders(app: FastifyInstance): Record<string, string> {
  const cred = (app as unknown as { launchCredential?: string }).launchCredential ?? '';
  return { [CREDENTIAL_HEADER]: cred };
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf-8' });
}

function setupData(dir: string): void {
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

// Creates a temp workspace: bare remote + app repo with all data committed
// and pushed (a clean tree is a precondition of the pull workflow).
function makeWorkspace(): { root: string; appDir: string; bareDir: string } {
  const root = resolve(tmpdir(), `cm-pull-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const bareDir = resolve(root, 'remote.git');
  const appDir = resolve(root, 'app');

  mkdirSync(bareDir, { recursive: true });
  git(bareDir, 'init', '--bare');

  mkdirSync(resolve(appDir, 'data'), { recursive: true });
  mkdirSync(resolve(appDir, 'astro-poc', 'src', 'data'), { recursive: true });
  setupData(appDir);
  git(appDir, 'init');
  git(appDir, 'config', 'user.email', 'test@test.com');
  git(appDir, 'config', 'user.name', 'Test');
  git(appDir, 'add', '-A');
  git(appDir, 'commit', '-m', 'init');
  git(appDir, 'remote', 'add', 'origin', bareDir);
  git(appDir, 'branch', '-M', 'main');
  git(appDir, 'push', '-u', 'origin', 'main');
  // The bare repo was created before the first push: pin HEAD to main so
  // clones (and the app's own pulls) resolve it.
  git(bareDir, 'symbolic-ref', 'HEAD', 'refs/heads/main');

  return { root, appDir, bareDir };
}

function pushRemoteCommit(bareDir: string, fileContent: string): string {
  const cloneDir = resolve(bareDir, '..', 'worker');
  mkdirSync(cloneDir, { recursive: true });
  const work = resolve(cloneDir, 'work');
  git(cloneDir, 'clone', bareDir, work);
  git(work, 'config', 'user.email', 'worker@test.com');
  git(work, 'config', 'user.name', 'Worker');
  writeFileSync(resolve(work, 'data', 'product_data.json'), fileContent);
  git(work, 'add', '-A');
  git(work, 'commit', '-m', 'remote change');
  git(work, 'push', 'origin', 'main');
  return work;
}

async function waitForJob(app: FastifyInstance, jobId: string): Promise<Record<string, unknown>> {
  let result: Record<string, unknown> | null = null;
  await vi.waitFor(
    async () => {
      const job = await app.inject({ method: 'GET', url: `/api/v1/jobs/${jobId}` });
      const body = job.json<{ status: string }>();
      if (body.status === 'completed' || body.status === 'failed' || body.status === 'cancelled') {
        result = job.json<Record<string, unknown>>();
      } else {
        throw new Error(`job not finished: ${body.status}`);
      }
    },
    { timeout: 8000, interval: 20 },
  );
  return result!;
}

test('git pull applies remote changes through the job runner', async () => {
  const { root, appDir, bareDir } = makeWorkspace();
  const remoteContent = JSON.stringify({
    version: 'remote-v2',
    last_updated: '',
    rev: 1,
    products: [{ name: 'Remote', price: 1, category: 'x' }],
  });
  pushRemoteCommit(bareDir, remoteContent);

  try {
    const app = createApp({ repoRoot: appDir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/git/pull',
      headers: credHeaders(app),
    });
    expect(res.statusCode).toBe(200);
    const { job_id } = res.json<{ job_id: string }>();

    const job = await waitForJob(app, job_id);
    expect(job.status).toBe('completed');
    const result = job.result as { success: boolean; output?: string };
    expect(result.success).toBe(true);

    // The app repo now contains the remote file content.
    const onDisk = JSON.parse(readFileSync(resolve(appDir, 'data', 'product_data.json'), 'utf8'));
    expect(onDisk.version).toBe('remote-v2');

    await app.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('git pull on an in-sync repo reports no-op', async () => {
  const { root, appDir } = makeWorkspace();
  try {
    const app = createApp({ repoRoot: appDir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/git/pull',
      headers: credHeaders(app),
    });
    const { job_id } = res.json<{ job_id: string }>();
    const job = await waitForJob(app, job_id);
    expect(job.status).toBe('completed');
    expect((job.result as { output?: string }).output ?? '').toMatch(/up to date|actualizado/i);

    await app.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('git pull refuses a dirty tree with 409', async () => {
  const { root, appDir } = makeWorkspace();
  try {
    writeFileSync(
      resolve(appDir, 'data', 'product_data.json'),
      JSON.stringify({ version: 'dirty', last_updated: '', rev: 0, products: [] })
    );

    const app = createApp({ repoRoot: appDir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/git/pull',
      headers: credHeaders(app),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('DIRTY_TREE');

    await app.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('git pull reports a rebase conflict with recovery guidance', async () => {
  const { root, appDir, bareDir } = makeWorkspace();
  try {
    // Local commit on the same file the remote will change.
    writeFileSync(
      resolve(appDir, 'data', 'product_data.json'),
      JSON.stringify({ version: 'local', last_updated: '', rev: 0, products: [] })
    );
    git(appDir, 'add', '-A');
    git(appDir, 'commit', '-m', 'local change');

    const remoteContent = JSON.stringify({
      version: 'remote-conflict',
      last_updated: '',
      rev: 0,
      products: [],
    });
    pushRemoteCommit(bareDir, remoteContent);

    const app = createApp({ repoRoot: appDir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/git/pull',
      headers: credHeaders(app),
    });
    const { job_id } = res.json<{ job_id: string }>();
    const job = await waitForJob(app, job_id);
    expect(job.status).toBe('completed');
    const result = job.result as { success: boolean; error?: string };
    expect(result.success).toBe(false);
    expect(result.error ?? '').toMatch(/conflict|CONFLICT|rebase/i);
    expect(result.error).toContain('rebase --abort');

    // Documented recovery path works.
    git(appDir, 'rebase', '--abort');

    await app.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('pull jobs are in-memory: after restart the job is gone and a fresh pull works', async () => {
  const { root, appDir, bareDir } = makeWorkspace();
  const remoteContent = JSON.stringify({
    version: 'remote-v3',
    last_updated: '',
    rev: 1,
    products: [],
  });
  pushRemoteCommit(bareDir, remoteContent);

  try {
    const app1 = createApp({ repoRoot: appDir, enableWrites: true, logger: false });
    await app1.ready();
    const res = await app1.inject({
      method: 'POST',
      url: '/api/v1/git/pull',
      headers: credHeaders(app1),
    });
    const { job_id } = res.json<{ job_id: string }>();
    await waitForJob(app1, job_id);
    await app1.close();

    // Restart: the job registry is gone; the repo has no partial state.
    const app2 = createApp({ repoRoot: appDir, enableWrites: true, logger: false });
    await app2.ready();
    const gone = await app2.inject({ method: 'GET', url: `/api/v1/jobs/${job_id}` });
    expect(gone.statusCode).toBe(404);

    const again = await app2.inject({
      method: 'POST',
      url: '/api/v1/git/pull',
      headers: credHeaders(app2),
    });
    expect(again.statusCode).toBe(200);
    const job = await waitForJob(app2, again.json<{ job_id: string }>().job_id);
    expect(job.status).toBe('completed');

    await app2.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
