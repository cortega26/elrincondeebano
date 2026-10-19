// Plan 248 (adopting the plan-212 design record): durable scheduled
// publication — the restart round-trip is the plan's reason to exist and this
// suite is PERMANENT. It drives the real boot path (createApp over an
// existing temp repo) with the injectable clock, and asserts exactly-once
// publication across restarts, the overdue fire-late/stale-skip policy,
// cancel-before-due, and crash-mid-fire resolution.
import { test, expect, vi } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import {
  ScheduledPublications,
  newScheduledPublicationJobId,
} from '../../src/server/services/scheduledPublications.ts';
import { PersistentIdempotencyStore } from '../../src/server/services/persistentIdempotencyStore.ts';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import type { JobClock } from '../../src/server/services/jobRunner.ts';
import type { FastifyInstance } from 'fastify';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HOUR_MS = 3_600_000;

interface Entry {
  job_id: string;
  commit_message: string;
  publish_at: string;
  status: string;
  late?: boolean;
  commit_sha?: string;
  claim?: { token: string; claimed_at: string };
  error?: string;
}

function credHeaders(app: FastifyInstance): Record<string, string> {
  const cred = (app as unknown as { launchCredential?: string }).launchCredential ?? '';
  return { [CREDENTIAL_HEADER]: cred };
}

function createTempRepo(): string {
  const dir = resolve(tmpdir(), `cm-durable-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'assets', 'images'), { recursive: true });

  execFileSync('git', ['init'], { cwd: dir, encoding: 'utf-8' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, encoding: 'utf-8' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, encoding: 'utf-8' });

  writeFileSync(
    resolve(dir, 'data', 'product_data.json'),
    JSON.stringify({ version: 'test', last_updated: '', rev: 0, products: [] })
  );
  writeFileSync(
    resolve(dir, 'data', 'category_registry.json'),
    JSON.stringify({ nav_groups: [], categories: [] })
  );
  writeFileSync(
    resolve(dir, 'data', 'categories.json'),
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
  writeFileSync(
    resolve(dir, 'astro-poc', 'src', 'data', 'storefront-bundles.json'),
    JSON.stringify({ bundles: [] })
  );
  writeFileSync(resolve(dir, 'assets', 'images', '.gitkeep'), '');
  return dir;
}

// Manual clock (same shape as the jobRunner contract test): `advance()` runs
// every due timer synchronously, so a "restart" is close-app → advance →
// createApp on the same repo root with the same clock.
function manualClock(startMs: number): { clock: JobClock; advance: (ms: number) => void } {
  let now = startMs;
  const timers: Array<{ at: number; cb: () => void }> = [];
  const clock: JobClock = {
    now: () => now,
    schedule: (cb, ms) => {
      const timer = { at: now + ms, cb };
      timers.push(timer);
      return timer;
    },
    clear: (handle) => {
      const index = timers.indexOf(handle as { at: number; cb: () => void });
      if (index >= 0) timers.splice(index, 1);
    },
  };
  return {
    clock,
    advance: (ms) => {
      now += ms;
      for (const timer of [...timers]) {
        if (timer.at <= now) {
          timers.splice(timers.indexOf(timer), 1);
          timer.cb();
        }
      }
    },
  };
}

function readEntries(dir: string): Entry[] {
  const path = resolve(dir, 'data', 'scheduled-publications.json');
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { entries: Entry[] };
  return parsed.entries;
}

function entryOf(dir: string, jobId: string): Entry | undefined {
  return readEntries(dir).find((entry) => entry.job_id === jobId);
}

function commitSubjects(dir: string): string[] {
  try {
    return execFileSync('git', ['log', '--format=%s'], { cwd: dir, encoding: 'utf-8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    // Fresh repo with no commits yet.
    return [];
  }
}

function publicationCommits(dir: string, message: string): string[] {
  return commitSubjects(dir).filter((subject) => subject === message);
}

async function schedulePublication(
  app: FastifyInstance,
  payload: { commitMessage: string; publishAt: string }
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/publications',
    headers: { 'content-type': 'application/json', ...credHeaders(app) },
    payload: { ...payload, push: false },
  });
  expect(res.statusCode).toBe(200);
  return res.json<{ job_id: string }>().job_id;
}

test(
  'restart round-trip: a due schedule fires exactly once (fire-late ≤ 24 h) and a second boot does not re-fire (plan 248)',
  async () => {
    const dir = createTempRepo();
    try {
      const { clock, advance } = manualClock(Date.now());
      const app1 = createApp({ repoRoot: dir, enableWrites: true, logger: false, clock });
      await app1.ready();

      const publishAt = new Date(clock.now() + HOUR_MS).toISOString();
      const jobId = await schedulePublication(app1, {
        commitMessage: 'durable-restart',
        publishAt,
      });

      // Durable intent exists before the timer is armed; nothing fired yet.
      expect(entryOf(dir, jobId)?.status).toBe('pending');
      expect(publicationCommits(dir, 'durable-restart')).toHaveLength(0);

      // Restart BEFORE the due time: shutdown clears the in-memory timer, the
      // outbox survives. The clock jumps past due (+1 h of downtime → 2 h overdue).
      await app1.close();
      advance(2 * HOUR_MS);

      const app2 = createApp({ repoRoot: dir, enableWrites: true, logger: false, clock });
      await app2.ready(); // boot recovery fires and completes the publication

      const fired = entryOf(dir, jobId);
      expect(fired?.status).toBe('completed');
      expect(fired?.late).toBe(true);
      expect(fired?.claim?.token).toBeTruthy();
      expect(publicationCommits(dir, 'durable-restart')).toHaveLength(1);

      // The endpoint surfaces the recovered (late) publication, server-computed.
      const list = await app2.inject({ method: 'GET', url: '/api/v1/jobs' });
      const body = list.json<{
        recovered: Array<{ job_id: string }>;
        missed: Array<{ job_id: string }>;
      }>();
      expect(body.recovered.map((entry) => entry.job_id)).toContain(jobId);
      expect(body.missed).toEqual([]);

      // Second boot after completion: the entry is terminal, nothing re-fires.
      await app2.close();
      const app3 = createApp({ repoRoot: dir, enableWrites: true, logger: false, clock });
      await app3.ready();
      expect(publicationCommits(dir, 'durable-restart')).toHaveLength(1);
      expect(entryOf(dir, jobId)?.status).toBe('completed');
      await app3.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  20_000
);

test(
  'stale skip: a schedule overdue by more than 24 h is NOT fired and is surfaced as missed (plan 248)',
  async () => {
    const dir = createTempRepo();
    try {
      const { clock, advance } = manualClock(Date.now());
      const app1 = createApp({ repoRoot: dir, enableWrites: true, logger: false, clock });
      await app1.ready();

      const publishAt = new Date(clock.now() + HOUR_MS).toISOString();
      const jobId = await schedulePublication(app1, { commitMessage: 'stale-skip', publishAt });
      await app1.close();

      // +48 h downtime → 47 h overdue, beyond FIRE_LATE_MAX_HOURS.
      advance(48 * HOUR_MS);

      const app2 = createApp({ repoRoot: dir, enableWrites: true, logger: false, clock });
      await app2.ready();

      const entry = entryOf(dir, jobId);
      expect(entry?.status).toBe('failed');
      expect(entry?.error).toContain('recovered_overdue');
      expect(publicationCommits(dir, 'stale-skip')).toHaveLength(0);

      const list = await app2.inject({ method: 'GET', url: '/api/v1/jobs' });
      const body = list.json<{
        recovered: Array<{ job_id: string }>;
        missed: Array<{ job_id: string; error?: string }>;
      }>();
      const missed = body.missed.find((item) => item.job_id === jobId);
      expect(missed).toBeDefined();
      expect(missed?.error).toContain('recovered_overdue');
      expect(body.recovered).toEqual([]);
      await app2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  20_000
);

test(
  'cancel before due: the durable intent is dropped and never fires after a restart (plan 248)',
  async () => {
    const dir = createTempRepo();
    try {
      const { clock, advance } = manualClock(Date.now());
      const app1 = createApp({ repoRoot: dir, enableWrites: true, logger: false, clock });
      await app1.ready();

      const publishAt = new Date(clock.now() + HOUR_MS).toISOString();
      const jobId = await schedulePublication(app1, { commitMessage: 'cancel-before-due', publishAt });

      const cancel = await app1.inject({
        method: 'POST',
        url: `/api/v1/jobs/${jobId}/cancel`,
        headers: credHeaders(app1),
      });
      expect(cancel.statusCode).toBe(200);
      expect(cancel.json<{ status: string }>().status).toBe('cancelled');
      expect(entryOf(dir, jobId)).toBeUndefined();

      await app1.close();
      advance(2 * HOUR_MS);

      const app2 = createApp({ repoRoot: dir, enableWrites: true, logger: false, clock });
      await app2.ready();
      expect(publicationCommits(dir, 'cancel-before-due')).toHaveLength(0);

      const list = await app2.inject({ method: 'GET', url: '/api/v1/jobs' });
      const body = list.json<{
        recovered: unknown[];
        missed: unknown[];
      }>();
      expect(body.recovered).toEqual([]);
      expect(body.missed).toEqual([]);
      await app2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  20_000
);

test(
  'future pending entry re-arms after a restart under the SAME job id and fires when due without a late flag (plan 248)',
  async () => {
    const dir = createTempRepo();
    try {
      const { clock, advance } = manualClock(Date.now());
      const app1 = createApp({ repoRoot: dir, enableWrites: true, logger: false, clock });
      await app1.ready();

      const publishAt = new Date(clock.now() + HOUR_MS).toISOString();
      const jobId = await schedulePublication(app1, { commitMessage: 'rearm-me', publishAt });
      await app1.close();

      // Restart BEFORE due: boot re-arms the in-memory timer with the outbox id.
      const app2 = createApp({ repoRoot: dir, enableWrites: true, logger: false, clock });
      await app2.ready();

      const list = await app2.inject({ method: 'GET', url: '/api/v1/jobs' });
      const jobs = list.json<{ jobs: Array<{ id: string; status: string }> }>().jobs;
      const rearmed = jobs.find((job) => job.id === jobId);
      expect(rearmed).toBeDefined();
      expect(rearmed?.status).toBe('pending');
      expect(entryOf(dir, jobId)?.status).toBe('pending');

      // Due time arrives with the app running: the re-armed timer fires.
      advance(HOUR_MS);
      await vi.waitFor(
        () => {
          expect(entryOf(dir, jobId)?.status).toBe('completed');
        },
        { timeout: 10_000, interval: 50 }
      );
      const entry = entryOf(dir, jobId);
      expect(entry?.late).toBe(false);
      expect(publicationCommits(dir, 'rearm-me')).toHaveLength(1);

      // On-time publication is not a "recovered late" notice.
      const after = await app2.inject({ method: 'GET', url: '/api/v1/jobs' });
      expect(after.json<{ recovered: unknown[] }>().recovered).toEqual([]);
      await app2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  20_000
);

test(
  'crash mid-fire with the recorded commit SHA in the git log resolves to completed without re-firing (plan 248)',
  async () => {
    const dir = createTempRepo();
    try {
      // A publication commit already landed before the crash.
      execFileSync('git', ['add', '-A'], { cwd: dir, encoding: 'utf-8' });
      execFileSync('git', ['commit', '-m', 'landed-before-crash'], { cwd: dir, encoding: 'utf-8' });
      const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: dir,
        encoding: 'utf-8',
      }).trim();
      const commitsBefore = commitSubjects(dir).length;

      // Simulate the crash: claim written, SHA recorded, process died before complete().
      const outbox = new ScheduledPublications(dir);
      const jobId = newScheduledPublicationJobId();
      outbox.upsertPending({
        job_id: jobId,
        commit_message: 'landed-before-crash',
        push: false,
        publish_at: new Date(Date.now() - 60_000),
      });
      outbox.claim(jobId, new Date());
      outbox.recordCommit(jobId, sha);

      const { clock } = manualClock(Date.now());
      const app = createApp({ repoRoot: dir, enableWrites: true, logger: false, clock });
      await app.ready();

      const entry = entryOf(dir, jobId);
      expect(entry?.status).toBe('completed');
      expect(entry?.commit_sha).toBe(sha);
      // Exactly-once: boot recovery must NOT run the publication again.
      expect(commitSubjects(dir).length).toBe(commitsBefore);
      await app.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  20_000
);

test(
  'crash mid-fire with the persistent idempotency marker resolves to completed without re-firing (plan 248)',
  async () => {
    const dir = createTempRepo();
    try {
      const commitsBefore = commitSubjects(dir).length;

      // The marker the fire flow writes the moment the commit lands.
      const jobId = newScheduledPublicationJobId();
      const idempotency = new PersistentIdempotencyStore(dir, 200);
      idempotency.set(jobId, { command_id: jobId, status: 'ok' });

      const outbox = new ScheduledPublications(dir);
      outbox.upsertPending({
        job_id: jobId,
        commit_message: 'marker-before-crash',
        push: false,
        publish_at: new Date(Date.now() - 60_000),
      });
      outbox.claim(jobId, new Date());

      const { clock } = manualClock(Date.now());
      const app = createApp({ repoRoot: dir, enableWrites: true, logger: false, clock });
      await app.ready();

      expect(entryOf(dir, jobId)?.status).toBe('completed');
      expect(commitSubjects(dir).length).toBe(commitsBefore);
      await app.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  20_000
);

test(
  'crash mid-fire without commit evidence is marked failed for the operator, never re-fired (plan 248)',
  async () => {
    const dir = createTempRepo();
    try {
      const commitsBefore = commitSubjects(dir).length;

      const outbox = new ScheduledPublications(dir);
      const jobId = newScheduledPublicationJobId();
      outbox.upsertPending({
        job_id: jobId,
        commit_message: 'no-evidence-crash',
        push: false,
        publish_at: new Date(Date.now() - 60_000),
      });
      outbox.claim(jobId, new Date());

      const { clock } = manualClock(Date.now());
      const app = createApp({ repoRoot: dir, enableWrites: true, logger: false, clock });
      await app.ready();

      const entry = entryOf(dir, jobId);
      expect(entry?.status).toBe('failed');
      expect(entry?.error).toContain('crash_mid_publication');
      expect(commitSubjects(dir).length).toBe(commitsBefore);

      const list = await app.inject({ method: 'GET', url: '/api/v1/jobs' });
      expect(
        list
          .json<{ missed: Array<{ job_id: string }> }>()
          .missed.map((item) => item.job_id)
      ).toContain(jobId);
      await app.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  20_000
);

test(
  'read-only boots never fire due publications — the durable entry waits for operator mode (plan 248)',
  async () => {
    const dir = createTempRepo();
    try {
      const { clock } = manualClock(Date.now());
      const outbox = new ScheduledPublications(dir);
      const jobId = newScheduledPublicationJobId();
      outbox.upsertPending({
        job_id: jobId,
        commit_message: 'read-only-wait',
        push: false,
        publish_at: new Date(clock.now() - 60_000),
      });

      const app = createApp({ repoRoot: dir, enableWrites: false, logger: false, clock });
      await app.ready();
      expect(entryOf(dir, jobId)?.status).toBe('pending');
      expect(publicationCommits(dir, 'read-only-wait')).toHaveLength(0);
      await app.close();

      // Operator-mode boot then recovers it (still within the 24 h window).
      const app2 = createApp({ repoRoot: dir, enableWrites: true, logger: false, clock });
      await app2.ready();
      expect(entryOf(dir, jobId)?.status).toBe('completed');
      expect(publicationCommits(dir, 'read-only-wait')).toHaveLength(1);
      await app2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  20_000
);
