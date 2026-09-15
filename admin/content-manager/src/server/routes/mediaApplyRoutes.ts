import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { MediaIntent } from '../../shared/schemas/mediaIntent.ts';
import { isContainedWithin } from '../../shared/identity.ts';
import { HttpError } from '../../shared/errors/AppError.ts';
import type { MediaRouteContext } from './media-common.ts';

// Plan 198: media mediaApply slice of mediaMutRoutes (move-only split).
export async function registerMediaApplyRoutes({
  app,
  repos,
  media,
  repoRoot,
  intents,
}: MediaRouteContext): Promise<void> {
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
        media.invalidate();
        return {
          status: 'applied',
          intent_id: id,
          promoted: 0,
          canonical: canonicalRelative,
        };
      }

      // Plan 176: fail closed on output shapes the rest of apply cannot
      // handle. Empty outputs would link the product to a file that was
      // never promoted (outputs[0] ?? ''); multi-output intents do not exist
      // (mediaJobs returns exactly one output on success), so more than one
      // is a contract violation, not a batch to promote onto one path.
      if (intent.outputs.length === 0) {
        return reply.status(422).send({
          error: { code: 'MISSING_OUTPUT', message: 'Intent has no outputs to promote' },
        });
      }
      if (intent.outputs.length > 1) {
        return reply.status(422).send({
          error: {
            code: 'MULTIPLE_OUTPUTS',
            message: `Intent has ${intent.outputs.length} outputs; apply supports exactly one`,
          },
        });
      }
      const [primaryOutput] = intent.outputs;

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
          product.image_avif_path = canonicalTargetFor(intent, primaryOutput ?? '');
          product.field_last_modified.image_avif_path = {
            ts: now,
            by: 'media-workbench',
            rev: product.rev + 1,
            base_rev: product.rev,
            changeset_id: null,
          };
        } else {
          product.image_path = canonicalTargetFor(intent, primaryOutput ?? '');
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
      media.invalidate();

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
      if (promoted.length > 0) media.invalidate();
      throw new HttpError(500, 'APPLY_FAILED', 'Apply failed', (err as Error).message);
    }
  });

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
}
