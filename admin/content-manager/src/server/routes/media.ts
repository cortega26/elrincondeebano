import { writeFileSync, renameSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Repositories } from './catalog.ts';
import { MediaRepository } from '../repositories/mediaRepository.ts';
import { MediaIntentRepository } from '../repositories/mediaIntentRepository.ts';
import {
  mediaIntentSchema,
  generateMediaIntentId,
  MEDIA_UPLOAD_MAX_BYTES,
  type MediaIntent,
} from '../../shared/schemas/mediaIntent.ts';
import { isSafeId, isContainedWithin } from '../../shared/identity.ts';
import { HttpError, sanitizeUserMessage } from '../../shared/errors/AppError.ts';
import { runAvifJob, runVariantJob, runCategoryOgJob } from '../services/mediaJobs.ts';

// Magic-byte signatures per declared content type (plan 063 step 2).
const MAGIC_BYTES: Record<string, (buf: Buffer) => boolean> = {
  'image/png': (b) =>
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a,
  'image/jpeg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) =>
    b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  'image/avif': (b) =>
    b.length >= 12 &&
    b.toString('ascii', 4, 8) === 'ftyp' &&
    (b.toString('ascii', 8, 12).includes('avif') || b.toString('ascii', 8, 12).includes('avis')),
  'image/gif': (b) =>
    b.length >= 6 &&
    (b.toString('ascii', 0, 6) === 'GIF87a' || b.toString('ascii', 0, 6) === 'GIF89a'),
};

const EXTENSION_FOR_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

const ALLOWED_TYPES = Object.keys(MAGIC_BYTES);

export async function mediaMutRoutes(
  app: FastifyInstance,
  repos: Repositories,
  media: MediaRepository,
  repoRoot: string
): Promise<void> {
  const intents = new MediaIntentRepository(repoRoot);

  app.get('/media', async () => {
    const products = repos.products.loadCatalog().products;
    const inventory = media.getInventory(products);
    // Enrich inventory with pending intents so the workbench can show them.
    return { ...inventory, intents: intents.listAll() };
  });

  app.get('/media/validate', async (request, reply) => {
    const query = request.query as { path?: string };
    if (!query.path) {
      return reply
        .status(400)
        .send({ error: { code: 'BAD_REQUEST', message: 'Missing path parameter' } });
    }
    const result = media.validatePath(query.path);
    return result;
  });

  // ── Step 2: sniffed, bounded, staged upload ────────────────────────────────

  app.post('/media/upload', async (request, reply) => {
    try {
      const body = request.body as {
        data?: string;
        targetPath?: string;
        content_type?: string;
      };
      const targetPath = body?.targetPath;
      const contentType = body?.content_type;
      const data = body?.data;

      if (!targetPath || !contentType) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Missing targetPath or content_type' },
        });
      }
      if (!ALLOWED_TYPES.includes(contentType)) {
        return reply.status(415).send({
          error: {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: `Unsupported content type: ${contentType}. Allowed: ${ALLOWED_TYPES.join(', ')}`,
          },
        });
      }
      const pathCheck = media.validatePath(targetPath);
      if (!pathCheck.ok) {
        return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: pathCheck.error } });
      }

      if (!data) {
        return reply.status(201).send({
          status: 'staged',
          targetPath,
          content_type: contentType,
        });
      }

      const decoded = Buffer.from(data, 'base64');
      if (decoded.length > MEDIA_UPLOAD_MAX_BYTES) {
        return reply.status(413).send({
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: `File size exceeds ${MEDIA_UPLOAD_MAX_BYTES / (1024 * 1024)}MB limit`,
          },
        });
      }
      if (decoded.length === 0) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Empty payload' },
        });
      }

      // Content sniffing: declared type must agree with magic bytes.
      const sniff = MAGIC_BYTES[contentType];
      if (!sniff(decoded)) {
        return reply.status(415).send({
          error: {
            code: 'CONTENT_MISMATCH',
            message: `Declared content type ${contentType} does not match the file content`,
          },
        });
      }

      // Stage under the manager-owned root; never write canonical paths.
      const sha256 = createHash('sha256').update(decoded).digest('hex');
      const stagedFile = `${sha256}.${EXTENSION_FOR_TYPE[contentType]}`;
      const stagedPath = resolve(intents.stagingRoot, stagedFile);
      mkdirSync(intents.stagingRoot, { recursive: true });
      writeFileSync(stagedPath, decoded, { flush: true });

      return reply.status(201).send({
        status: 'staged',
        targetPath,
        content_type: contentType,
        size: decoded.length,
        staged_file: stagedFile,
        sha256,
      });
    } catch (err) {
      throw new HttpError(400, 'BAD_REQUEST', sanitizeUserMessage((err as Error).message));
    }
  });

  // ── Step 1: durable intents ────────────────────────────────────────────────

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

    return { status: 'started', intent_id: intent.id };
  });

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
    for (const output of intent.outputs) {
      if (isContainedWithin(intents.stagingRoot, output) && existsSync(output)) {
        try {
          unlinkSync(output);
        } catch {
          // Best-effort cleanup
        }
      }
    }
    if (
      intent.source_path &&
      isContainedWithin(intents.stagingRoot, intent.source_path) &&
      existsSync(intent.source_path)
    ) {
      try {
        unlinkSync(intent.source_path);
      } catch {
        // Best-effort cleanup
      }
    }
    intents.delete(id);
    return { status: 'discarded', intent_id: id };
  });

  // ── Step 4: atomic apply of assets + content ───────────────────────────────

  app.post('/media/intents/:id/apply', async (request, reply) => {
    const { id } = request.params as { id: string };
    const intent = intents.load(id);
    if (!intent) {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Media intent not found' } });
    }
    if (intent.status !== 'succeeded') {
      return reply.status(409).send({
        error: {
          code: 'NOT_READY',
          message: `Only succeeded intents can be applied (status: ${intent.status})`,
        },
      });
    }

    const promoted: Array<{ staged: string; canonical: string }> = [];
    try {
      // Plan 089: the canonical OG tool writes/deletes the canonical asset
      // at run time (no staging) — apply is a no-op state transition that
      // verifies the expected canonical state instead of promoting files.
      if (intent.type === 'og' || intent.type === 'og-delete') {
        const canonicalRelative = intent.target_path ?? '';
        const canonicalPath = resolve(repoRoot, canonicalRelative);
        if (!isContainedWithin(resolve(repoRoot, 'assets'), canonicalPath)) {
          return reply.status(422).send({
            error: { code: 'FORBIDDEN', message: `Unsafe canonical target: ${canonicalRelative}` },
          });
        }
        const exists = existsSync(canonicalPath);
        if (intent.type === 'og' && !exists) {
          return reply.status(422).send({
            error: {
              code: 'MISSING_OUTPUT',
              message: `OG image was not generated: ${canonicalRelative}`,
            },
          });
        }
        if (intent.type === 'og-delete' && exists) {
          return reply.status(422).send({
            error: {
              code: 'OUTPUT_STILL_PRESENT',
              message: `OG image is still present: ${canonicalRelative}`,
            },
          });
        }
        intent.status = 'applied';
        intent.updated_at = new Date().toISOString();
        intent.completed_at = new Date().toISOString();
        intents.save(intent);
        return {
          status: 'applied',
          intent_id: id,
          promoted: 0,
          canonical: canonicalRelative,
        };
      }

      // Promote staged outputs to canonical paths (validated targets).
      for (const output of intent.outputs) {
        if (!isContainedWithin(intents.stagingRoot, output) || !existsSync(output)) {
          return reply.status(422).send({
            error: { code: 'MISSING_OUTPUT', message: `Output missing: ${output}` },
          });
        }
        const canonicalRelative = canonicalTargetFor(intent, output);
        const canonicalPath = resolve(repoRoot, canonicalRelative);
        if (!isContainedWithin(resolve(repoRoot, 'assets'), canonicalPath)) {
          return reply.status(422).send({
            error: { code: 'FORBIDDEN', message: `Unsafe canonical target: ${canonicalRelative}` },
          });
        }
        mkdirSync(dirname(canonicalPath), { recursive: true });
        renameSync(output, canonicalPath);
        promoted.push({ staged: output, canonical: canonicalPath });
      }

      // Update product references in a single revision-guarded catalog write.
      if (intent.product_id) {
        const catalog = repos.products.loadCatalog();
        const product = catalog.products.find((p) => p.id === intent.product_id);
        if (!product) {
          throw new Error(`Product "${intent.product_id}" not found`);
        }
        const now = new Date().toISOString();
        if (intent.type === 'avif') {
          product.image_avif_path = canonicalTargetFor(intent, intent.outputs[0] ?? '');
          product.field_last_modified.image_avif_path = {
            ts: now,
            by: 'media-workbench',
            rev: product.rev + 1,
            base_rev: product.rev,
            changeset_id: null,
          };
        } else {
          product.image_path = canonicalTargetFor(intent, intent.outputs[0] ?? '');
          product.field_last_modified.image_path = {
            ts: now,
            by: 'media-workbench',
            rev: product.rev + 1,
            base_rev: product.rev,
            changeset_id: null,
          };
        }
        product.rev += 1;
        const baseRev = catalog.rev;
        catalog.rev += 1;
        catalog.last_updated = now;
        const writeResult = await repos.products.writeCatalog(
          catalog,
          `media-${intent.id}`,
          baseRev
        );
        if (!writeResult.ok) {
          throw new Error(writeResult.error ?? 'Catalog write failed');
        }
      }

      intent.status = 'applied';
      intent.updated_at = new Date().toISOString();
      intent.completed_at = new Date().toISOString();
      intents.save(intent);

      return { status: 'applied', intent_id: id, promoted: promoted.length };
    } catch (err) {
      // Roll back promoted files (best effort) so JSON and assets never split.
      for (const { staged, canonical } of promoted.reverse()) {
        if (existsSync(canonical)) {
          try {
            renameSync(canonical, staged);
          } catch {
            // Best-effort rollback
          }
        }
      }
      throw new HttpError(500, 'APPLY_FAILED', 'Apply failed', (err as Error).message);
    }
  });
}

function canonicalTargetFor(intent: MediaIntent, _output: string): string {
  const base = intent.target_path ?? '';
  if (intent.type === 'avif') {
    return base.replace(/\.(png|jpe?g|webp)$/i, '.avif');
  }
  if (intent.type === 'variant') {
    return base.replace(/(\.[a-z0-9]+)$/i, '-480$1');
  }
  return base;
}
