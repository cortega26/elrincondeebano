import type { FastifyInstance } from 'fastify';
import compress from '@fastify/compress';
import { healthRoute } from './health.ts';
import { openapiRoute } from './openapi.ts';
import { productRoutes } from './productRoutes.ts';
import { categoryRoutes } from './categoryRoutes.ts';
import { storefrontMutRoutes } from './storefront.ts';
import { bootstrapRoute } from './bootstrap.ts';
import { mediaMutRoutes } from './media.ts';
import { changeSetRoutes } from './changeSetRoutes.ts';
import { importRoutes } from './importRoutes.ts';
import { historyRoutes } from './historyRoutes.ts';
import { conflictsRoutes } from './conflicts.ts';
import { publicationRoutes } from './publication.ts';
import { previewRoutes } from './previewRoutes.ts';
import { backupRoutes } from './backup.ts';
import { diagnosticsRoutes } from './diagnostics.ts';
import { commsRoutes } from './commsRoutes.ts';
import type { Repositories } from './helpers.ts';
import type { ProductService } from '../../domain/products/productService.ts';
import type { CategoryService } from '../../domain/categories/categoryService.ts';
import type { ConflictService } from '../../domain/conflicts/conflictService.ts';
import type { MediaRepository } from '../repositories/mediaRepository.ts';
import type { ChangeSetRepository } from '../repositories/changeSetRepository.ts';
import type { ConflictRepository } from '../repositories/conflictRepository.ts';
import type { PersistentIdempotencyStore } from '../services/persistentIdempotencyStore.ts';
import type { SyncAdapter } from '../adapters/syncAdapter.ts';
import type { SyncService } from '../services/syncService.ts';
import type { JobRunner } from '../services/jobRunner.ts';
import type { ScheduledPublications } from '../services/scheduledPublications.ts';
import type { GitAdapter } from '../adapters/gitAdapter.ts';

// Plan 243: the single route-registration table, extracted from createApp so
// boot (config + lifecycle) and route wiring no longer interleave. The
// registration order here is the contract — it matches createApp's previous
// inline sequence one-to-one.

/** Plan 243: typed wiring the registrations close over. */
export interface AppDeps {
  repoRoot: string;
  enableWrites: boolean;
  repos: Repositories;
  media: MediaRepository;
  changeSets: ChangeSetRepository;
  productService: ProductService;
  categoryService: CategoryService;
  conflictService: ConflictService;
  conflicts: ConflictRepository;
  syncAdapter: SyncAdapter;
  syncConfigPath: string;
  syncService: SyncService;
  jobRunner: JobRunner;
  scheduledPublications: ScheduledPublications;
  idempotencyStore: PersistentIdempotencyStore;
  git: GitAdapter;
}

export function registerRoutes(app: FastifyInstance, deps: AppDeps): void {
  const {
    repoRoot,
    enableWrites,
    repos,
    media,
    changeSets,
    productService,
    categoryService,
    conflictService,
    conflicts,
    syncAdapter,
    syncConfigPath,
    syncService,
    jobRunner,
    scheduledPublications,
    idempotencyStore,
    git,
  } = deps;

  // Plan 092: gzip/deflate responses (API JSON + SPA assets).
  app.register(compress, { threshold: 1024 });

  app.register(healthRoute, { prefix: '/api/v1' });

  app.register(openapiRoute, { prefix: '/api/v1' });

  app.register(
    async function (instance) {
      await productRoutes(instance, repos, productService, syncService, repoRoot);
    },
    { prefix: '/api/v1' }
  );

  app.register(
    async function (instance) {
      await categoryRoutes(instance, repos, productService, categoryService, repoRoot);
    },
    { prefix: '/api/v1' }
  );

  app.register(
    async function (instance) {
      await storefrontMutRoutes(instance, repos);
    },
    { prefix: '/api/v1' }
  );

  app.register(
    async function (instance) {
      await bootstrapRoute(instance, repos);
    },
    { prefix: '/api/v1' }
  );

  app.register(
    async function (instance) {
      await mediaMutRoutes(instance, repos, media, repoRoot);
    },
    { prefix: '/api/v1' }
  );

  app.register(
    async function (instance) {
      await changeSetRoutes(instance, repos, changeSets, repoRoot, productService);
    },
    { prefix: '/api/v1' }
  );

  app.register(
    async function (instance) {
      await importRoutes(instance, repos, changeSets, repoRoot, productService);
    },
    { prefix: '/api/v1' }
  );

  app.register(
    async function (instance) {
      await historyRoutes(instance, repos, changeSets, repoRoot, productService);
    },
    { prefix: '/api/v1' }
  );

  app.register(
    async function (instance) {
      await conflictsRoutes(
        instance,
        conflictService,
        conflicts,
        syncAdapter,
        syncConfigPath,
        syncService
      );
    },
    { prefix: '/api/v1' }
  );

  app.register(
    async function (instance) {
      await publicationRoutes(instance, repos, jobRunner, git, productService, repoRoot, {
        scheduledPublications,
        idempotencyStore,
        enableWrites,
      });
    },
    { prefix: '/api/v1' }
  );

  // Plan 211: build+preview, flag-gated until the follow-up removes the flag.
  if (process.env.PREVIEW_BUILD_ENABLED === '1') {
    app.register(
      async function (instance) {
        await previewRoutes(instance, repoRoot, jobRunner);
      },
      { prefix: '/api/v1' }
    );
  }

  app.register(
    async function (instance) {
      await backupRoutes(instance, repoRoot, enableWrites);
    },
    { prefix: '/api/v1' }
  );

  app.register(
    async function (instance) {
      await diagnosticsRoutes(instance, repoRoot);
    },
    { prefix: '/api/v1' }
  );

  // Plan 217: comunicaciones privadas (data/.comms/, gitignored).
  app.register(
    async function (instance) {
      await commsRoutes(instance, repoRoot);
    },
    { prefix: '/api/v1' }
  );
}
