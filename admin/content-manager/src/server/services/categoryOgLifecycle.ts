import { MediaIntentRepository } from '../repositories/mediaIntentRepository.ts';
import { runCategoryOgJob } from './mediaJobs.ts';
import { generateMediaIntentId } from '../../shared/schemas/mediaIntent.ts';
import type { MediaIntent } from '../../shared/schemas/mediaIntent.ts';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Plan 096 (deferred item): automatic OG lifecycle for category CRUD —
// Python parity (category save/delete regenerates the OG image). The intent
// goes through the SAME durable lifecycle as the manual workbench (create →
// run → apply) so failures are visible in MediaPage and never block the
// category operation. The canonical tool (tools/category_og) must be
// available in the operator environment (python3), matching the workbench.
export async function ensureCategoryOgAssets(
  repoRoot: string,
  slug: string,
  operation: 'generate' | 'delete',
  // Plan 106: injectable seam for tests — production callers keep the
  // default python3-backed runner.
  runner: typeof runCategoryOgJob = runCategoryOgJob
): Promise<{ ok: boolean; error?: string }> {
  try {
    const intents = new MediaIntentRepository(repoRoot);
    const now = new Date().toISOString();
    const intent: MediaIntent = {
      version: 1,
      id: generateMediaIntentId(),
      type: operation === 'generate' ? 'og' : 'og-delete',
      status: 'running',
      target_path: `assets/images/og/categories/${slug}.png`,
      category_slug: slug,
      outputs: [],
      progress: 20,
      errors: [],
      created_at: now,
      updated_at: now,
      completed_at: null,
      change_set_id: null,
      cancel_requested: false,
    };
    intents.save(intent);

    const input = {
      repoRoot,
      stagingRoot: intents.stagingRoot,
      sourcePath: '',
      targetRelativePath: intent.target_path ?? '',
      categorySlug: slug,
      onProgress: () => {},
      isCancelled: () => intent.cancel_requested,
    };

    const result = await runner(input, operation === 'generate' ? 'generate' : 'delete');
    if (!result.ok) {
      intent.status = 'failed';
      intent.errors = [result.error ?? 'OG job failed'];
      intent.completed_at = new Date().toISOString();
      intents.save(intent);
      return { ok: false, error: result.error };
    }

    // Plan 089 contract: verify the canonical state, then mark applied.
    const canonicalPath = resolve(repoRoot, intent.target_path ?? '');
    const exists = existsSync(canonicalPath);
    if (operation === 'generate' && !exists) {
      intent.status = 'failed';
      intent.errors = ['OG image was not generated'];
      intent.completed_at = new Date().toISOString();
      intents.save(intent);
      return { ok: false, error: 'OG image was not generated' };
    }
    if (operation === 'delete' && exists) {
      intent.status = 'failed';
      intent.errors = ['OG image is still present'];
      intent.completed_at = new Date().toISOString();
      intents.save(intent);
      return { ok: false, error: 'OG image is still present' };
    }

    intent.status = 'applied';
    intent.progress = 100;
    intent.outputs = result.outputs;
    intent.completed_at = new Date().toISOString();
    intents.save(intent);
    return { ok: true };
  } catch (error) {
    // Plan 106: an unexpected failure must still land the intent in a
    // terminal state — 'running' blocks run/discard in the workbench.
    try {
      const intent = new MediaIntentRepository(repoRoot).listAll().at(-1);
      if (intent) {
        intent.status = 'failed';
        intent.errors = [(error as Error).message];
        intent.completed_at = new Date().toISOString();
        new MediaIntentRepository(repoRoot).save(intent);
      }
    } catch {
      // Best-effort: the error return below is the primary contract.
    }
    return { ok: false, error: (error as Error).message };
  }
}
