// Plan 248: contract tests for the durable scheduled-publication outbox.
import { test, expect } from 'vitest';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  FIRE_LATE_MAX_HOURS,
  ScheduledPublications,
  classifyOverdue,
  newScheduledPublicationJobId,
} from '../../src/server/services/scheduledPublications.ts';

function createTempDir(): string {
  const dir = resolve(tmpdir(), `cm-outbox-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  return dir;
}

function outboxPath(dir: string): string {
  return resolve(dir, 'data', 'scheduled-publications.json');
}

const T0 = Date.parse('2026-10-18T12:00:00.000Z');

function schedule(store: ScheduledPublications, id: string, publishAt: Date): void {
  store.upsertPending({ job_id: id, commit_message: `publicar ${id}`, push: false, publish_at: publishAt });
}

test('upsertPending persists a pending entry with wall-clock ISO publish_at', () => {
  const dir = createTempDir();
  try {
    const store = new ScheduledPublications(dir);
    expect(store.list()).toEqual([]);

    const publishAt = new Date(T0 + 3_600_000);
    const entry = store.upsertPending({
      job_id: 'job-1',
      commit_message: 'catálogo',
      push: true,
      publish_at: publishAt,
    });

    expect(entry.status).toBe('pending');
    expect(entry.publish_at).toBe(publishAt.toISOString());
    expect(entry.commit_message).toBe('catálogo');
    expect(entry.push).toBe(true);

    // Durable: a fresh store instance over the same repo root sees the entry.
    const reloaded = new ScheduledPublications(dir).get('job-1');
    expect(reloaded?.publish_at).toBe(publishAt.toISOString());
    expect(reloaded?.status).toBe('pending');

    const raw = JSON.parse(readFileSync(outboxPath(dir), 'utf-8')) as {
      entries: Array<{ job_id: string }>;
    };
    expect(raw.entries.map((e) => e.job_id)).toEqual(['job-1']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('returned entries are copies — callers cannot mutate the store by reference', () => {
  const dir = createTempDir();
  try {
    const store = new ScheduledPublications(dir);
    schedule(store, 'job-copy', new Date(T0 + 1000));

    const first = store.get('job-copy');
    expect(first).toBeDefined();
    first!.status = 'failed';
    first!.commit_message = 'mutated in memory';

    const second = store.get('job-copy');
    expect(second?.status).toBe('pending');
    expect(second?.commit_message).toBe('publicar job-copy');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('claimDue claims only pending entries that are due, writing the claim before firing', () => {
  const dir = createTempDir();
  try {
    const store = new ScheduledPublications(dir);
    schedule(store, 'job-past', new Date(T0 - 1000));
    schedule(store, 'job-now', new Date(T0));
    schedule(store, 'job-future', new Date(T0 + 60_000));

    const claimed = store.claimDue(new Date(T0));
    expect(claimed.map((e) => e.job_id).sort()).toEqual(['job-now', 'job-past']);

    const claim = store.get('job-past')?.claim;
    expect(store.get('job-past')?.status).toBe('firing');
    expect(claim?.token).toBeTruthy();
    expect(claim?.claimed_at).toBeTruthy();
    // Distinct claims per entry.
    expect(store.get('job-now')?.claim?.token).not.toBe(claim?.token);

    // The future entry stays pending and is not claimed by a later sweep at the same time.
    expect(store.get('job-future')?.status).toBe('pending');
    expect(store.claimDue(new Date(T0))).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('claim refuses unknown, non-pending and not-yet-due entries', () => {
  const dir = createTempDir();
  try {
    const store = new ScheduledPublications(dir);
    expect(store.claim('missing', new Date(T0))).toBeUndefined();

    schedule(store, 'job-future', new Date(T0 + 60_000));
    expect(store.claim('job-future', new Date(T0))).toBeUndefined();
    expect(store.get('job-future')?.status).toBe('pending');

    schedule(store, 'job-x', new Date(T0));
    expect(store.claim('job-x', new Date(T0))?.status).toBe('firing');
    // Already firing — not claimable twice.
    expect(store.claim('job-x', new Date(T0))).toBeUndefined();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('recordCommit keeps the firing status and persists the SHA (crash evidence)', () => {
  const dir = createTempDir();
  try {
    const store = new ScheduledPublications(dir);
    schedule(store, 'job-sha', new Date(T0));
    store.claim('job-sha', new Date(T0));

    expect(store.recordCommit('job-sha', 'abc1234')).toBe(true);
    const entry = new ScheduledPublications(dir).get('job-sha');
    expect(entry?.status).toBe('firing');
    expect(entry?.commit_sha).toBe('abc1234');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('complete and fail write terminal states', () => {
  const dir = createTempDir();
  try {
    const store = new ScheduledPublications(dir);
    schedule(store, 'job-ok', new Date(T0));
    schedule(store, 'job-bad', new Date(T0));
    store.claim('job-ok', new Date(T0));
    store.claim('job-bad', new Date(T0));

    expect(store.complete('job-ok', { late: true, commit_sha: 'deadbee' })).toBe(true);
    const done = store.get('job-ok');
    expect(done?.status).toBe('completed');
    expect(done?.late).toBe(true);
    expect(done?.commit_sha).toBe('deadbee');
    expect(done?.fired_at).toBeTruthy();

    expect(store.fail('job-bad', 'recovered_overdue: >24h')).toBe(true);
    const failed = store.get('job-bad');
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toContain('recovered_overdue');

    // Unknown id: no write, no throw.
    expect(store.complete('missing')).toBe(false);
    expect(store.fail('missing', 'x')).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('remove drops the durable intent (cancel/reschedule)', () => {
  const dir = createTempDir();
  try {
    const store = new ScheduledPublications(dir);
    schedule(store, 'job-cancel', new Date(T0 + 60_000));

    expect(store.remove('job-cancel')).toBe(true);
    expect(store.list()).toEqual([]);
    expect(store.remove('job-cancel')).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writes are atomic and leave no tmp/backup residue', () => {
  const dir = createTempDir();
  try {
    const store = new ScheduledPublications(dir);
    schedule(store, 'job-atomic', new Date(T0));
    store.claim('job-atomic', new Date(T0));
    store.complete('job-atomic');

    const leftovers = readdirSync(resolve(dir, 'data')).filter(
      (name) => name.includes('scheduled-publications') && name !== 'scheduled-publications.json'
    );
    expect(leftovers).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a corrupt store fails loudly instead of silently dropping schedules', () => {
  const dir = createTempDir();
  try {
    writeFileSync(outboxPath(dir), '{not json');
    const store = new ScheduledPublications(dir);
    expect(() => store.list()).toThrow(/Corrupt scheduled-publications store/);

    // Wrong shape (no entries array) is corrupt too.
    writeFileSync(outboxPath(dir), JSON.stringify({ version: 1 }));
    expect(() => store.list()).toThrow(/Corrupt scheduled-publications store/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('classifyOverdue implements fire-late <= 24 h, skip beyond', () => {
  const publishAt = new Date(T0).toISOString();

  const fresh = classifyOverdue(publishAt, T0 + 5);
  expect(fresh.action).toBe('fire');
  expect(fresh.late).toBe(false);

  const late = classifyOverdue(publishAt, T0 + 2 * 3_600_000);
  expect(late.action).toBe('fire');
  expect(late.late).toBe(true);

  // Boundary: exactly FIRE_LATE_MAX_HOURS still fires (policy is "overdue > 24h → skip").
  const boundary = classifyOverdue(publishAt, T0 + FIRE_LATE_MAX_HOURS * 3_600_000);
  expect(boundary.action).toBe('fire');

  const stale = classifyOverdue(publishAt, T0 + (FIRE_LATE_MAX_HOURS + 1) * 3_600_000);
  expect(stale.action).toBe('skip');
});

test('newScheduledPublicationJobId keeps the JobRunner id shape', () => {
  const id = newScheduledPublicationJobId();
  expect(id).toMatch(/^job-\d+-[0-9a-f]{6}$/);
  expect(newScheduledPublicationJobId()).not.toBe(id);
});
