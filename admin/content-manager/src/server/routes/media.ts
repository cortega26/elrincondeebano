import type { FastifyInstance } from 'fastify';
import type { Repositories } from './helpers.ts';
import { MediaRepository } from '../repositories/mediaRepository.ts';
import { createMediaContext } from './media-common.ts';
import { registerMediaUploadRoutes } from './mediaUploadRoutes.ts';
import { registerMediaIntentRoutes } from './mediaIntentRoutes.ts';
import { registerMediaApplyRoutes } from './mediaApplyRoutes.ts';

// Plan 198: thin registrar — the upload/intent/apply slices live in
// mediaUploadRoutes / mediaIntentRoutes / mediaApplyRoutes (move-only
// split; the apply promote/rollback pairing stays in one module).
// app.ts registration is unchanged.
export async function mediaMutRoutes(
  app: FastifyInstance,
  repos: Repositories,
  media: MediaRepository,
  repoRoot: string
): Promise<void> {
  const ctx = createMediaContext(app, repos, media, repoRoot);
  await registerMediaUploadRoutes(ctx);
  await registerMediaIntentRoutes(ctx);
  await registerMediaApplyRoutes(ctx);
}
