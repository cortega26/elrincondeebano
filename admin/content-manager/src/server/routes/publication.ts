import type { FastifyInstance } from 'fastify';
import type { GitAdapter } from '../adapters/gitAdapter.ts';
import { JobRunner, type Job } from '../services/jobRunner.ts';
import type { Repositories } from './helpers.ts';
import type { ProductService } from '../../domain/products/productService.ts';
import {
  createDefaultManifest,
  runPreflight,
} from '../../domain/publication/publicationService.ts';
import { ValidationAdapter } from '../adapters/validationAdapter.ts';
import { RecoveryJournal } from '../services/publicationRecovery.ts';
import type { PersistentIdempotencyStore } from '../services/persistentIdempotencyStore.ts';
import {
  FIRE_LATE_MAX_HOURS,
  ScheduledPublications,
  classifyOverdue,
  newScheduledPublicationJobId,
  type ScheduledPublicationEntry,
} from '../services/scheduledPublications.ts';

export interface GitStatusResponse {
  branch: string;
  dirty: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
  hasConflicts: boolean;
}

export interface PublicationJobResult {
  commit: string;
  pushed: boolean;
}

/** Plan 248: outbox-backed notice surfaced by GET /jobs (late / missed). */
export interface PublicationRecoverySummary {
  job_id: string;
  commit_message: string;
  publish_at: string;
  fired_at?: string;
  error?: string;
}

export interface PublicationRouteOptions {
  scheduledPublications: ScheduledPublications;
  idempotencyStore: PersistentIdempotencyStore;
  /** Read-only boots must not fire publications (a write): entries stay durable. */
  enableWrites: boolean;
}

interface PublicationDeps {
  jobRunner: JobRunner;
  git: GitAdapter;
  repos: Repositories;
  repoRoot: string;
  scheduledPublications: ScheduledPublications;
  idempotencyStore: PersistentIdempotencyStore;
}

interface PublicationJobParams {
  commitMessage: string;
  push: boolean;
}

/**
 * Plan 212 design record: the publication body, bound to an explicit job id
 * (so the durable outbox can re-arm the same job after a restart).
 * `onCommitted` records crash evidence the moment the commit lands, while the
 * entry is still `firing` — before the push step can fail or the process die.
 */
async function runPublicationJob(
  deps: PublicationDeps,
  jobId: string,
  params: PublicationJobParams,
  onCommitted?: (commitSha: string) => void
): Promise<PublicationJobResult> {
  const { jobRunner, git, repoRoot } = deps;
  const manifest = createDefaultManifest();
  const recovery = new RecoveryJournal(repoRoot);
  const validation = new ValidationAdapter();

  const checkCancel = (): void => {
    if (jobRunner.getJob(jobId)?.cancelRequested) {
      throw new Error('Publication cancelled by operator');
    }
  };

  try {
    jobRunner.updateProgress(jobId, 10);
    checkCancel();

    const gitChanges = await git.getChanges();
    checkCancel();
    const preflight = runPreflight(manifest, gitChanges);
    if (!preflight.ok) {
      throw new Error(`Preflight failed: ${preflight.errors.join('; ')}`);
    }

    const validations = await validation.runAllValidations(repoRoot);
    checkCancel();
    const failedValidations = validations.filter((v) => v.status === 'fail');
    if (failedValidations.length > 0) {
      throw new Error(
        `${failedValidations.length} validations failed: ${failedValidations.map((v) => v.step).join(', ')}`
      );
    }

    jobRunner.updateProgress(jobId, 30);
    checkCancel();

    recovery.save({
      current_job_id: jobId,
      current_step: 'stage',
      commit_made: false,
      staged_paths: manifest.ownedPaths,
      timestamp: new Date().toISOString(),
    });

    const stageResult = await git.stage(manifest.ownedPaths);
    checkCancel();
    if (!stageResult.success) {
      throw new Error(`Stage failed: ${stageResult.error ?? 'unknown error'}`);
    }

    jobRunner.updateProgress(jobId, 50);
    checkCancel();

    const commitResult = await git.commitWithPaths(manifest.ownedPaths, params.commitMessage);
    checkCancel();
    if (!commitResult.success) {
      throw new Error(`Commit failed: ${commitResult.error ?? 'unknown error'}`);
    }

    const logResult = await git.log(1);
    checkCancel();
    const commitSha =
      logResult.success && logResult.output ? logResult.output.split(' ')[0] : 'unknown';

    // Plan 248: durable evidence BEFORE anything else can fail — the outbox
    // entry (still `firing`) and the persistent idempotency store are what
    // boot recovery consults to never fire a committed publication twice.
    onCommitted?.(commitSha);

    recovery.save({
      current_job_id: jobId,
      current_step: params.push ? 'push' : 'done',
      commit_made: true,
      commit_sha: commitSha,
      staged_paths: manifest.ownedPaths,
      timestamp: new Date().toISOString(),
    });

    jobRunner.updateProgress(jobId, 70);
    checkCancel();

    if (params.push) {
      const pushResult = await git.push();
      checkCancel();
      if (!pushResult.success) {
        throw new Error(
          `Push failed (commit: ${commitSha}): ${pushResult.error ?? 'unknown error'}`
        );
      }
    }

    jobRunner.updateProgress(jobId, 100);
    recovery.clear();

    return { commit: commitSha, pushed: params.push };
  } catch (err) {
    // Plan 130 CORR-03: a handled failure or cancellation must clear the
    // recovery journal before propagating — only a real crash (process
    // death, which never reaches this catch) may keep it for manual
    // recovery. clear() ignores errors, so this never masks the cause.
    recovery.clear();
    throw err;
  }
}

/** Record the crash-evidence pair the moment a scheduled publication commits. */
function recordCommitted(deps: PublicationDeps, jobId: string, commitSha: string): void {
  deps.scheduledPublications.recordCommit(jobId, commitSha);
  deps.idempotencyStore.set(jobId, {
    command_id: jobId,
    status: 'ok',
    warnings: ['scheduled publication committed (plan 248 durability marker)'],
  });
}

/**
 * Fire a claimed (`firing`) entry: overdue policy first (never fire beyond
 * FIRE_LATE_MAX_HOURS), then the publication, then complete/fail. Runs both
 * from the in-memory timer and from boot recovery. Throws on failure (the
 * in-memory job must not report success); the outbox is already updated.
 */
async function fireClaimedPublication(
  deps: PublicationDeps,
  entry: ScheduledPublicationEntry
): Promise<PublicationJobResult | undefined> {
  const decision = classifyOverdue(entry.publish_at, deps.jobRunner.now());
  if (decision.action === 'skip') {
    const error = `recovered_overdue: la hora programada venció hace más de ${FIRE_LATE_MAX_HOURS} h`;
    deps.scheduledPublications.fail(entry.job_id, error);
    throw new Error(error);
  }

  try {
    const result = await runPublicationJob(
      deps,
      entry.job_id,
      { commitMessage: entry.commit_message, push: entry.push },
      (commitSha) => recordCommitted(deps, entry.job_id, commitSha)
    );
    deps.scheduledPublications.complete(entry.job_id, {
      late: decision.late,
      commit_sha: result.commit,
    });
    return result;
  } catch (err) {
    deps.scheduledPublications.fail(entry.job_id, (err as Error).message);
    throw err;
  }
}

/** Timer path: re-read the entry, claim it, then fire (cancel-safe). */
async function fireScheduledPublication(
  deps: PublicationDeps,
  jobId: string
): Promise<PublicationJobResult | undefined> {
  const entry = deps.scheduledPublications.get(jobId);
  if (!entry || entry.status !== 'pending') return undefined;
  const claimed = deps.scheduledPublications.claim(jobId, new Date(deps.jobRunner.now()));
  if (!claimed) return undefined;
  return fireClaimedPublication(deps, claimed);
}

/** Boot path: future pending entry → arm an in-memory timer under the SAME job id. */
function rearmScheduledPublication(deps: PublicationDeps, entry: ScheduledPublicationEntry): void {
  deps.jobRunner.scheduleAt(
    'publication',
    () => fireScheduledPublication(deps, entry.job_id),
    new Date(entry.publish_at),
    entry.job_id
  );
}

/**
 * Boot path: a `firing` entry means the process died mid-fire. Resolve it via
 * the publication idempotency evidence — the recorded commit SHA present in
 * the git log (plan 212 design record) or the persistent idempotency marker
 * written when the commit landed (plan 248). Without evidence the outcome is
 * undecidable: fail for the operator instead of re-firing (never
 * double-publish).
 */
async function resolveCrashedPublication(
  deps: PublicationDeps,
  entry: ScheduledPublicationEntry
): Promise<void> {
  const committed =
    (entry.commit_sha && (await commitExistsInLog(deps.git, entry.commit_sha))) ||
    deps.idempotencyStore.has(entry.job_id);
  if (committed) {
    deps.scheduledPublications.complete(entry.job_id, {
      late: classifyOverdue(entry.publish_at, deps.jobRunner.now()).late,
      commit_sha: entry.commit_sha,
    });
    return;
  }
  deps.scheduledPublications.fail(
    entry.job_id,
    'crash_mid_publication: el commit quedó indeterminado tras el reinicio; verifica el log de git antes de republicar'
  );
}

async function commitExistsInLog(git: GitAdapter, sha: string): Promise<boolean> {
  const result = await git.log(200);
  if (!result.success || !result.output) return false;
  return result.output.split('\n').some((line) => {
    const short = line.split(' ')[0] ?? '';
    return short.length > 0 && (short === sha || short.startsWith(sha) || sha.startsWith(short));
  });
}

/**
 * Plan 248 boot recovery (called from publicationRoutes registration, real
 * boot path — ADMIN_SKIP_RECOVERY_CHECK does not apply here): due pending
 * entries are claimed and fired, future ones re-armed, crash leftovers
 * resolved. Only runs when writes are enabled.
 */
async function recoverScheduledPublications(deps: PublicationDeps): Promise<void> {
  const now = new Date(deps.jobRunner.now());
  for (const entry of deps.scheduledPublications.list()) {
    if (entry.status === 'pending') {
      if (Date.parse(entry.publish_at) > now.getTime()) {
        rearmScheduledPublication(deps, entry);
      }
      // Due pending entries are claimed below (single durable write) and fired.
    } else if (entry.status === 'firing') {
      await resolveCrashedPublication(deps, entry);
    }
  }

  for (const claimed of deps.scheduledPublications.claimDue(new Date(deps.jobRunner.now()))) {
    try {
      await fireClaimedPublication(deps, claimed);
    } catch {
      // Already recorded in the outbox as failed; a boot fire has no
      // in-memory job to surface the error to (GET /jobs `missed` shows it).
    }
  }
}

function recoverySummary(entry: ScheduledPublicationEntry): PublicationRecoverySummary {
  return {
    job_id: entry.job_id,
    commit_message: entry.commit_message,
    publish_at: entry.publish_at,
    fired_at: entry.fired_at,
    error: entry.error,
  };
}

export async function publicationRoutes(
  app: FastifyInstance,
  repos: Repositories,
  jobRunner: JobRunner,
  git: GitAdapter,
  productService: ProductService,
  repoRoot: string,
  options: PublicationRouteOptions
): Promise<void> {
  const validation = new ValidationAdapter();
  const deps: PublicationDeps = {
    jobRunner,
    git,
    repos,
    repoRoot,
    scheduledPublications: options.scheduledPublications,
    idempotencyStore: options.idempotencyStore,
  };

  app.get('/git/status', async () => {
    const changes = await git.getChanges();
    return {
      branch: changes.branch,
      dirty: changes.dirty,
      staged: changes.staged,
      unstaged: changes.unstaged,
      untracked: changes.untracked,
      ahead: changes.ahead,
      behind: changes.behind,
      hasConflicts: changes.hasConflicts,
    };
  });

  // Safe repository pull (plan 061 step 2): fixed `git pull --rebase`, never
  // browser-supplied remote/branch arguments. Refuses dirty or conflicted
  // trees before scheduling; runs through the job runner for observability.
  app.post('/git/pull', async (request, reply) => {
    if (!productService.isEnabled) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Write operations are disabled' },
      });
    }

    const changes = await git.getChanges();
    if (changes.dirty) {
      return reply.status(409).send({
        error: {
          code: 'DIRTY_TREE',
          message: 'El árbol tiene cambios sin publicar. Publica o descarta antes de hacer pull.',
        },
      });
    }
    if (changes.hasConflicts) {
      return reply.status(409).send({
        error: {
          code: 'CONFLICTED_TREE',
          message: 'El árbol tiene conflictos sin resolver. Resuélvelos antes de hacer pull.',
        },
      });
    }

    const job = jobRunner.schedule<{ success: boolean; output?: string; error?: string }>(
      'git-pull',
      async () => {
        const result = await git.pull();
        if (result.success) {
          return { success: true, output: result.output };
        }
        // A rebase conflict leaves git mid-operation — document recovery.
        const recovery = /conflict|CONFLICT/i.test(result.error ?? '')
          ? ' Conflicto durante el rebase: ejecuta `git rebase --abort` para recuperar.'
          : '';
        return {
          success: false,
          error: `${result.error ?? 'Git pull failed'}${recovery}`,
        };
      }
    );

    return { job_id: job.id, status: 'scheduled' };
  });

  app.post('/publications/preview', async () => {
    const changes = await git.getChanges();
    const manifest = createDefaultManifest();
    const preflight = runPreflight(manifest, changes);

    const schemaResults = {
      products: validation.validateProducts(repoRoot),
      categories: validation.validateCategories(repoRoot),
      storefront: validation.validateStorefront(repoRoot),
    };

    return {
      preflight: {
        ...preflight,
        validations: schemaResults,
      },
      git: {
        branch: changes.branch,
        dirty: changes.dirty,
        staged: changes.staged,
        unstaged: changes.unstaged,
        untracked: changes.untracked,
        ahead: changes.ahead,
        behind: changes.behind,
        hasConflicts: changes.hasConflicts,
      },
    };
  });

  app.post('/publications', async (request, reply) => {
    if (!productService.isEnabled) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Write operations are disabled' },
      });
    }

    const body = (request.body ?? {}) as {
      commitMessage?: string;
      push?: boolean;
      publishAt?: string;
    };

    const productCount = repos.products.loadCatalog().products.length;
    const commitMessage =
      body.commitMessage ??
      `catálogo: ${productCount} producto(s) [${new Date().toISOString().slice(0, 16)}]`;
    const push = body.push ?? false;

    // Plan 127 F3.1: scheduled publication — publishAt must be a future
    // ISO timestamp; the job stays pending until then and is cancellable.
    let publishAt: Date | undefined;
    if (body.publishAt) {
      publishAt = new Date(body.publishAt);
      if (Number.isNaN(publishAt.getTime()) || publishAt.getTime() <= Date.now()) {
        return reply.status(422).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'publishAt debe ser una fecha futura en formato ISO',
          },
        });
      }
    }

    let job: Job<PublicationJobResult | undefined>;

    // Immediate publications stay in-memory only: there is nothing to recover
    // after a crash the operator did not just trigger. The runner only invokes
    // this after `job` is assigned below.
    const runImmediatePublication = (): Promise<PublicationJobResult> =>
      runPublicationJob(deps, job.id, { commitMessage, push });

    if (publishAt) {
      // Plan 248: durable intent FIRST (a crash before the in-memory timer is
      // armed must not lose the schedule), then arm the job under the outbox id.
      const jobId = newScheduledPublicationJobId();
      deps.scheduledPublications.upsertPending({
        job_id: jobId,
        commit_message: commitMessage,
        push,
        publish_at: publishAt,
      });
      job = jobRunner.scheduleAt<PublicationJobResult | undefined>(
        'publication',
        () => fireScheduledPublication(deps, jobId),
        publishAt,
        jobId
      );
    } else {
      job = jobRunner.schedule<PublicationJobResult>('publication', runImmediatePublication);
    }

    return { job_id: job.id, status: 'scheduled' };
  });

  app.get('/publications/recovery', async () => {
    const recovery = new RecoveryJournal(repoRoot);
    const state = recovery.load();
    return {
      pending_recovery: recovery.hasPendingRecovery(),
      state: state ?? null,
    };
  });

  app.get('/jobs', async () => {
    const jobs = jobRunner.listJobs();
    // Plan 248: the durable outbox backs the pending list — `recovered`
    // (fired late after a restart) and `missed` (never fired: stale or crash)
    // come from the store, not inferred client-side.
    const entries = options.scheduledPublications.list();
    return {
      jobs: jobs
        .filter((j) => j.status === 'pending' || j.status === 'running')
        .map((j) => ({
          id: j.id,
          type: j.type,
          status: j.status,
          progress: j.progress,
          started_at: j.started_at,
          completed_at: j.completed_at,
          scheduled_at: j.scheduled_at,
        })),
      recovered: entries
        .filter((entry) => entry.status === 'completed' && entry.late)
        .map(recoverySummary),
      missed: entries
        .filter((entry) => entry.status === 'failed')
        .map(recoverySummary),
    };
  });

  app.get('/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = jobRunner.getJob(id);

    if (!job) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Job "${id}" not found` },
      });
    }

    return {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      started_at: job.started_at,
      completed_at: job.completed_at,
      scheduled_at: job.scheduled_at,
      result: job.result,
      error: job.error,
    };
  });

  app.post('/jobs/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const cancelled = jobRunner.cancelJob(id);

    if (!cancelled) {
      const job = jobRunner.getJob(id);
      if (!job) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: `Job "${id}" not found` },
        });
      }
      return reply.status(409).send({
        error: {
          code: 'CONFLICT',
          message: `Job "${id}" cannot be cancelled (status: ${job.status})`,
        },
      });
    }

    const job = jobRunner.getJob(id);
    // Plan 248: drop the durable intent too — a cancelled schedule must not
    // resurrect from the outbox on the next boot (no-op for non-outbox jobs).
    options.scheduledPublications.remove(id);
    return {
      id: job?.id ?? id,
      type: job?.type ?? '',
      status: job?.status ?? 'cancelled',
      progress: job?.progress ?? 0,
      started_at: job?.started_at,
      completed_at: job?.completed_at,
      scheduled_at: job?.scheduled_at,
      error: job?.error,
    };
  });

  // Plan 248 boot recovery — the real boot path tests exercise through
  // createApp. It runs here (not start.ts) so the app under test and the
  // production entry share it; ADMIN_SKIP_RECOVERY_CHECK does not apply.
  // Read-only boots never fire publications: the durable entries wait for an
  // operator-mode boot.
  if (options.enableWrites) {
    try {
      await recoverScheduledPublications(deps);
    } catch (err) {
      app.log.error({ err }, 'scheduled publications recovery failed');
    }
  }
}
