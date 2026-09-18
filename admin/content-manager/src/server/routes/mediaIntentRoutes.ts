import { unlinkSync, existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import type { MediaIntentRepository } from '../repositories/mediaIntentRepository.ts';
import type { MediaRepository } from '../repositories/mediaRepository.ts';
import {
  mediaIntentSchema,
  generateMediaIntentId,
  type MediaIntent,
} from '../../shared/schemas/mediaIntent.ts';
import { isSafeId, isContainedWithin } from '../../shared/identity.ts';
import { runAvifJob, runVariantJob, runCategoryOgJob } from '../services/mediaJobs.ts';
import type { MediaRouteContext } from './media-common.ts';

function cleanupIntentFiles(intent: MediaIntent, stagingRoot: string): void {
  for (const output of intent.outputs ?? []) {
    if (isContainedWithin(stagingRoot, output) && existsSync(output)) {
      try {
        unlinkSync(output);
      } catch {
        // Best-effort cleanup
      }
    }
  }
  if (
    intent.source_path &&
    isContainedWithin(stagingRoot, intent.source_path) &&
    existsSync(intent.source_path)
  ) {
    try {
      unlinkSync(intent.source_path);
    } catch {
      // Best-effort cleanup
    }
  }
  if (intent.staged_file) {
    try {
      const stagedPath = resolve(stagingRoot, intent.staged_file);
      if (isContainedWithin(stagingRoot, stagedPath) && existsSync(stagedPath)) {
        unlinkSync(stagedPath);
      }
    } catch {
      // best-effort staging cleanup
    }
  }
}
// Plan 198: media mediaIntent slice of mediaMutRoutes (move-only split).
export async function registerMediaIntentRoutes({
  app,
  media,
  repoRoot,
  intents,
}: MediaRouteContext): Promise<void> {
  app.post('/media/intents', async (request, reply) => {
    const body = request.body as {
      type?: string;
      staged_file?: string;
      target_path?: string;
      product_id?: string;
      category_slug?: string;
    };
    const type = body?.type;
    if (!type || !['avif', 'variant', 'og', 'og-delete'].includes(type) || !body?.target_path) {
      return reply.status(400).send({
        error: {
          code: 'BAD_REQUEST',
          message: 'Missing type (avif|variant|og|og-delete) or target_path',
        },
      });
    }
    const pathCheck = media.validatePath(body.target_path);
    if (!pathCheck.ok) {
      return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: pathCheck.error } });
    }
    if (
      (type === 'variant' || type === 'avif') &&
      extname(body.target_path).toLowerCase() === '.svg'
    ) {
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Raster intent target_path cannot be .svg (got .svg) — variant/avif jobs produce raster outputs and must target a raster extension`,
        },
      });
    }
    if (type === 'og' || type === 'og-delete') {
      if (!body.category_slug || !isSafeId(body.category_slug)) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Missing or invalid category_slug for OG intent' },
        });
      }
    }

    const stagedFile = body.staged_file;
    if (stagedFile) {
      const stagedPath = resolve(intents.stagingRoot, stagedFile);
      if (!isContainedWithin(intents.stagingRoot, stagedPath) || !existsSync(stagedPath)) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Staged file not found' },
        });
      }
    }

    const now = new Date().toISOString();
    const intent: MediaIntent = {
      version: 1,
      id: generateMediaIntentId(),
      type: type as MediaIntent['type'],
      status: 'pending',
      source_path: stagedFile ? resolve(intents.stagingRoot, stagedFile) : undefined,
      target_path: body.target_path,
      staged_file: stagedFile,
      product_id: body.product_id,
      category_slug: body.category_slug,
      outputs: [],
      progress: 0,
      errors: [],
      created_at: now,
      updated_at: now,
      completed_at: null,
      change_set_id: null,
      cancel_requested: false,
    };
    const result = mediaIntentSchema.safeParse(intent);
    if (!result.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: result.error.issues.map((i) => i.message).join('; '),
        },
      });
    }
    intents.save(result.data);
    return reply.status(201).send(result.data);
  });

  app.post('/media/intents/:id/run', async (request, reply) => {
    const { id } = request.params as { id: string };
    const intent = intents.load(id);
    if (!intent) {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Media intent not found' } });
    }
    if (intent.status === 'running') {
      return reply.status(409).send({
        error: { code: 'ALREADY_RUNNING', message: 'Media intent is already running' },
      });
    }
    intent.status = 'running';
    intent.cancel_requested = false;
    intent.errors = [];
    intent.progress = 0;
    intent.updated_at = new Date().toISOString();
    intents.save(intent);

    startIntentJob(intent, intents, repoRoot, media);

    return { status: 'started', intent_id: intent.id };
  });

  function startIntentJob(
    intent: MediaIntent,
    intents: MediaIntentRepository,
    repoRoot: string,
    mediaRepo: MediaRepository
  ): void {
    const update = (patch: Partial<MediaIntent>): void => {
      Object.assign(intent, patch, { updated_at: new Date().toISOString() });
      intents.save(intent);
    };

    void (async () => {
      const input = {
        repoRoot,
        stagingRoot: intents.stagingRoot,
        sourcePath: intent.source_path ?? '',
        targetRelativePath: intent.target_path ?? '',
        categorySlug: intent.category_slug,
        onProgress: (percent: number) => update({ progress: percent }),
        isCancelled: () => intent.cancel_requested,
      };

      try {
        let result;
        if (intent.type === 'avif') {
          result = await runAvifJob(input);
        } else if (intent.type === 'variant') {
          result = await runVariantJob(input);
        } else {
          result = await runCategoryOgJob(input, intent.type === 'og' ? 'generate' : 'delete');
        }

        if (intent.cancel_requested) {
          update({ status: 'cancelled', progress: 0, completed_at: new Date().toISOString() });
        } else if (result.ok) {
          update({
            status: 'succeeded',
            progress: 100,
            outputs: result.outputs,
            completed_at: new Date().toISOString(),
          });
          // OG jobs write canonical assets at run time (not staging), so
          // the media inventory (assets tree) changed — invalidate cache.
          if (result.output_kind === 'canonical') {
            mediaRepo.invalidate();
          }
        } else {
          update({
            status: 'failed',
            errors: [result.error ?? 'Job failed'],
            completed_at: new Date().toISOString(),
          });
        }
      } catch (err) {
        // Plan 103: a persistence/job failure must mark the intent failed —
        // never leave it stuck in `running` (which blocks run/discard and
        // crashes the process with an unhandled rejection).
        const message = err instanceof Error ? err.message : String(err);
        try {
          update({ status: 'failed', errors: [message], completed_at: new Date().toISOString() });
        } catch {
          // The failure path itself failing must not produce a new
          // unhandled rejection.
        }
      }
    })();
  }

  app.post('/media/intents/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const intent = intents.load(id);
    if (!intent) {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Media intent not found' } });
    }
    if (intent.status === 'succeeded' || intent.status === 'failed') {
      return reply.status(409).send({
        error: { code: 'ALREADY_FINISHED', message: `Intent already ${intent.status}` },
      });
    }
    if (intent.status === 'pending') {
      intent.status = 'cancelled';
      intent.completed_at = new Date().toISOString();
    } else {
      intent.cancel_requested = true;
    }
    intent.updated_at = new Date().toISOString();
    intents.save(intent);
    return { status: 'cancelling', intent_id: id };
  });

  // Plan 127 F2.4: batch intent operations (run/cancel/discard) — validates
  // every id first, then applies each with the same guards as the single
  // routes; per-id skips are reported (never a partial silent failure).
  app.post('/media/intents/batch', async (request, reply) => {
    const body = request.body as {
      action?: 'run' | 'cancel' | 'discard';
      ids?: string[];
    };
    if (
      !body?.action ||
      !['run', 'cancel', 'discard'].includes(body.action) ||
      !Array.isArray(body.ids) ||
      body.ids.length === 0
    ) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Missing action (run|cancel|discard) or ids array' },
      });
    }

    const missing = body.ids.filter((id) => !intents.load(id));
    if (missing.length > 0) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Some intents not found', details: missing },
      });
    }

    let applied = 0;
    const skipped: Array<{ id: string; reason: string }> = [];
    for (const id of body.ids) {
      const intent = intents.load(id)!;
      if (body.action === 'run') {
        if (intent.status === 'running') {
          skipped.push({ id, reason: 'ALREADY_RUNNING' });
          continue;
        }
        intent.status = 'running';
        intent.cancel_requested = false;
        intent.errors = [];
        intent.progress = 0;
        intent.updated_at = new Date().toISOString();
        intents.save(intent);
        startIntentJob(intent, intents, repoRoot, media);
      } else if (body.action === 'cancel') {
        if (intent.status === 'succeeded' || intent.status === 'failed') {
          skipped.push({ id, reason: 'ALREADY_FINISHED' });
          continue;
        }
        if (intent.status === 'pending') {
          intent.status = 'cancelled';
          intent.completed_at = new Date().toISOString();
        } else {
          intent.cancel_requested = true;
        }
        intent.updated_at = new Date().toISOString();
        intents.save(intent);
      } else {
        // discard: staging only, never canonical assets; running intents
        // are refused (the single route's contract).
        if (intent.status === 'running') {
          skipped.push({ id, reason: 'RUNNING' });
          continue;
        }
        cleanupIntentFiles(intent, intents.stagingRoot);
        intents.delete(id);
      }
      applied += 1;
    }

    return { status: 'ok', action: body.action, applied, skipped };
  });

  // Discard removes staging only — never canonical assets.
  app.delete('/media/intents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const intent = intents.load(id);
    if (!intent) {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Media intent not found' } });
    }
    if (intent.status === 'running') {
      return reply.status(409).send({
        error: { code: 'ALREADY_RUNNING', message: 'Cannot discard a running intent' },
      });
    }
    cleanupIntentFiles(intent, intents.stagingRoot);
    intents.delete(id);
    return { status: 'discarded', intent_id: id };
  });
}
