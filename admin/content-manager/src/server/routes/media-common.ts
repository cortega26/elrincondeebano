import type { FastifyInstance } from 'fastify';
import type { Repositories } from './helpers.ts';
import { MediaRepository } from '../repositories/mediaRepository.ts';
import { MediaIntentRepository } from '../repositories/mediaIntentRepository.ts';

// Plan 198: shared context for the media route slices (mediaUploadRoutes /
// mediaIntentRoutes / mediaApplyRoutes). Mirrors the changes-common.ts
// pattern: no barrel, import directly.
export interface MediaRouteContext {
  app: FastifyInstance;
  repos: Repositories;
  media: MediaRepository;
  repoRoot: string;
  intents: MediaIntentRepository;
}

export function createMediaContext(
  app: FastifyInstance,
  repos: Repositories,
  media: MediaRepository,
  repoRoot: string
): MediaRouteContext {
  return { app, repos, media, repoRoot, intents: new MediaIntentRepository(repoRoot) };
}
