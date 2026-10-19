// Plan 248 (adopts the archived plan-212 design record): durable outbox for
// scheduled publications.
//
// Scheduled publications used to live in JobRunner's in-memory Map+setTimeout
// only, so a restart silently dropped them (PublicationPage even said so).
// This store is the small durable companion the spike designed:
//   - `data/scheduled-publications.json` (gitignored, runtime state like
//     `data/.comms/`), written atomically via writeJsonFileAtomic — NOT the
//     recovery journal, whose operation/targetFile key does not fit schedules;
//   - one entry per scheduled publication carrying the wall-clock ISO
//     `publish_at` (timers never survive a restart, so wall time is the
//     schedule of record);
//   - a claim (status `firing` + token) is persisted BEFORE the publication
//     fires, so a crash mid-fire leaves evidence instead of ambiguity;
//   - `recordCommit` durably records the commit SHA the moment it lands
//     (design-record idempotency binding) — boot recovery uses it, plus the
//     persistent idempotency store keyed by job_id, to resolve a crashed
//     `firing` entry without ever double-publishing;
//   - overdue policy: fire late up to FIRE_LATE_MAX_HOURS (operator notice),
//     stale beyond it (mark `failed` + `recovered_overdue`, never fire).
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { writeJsonFileAtomic } from './atomicFileWriter.ts';

/** A publication overdue by at most this many hours still fires ("publicado tarde"). */
export const FIRE_LATE_MAX_HOURS = 24;

/**
 * Below this much lateness there is no notice: a timer scheduled for `T`
 * fires at `T` plus scheduler jitter (milliseconds), not "late".
 */
export const LATE_NOTICE_TOLERANCE_MS = 60_000;

const HOUR_MS = 3_600_000;

export type ScheduledPublicationStatus = 'pending' | 'firing' | 'completed' | 'failed';

export interface ScheduledPublicationClaim {
  /** Random token written with the claim; identifies one fire attempt. */
  token: string;
  claimed_at: string;
}

export interface ScheduledPublicationEntry {
  job_id: string;
  type: 'publication';
  /** Reconstructs the job after a restart (commit message + push intent). */
  commit_message: string;
  push: boolean;
  /** ISO wall-clock time the publication is due. */
  publish_at: string;
  created_at: string;
  status: ScheduledPublicationStatus;
  claim?: ScheduledPublicationClaim;
  /** Commit SHA recorded the moment the commit landed (crash evidence). */
  commit_sha?: string;
  /** True when the fire completed after publish_at (recovered late). */
  late?: boolean;
  fired_at?: string;
  error?: string;
}

interface ScheduledPublicationUpsertInput {
  job_id: string;
  commit_message: string;
  push: boolean;
  publish_at: Date;
}

interface CompleteOptions {
  late?: boolean;
  commit_sha?: string;
}

interface StoreFile {
  version: 1;
  entries: ScheduledPublicationEntry[];
}

/** Same id shape JobRunner generates; the outbox owns the id so it survives restarts. */
export function newScheduledPublicationJobId(): string {
  return `job-${Date.now()}-${globalThis.crypto.randomUUID().slice(0, 6)}`;
}

export interface OverdueDecision {
  action: 'fire' | 'skip';
  late: boolean;
  overdueMs: number;
}

/**
 * Overdue policy (plan 212 design record + plan 248 default):
 * overdue > FIRE_LATE_MAX_HOURS → skip (surface as failed `recovered_overdue`);
 * otherwise fire, flagged `late` when the delay is notice-worthy.
 */
export function classifyOverdue(publishAtIso: string, nowMs: number): OverdueDecision {
  const overdueMs = nowMs - Date.parse(publishAtIso);
  if (overdueMs > FIRE_LATE_MAX_HOURS * HOUR_MS) {
    return { action: 'skip', late: false, overdueMs };
  }
  return { action: 'fire', late: overdueMs > LATE_NOTICE_TOLERANCE_MS, overdueMs };
}

export class ScheduledPublications {
  private readonly filePath: string;

  constructor(repoRoot: string) {
    this.filePath = resolve(repoRoot, 'data', 'scheduled-publications.json');
  }

  list(): ScheduledPublicationEntry[] {
    return this.read().entries.map((entry) => ({ ...entry }));
  }

  get(jobId: string): ScheduledPublicationEntry | undefined {
    const entry = this.read().entries.find((candidate) => candidate.job_id === jobId);
    return entry ? { ...entry } : undefined;
  }

  /**
   * Persist the scheduled intent. Called BEFORE the in-memory job is armed so
   * a crash between the write and the timer cannot lose the schedule.
   */
  upsertPending(input: ScheduledPublicationUpsertInput): ScheduledPublicationEntry {
    const file = this.read();
    const entry: ScheduledPublicationEntry = {
      job_id: input.job_id,
      type: 'publication',
      commit_message: input.commit_message,
      push: input.push,
      publish_at: input.publish_at.toISOString(),
      created_at: new Date().toISOString(),
      status: 'pending',
    };
    const index = file.entries.findIndex((candidate) => candidate.job_id === input.job_id);
    if (index >= 0) {
      file.entries[index] = entry;
    } else {
      file.entries.push(entry);
    }
    this.write(file);
    return { ...entry };
  }

  /** Claim every pending entry due at `now`; the claim is durable before firing. */
  claimDue(now: Date): ScheduledPublicationEntry[] {
    const file = this.read();
    const claimed: ScheduledPublicationEntry[] = [];
    for (const entry of file.entries) {
      if (entry.status !== 'pending' || Date.parse(entry.publish_at) > now.getTime()) continue;
      applyClaim(entry);
      claimed.push({ ...entry });
    }
    if (claimed.length > 0) {
      this.write(file);
    }
    return claimed;
  }

  /** Claim one due pending entry (timer path). Returns undefined when not claimable. */
  claim(jobId: string, now: Date): ScheduledPublicationEntry | undefined {
    const file = this.read();
    const entry = file.entries.find((candidate) => candidate.job_id === jobId);
    if (!entry || entry.status !== 'pending' || Date.parse(entry.publish_at) > now.getTime()) {
      return undefined;
    }
    applyClaim(entry);
    this.write(file);
    return { ...entry };
  }

  /**
   * Record the commit SHA while the entry stays `firing` — the crash window
   * between the git commit landing and `complete()` must stay resolvable.
   */
  recordCommit(jobId: string, commitSha: string): boolean {
    return this.updateEntry(jobId, (entry) => {
      entry.commit_sha = commitSha;
    });
  }

  complete(jobId: string, options: CompleteOptions = {}): boolean {
    return this.updateEntry(jobId, (entry) => {
      entry.status = 'completed';
      entry.fired_at = new Date().toISOString();
      entry.late = options.late === true;
      if (options.commit_sha) {
        entry.commit_sha = options.commit_sha;
      }
      delete entry.error;
    });
  }

  fail(jobId: string, error: string): boolean {
    return this.updateEntry(jobId, (entry) => {
      entry.status = 'failed';
      entry.error = error;
    });
  }

  /** Cancel/unreschedule: drop the durable intent so it cannot resurrect at boot. */
  remove(jobId: string): boolean {
    const file = this.read();
    const index = file.entries.findIndex((candidate) => candidate.job_id === jobId);
    if (index < 0) return false;
    file.entries.splice(index, 1);
    this.write(file);
    return true;
  }

  private updateEntry(jobId: string, mutate: (entry: ScheduledPublicationEntry) => void): boolean {
    const file = this.read();
    const entry = file.entries.find((candidate) => candidate.job_id === jobId);
    if (!entry) return false;
    mutate(entry);
    this.write(file);
    return true;
  }

  private read(): StoreFile {
    if (!existsSync(this.filePath)) {
      return { version: 1, entries: [] };
    }
    const raw = readFileSync(this.filePath, 'utf-8');
    // A corrupt outbox must fail loudly: silently dropping schedules recreates
    // the exact failure this store exists to prevent (operator learns about a
    // lost publication only by noticing the site did not change).
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Corrupt scheduled-publications store: ${this.filePath}`, { cause: err });
    }
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      !Array.isArray((parsed as { entries?: unknown }).entries)
    ) {
      throw new Error(`Corrupt scheduled-publications store: ${this.filePath}`);
    }
    return { version: 1, entries: (parsed as StoreFile).entries };
  }

  // Atomic single-file write; maxBackups 0 — this is derived runtime state,
  // not one of the canonical catalog files (nothing to roll back to).
  private write(file: StoreFile): void {
    writeJsonFileAtomic(this.filePath, file, { maxBackups: 0 });
  }
}

function applyClaim(entry: ScheduledPublicationEntry): void {
  entry.status = 'firing';
  entry.claim = { token: randomUUID(), claimed_at: new Date().toISOString() };
}
