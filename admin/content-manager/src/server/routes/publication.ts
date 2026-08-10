import type { FastifyInstance } from 'fastify';
import type { GitAdapter } from '../adapters/gitAdapter.ts';
import { JobRunner } from '../services/jobRunner.ts';
import type { Repositories } from './catalog.ts';
import type { ProductService } from '../../domain/products/productService.ts';
import {
  createDefaultManifest,
  runPreflight,
} from '../../domain/publication/publicationService.ts';
import { ValidationAdapter } from '../adapters/validationAdapter.ts';
import { RecoveryJournal } from '../services/publicationRecovery.ts';

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

export async function publicationRoutes(
  app: FastifyInstance,
  repos: Repositories,
  jobRunner: JobRunner,
  git: GitAdapter,
  productService: ProductService,
  repoRoot: string
): Promise<void> {
  const validation = new ValidationAdapter();

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

    const body = request.body as {
      commitMessage?: string;
      push?: boolean;
    };

    const manifest = createDefaultManifest();
    const commitMessage = body.commitMessage ?? manifest.commitMessage;
    const push = body.push ?? false;

    const job = jobRunner.schedule<PublicationJobResult>('publication', async () => {
      const jobId = job.id;
      const recovery = new RecoveryJournal(repoRoot);
      const validation = new ValidationAdapter();

      const checkCancel = (): void => {
        if (job.cancelRequested) throw new Error('Publication cancelled by operator');
      };

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

      const commitResult = await git.commitWithPaths(manifest.ownedPaths, commitMessage);
      checkCancel();
      if (!commitResult.success) {
        throw new Error(`Commit failed: ${commitResult.error ?? 'unknown error'}`);
      }

      const logResult = await git.log(1);
      checkCancel();
      const commitSha =
        logResult.success && logResult.output ? logResult.output.split(' ')[0] : 'unknown';

      recovery.save({
        current_job_id: jobId,
        current_step: push ? 'push' : 'done',
        commit_made: true,
        commit_sha: commitSha,
        staged_paths: manifest.ownedPaths,
        timestamp: new Date().toISOString(),
      });

      jobRunner.updateProgress(jobId, 70);
      checkCancel();

      if (push) {
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

      return { commit: commitSha, pushed: push };
    });

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
    return {
      id: job?.id ?? id,
      type: job?.type ?? '',
      status: job?.status ?? 'cancelled',
      progress: job?.progress ?? 0,
      started_at: job?.started_at,
      completed_at: job?.completed_at,
      error: job?.error,
    };
  });
}
