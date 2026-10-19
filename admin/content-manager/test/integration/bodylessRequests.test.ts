// Plan 253: bodyless POSTs through the shared fetch core must not claim a
// JSON body.
//
// fetchCore used to attach `Content-Type: application/json` to every request;
// Fastify answers a bodyless JSON POST with 400 FST_ERR_CTP_EMPTY_JSON_BODY
// before any handler runs — so `client.prunePreview()` (history prune preview)
// and `client.gitPull()` (pull action) silently 400'd. These tests pin both
// typed-client paths against a real server on a temp repo.
import { test, expect, beforeAll, afterAll, vi } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { ContentManagerClient } from '../../src/web/api/client.ts';
import { setCredential, resetCredential } from '../../src/web/app/credentialStore.ts';

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf-8' });
}

let root: string;
let app: FastifyInstance;
let client: ContentManagerClient;
let baseUrl: string;

beforeAll(async () => {
  root = resolve(tmpdir(), `cm-bodyless-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const bareDir = resolve(root, 'remote.git');
  const repoDir = resolve(root, 'app');

  // Bare origin + committed-and-pushed app repo: the git-pull leg needs a
  // clean tree (untracked files would answer 409 DIRTY_TREE before the bug
  // under test) and a pull that is a true no-op.
  mkdirSync(bareDir, { recursive: true });
  git(bareDir, 'init', '--bare');

  mkdirSync(resolve(repoDir, 'data'), { recursive: true });
  writeFileSync(
    resolve(repoDir, 'data', 'product_data.json'),
    JSON.stringify({ version: 'test', last_updated: '', rev: 0, products: [] })
  );
  writeFileSync(
    resolve(repoDir, 'data', 'category_registry.json'),
    JSON.stringify({ nav_groups: [], categories: [] })
  );

  git(repoDir, 'init');
  git(repoDir, 'config', 'user.email', 'bodyless@test.com');
  git(repoDir, 'config', 'user.name', 'Bodyless');
  git(repoDir, 'add', '-A');
  git(repoDir, 'commit', '-m', 'init');
  git(repoDir, 'remote', 'add', 'origin', bareDir);
  git(repoDir, 'branch', '-M', 'main');
  git(repoDir, 'push', '-u', 'origin', 'main');
  // Pin HEAD on the bare repo so the app's own pulls resolve the branch.
  git(bareDir, 'symbolic-ref', 'HEAD', 'refs/heads/main');

  app = createApp({ repoRoot: repoDir, enableWrites: true, logger: false });
  await app.ready();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  baseUrl = typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : '';

  const credential = (app as unknown as { launchCredential?: string }).launchCredential ?? '';
  setCredential(credential);
  client = new ContentManagerClient(baseUrl);
});

afterAll(async () => {
  resetCredential();
  await app.close();
  rmSync(root, { recursive: true, force: true });
});

// Fail with the content-type cause surfaced: when the typed client rejects,
// re-issue the same bodyless POST with and without an explicit JSON
// content-type and include both answers. Pre-fix the JSON variant is a 400 —
// Fastify's FST_ERR_CTP_EMPTY_JSON_BODY, masked by the central error handler
// (app.ts) as `NOT_FOUND`/`Not found` with status 400 — while the variant
// without the header reaches the handler. Plan 261 unmasked the envelope, so
// the JSON variant now carries Fastify's real code (see the direct probe
// below).
async function throughClient<T>(endpoint: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    const withJson = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const without = await fetch(`${baseUrl}${endpoint}`, { method: 'POST' });
    const withJsonBody = (await withJson.text()).slice(0, 160);
    throw new Error(
      `${endpoint} rejected through the typed client: ${(err as Error).message} — ` +
        `repro with JSON content-type + empty body: HTTP ${withJson.status} ${withJsonBody}; ` +
        `same request without that header: HTTP ${without.status}`,
      { cause: err }
    );
  }
}

test('client.prunePreview: bodyless POST reaches the handler (plan 253)', async () => {
  const result = await throughClient('/api/v1/backup/prune-preview', () => client.prunePreview());

  // Fresh temp repo: nothing is prunable — the response shape is the proof
  // the handler ran (pre-fix the request 400'd before reaching it).
  expect(result).toEqual({ prunable: [] });
});

test('client.gitPull: bodyless POST schedules a real no-op pull (plan 253)', async () => {
  const scheduled = await throughClient('/api/v1/git/pull', () => client.gitPull());
  expect(scheduled.status).toBe('scheduled');
  expect(scheduled.job_id).toBeTruthy();

  // The repo is in sync with its bare origin, so the scheduled pull must
  // finish as a successful no-op.
  await vi.waitFor(
    async () => {
      const job = await client.getJob(scheduled.job_id);
      if (job.status !== 'completed' && job.status !== 'failed') {
        throw new Error(`pull job not finished: ${job.status}`);
      }
      expect(job.status).toBe('completed');
      expect((job.result as { success?: boolean } | undefined)?.success).toBe(true);
    },
    { timeout: 8000, interval: 20 }
  );
});

// Plan 261: raw request (no typed client), bodyless POST declaring a JSON
// content-type — Fastify answers 400 before any handler runs and the central
// envelope must preserve its real code instead of masking it as `NOT_FOUND`.
test('raw bodyless JSON POST: the 400 carries the real Fastify code (plan 261)', async () => {
  const res = await fetch(`${baseUrl}/api/v1/backup/prune-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { code: string; message: string } };
  expect(body.error.code).toBe('FST_ERR_CTP_EMPTY_JSON_BODY');
  expect(body.error.code).not.toBe('NOT_FOUND');
  expect(body.error.message.toLowerCase()).toContain('empty');
});
