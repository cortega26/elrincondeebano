import Fastify from 'fastify';
import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import { healthRoute } from './routes/health.ts';
import { productRoutes, categoryRoutes } from './routes/catalog.ts';
import { bootstrapRoute } from './routes/bootstrap.ts';
import { ProductRepository } from './repositories/productRepository.ts';
import { CategoryRepository } from './repositories/categoryRepository.ts';
import { StorefrontRepository } from './repositories/storefrontRepository.ts';
import { PersistentIdempotencyStore } from './services/persistentIdempotencyStore.ts';
import { RecoveryJournal } from './services/recoveryJournal.ts';
import { ProductService } from '../domain/products/productService.ts';
import { CategoryService } from '../domain/categories/categoryService.ts';
import { MediaRepository } from './repositories/mediaRepository.ts';
import { ChangeSetRepository } from './repositories/changeSetRepository.ts';
import { mediaMutRoutes } from './routes/media.ts';
import { changesRoutes } from './routes/changes.ts';
import { storefrontMutRoutes } from './routes/storefront.ts';
import { publicationRoutes } from './routes/publication.ts';
import { JobRunner } from './services/jobRunner.ts';
import { GitAdapter } from './adapters/gitAdapter.ts';
import { ConflictService } from '../domain/conflicts/conflictService.ts';
import { ConflictRepository } from './repositories/conflictRepository.ts';
import { conflictsRoutes } from './routes/conflicts.ts';
import { SyncAdapter, syncConfigSchema, type SyncConfig } from './adapters/syncAdapter.ts';
import { backupRoutes } from './routes/backup.ts';
import { diagnosticsRoutes } from './routes/diagnostics.ts';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  generateCredential,
  validateCredential,
  extractCredential,
} from './security/launchCredential.ts';
import { classifyRoute } from './security/routePolicy.ts';

export interface AppOptions {
  repoRoot?: string;
  enableWrites?: boolean;
  logger?: boolean;
  launchCredential?: string;
}

function loadSyncConfig(configPath: string): SyncConfig {
  try {
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const result = syncConfigSchema.safeParse(parsed);
      if (result.success) return result.data;
    }
  } catch {
    /* use defaults */
  }
  return { enabled: false, poll_interval: 60, pull_interval: 300, timeout: 10 };
}

export type { SyncConfig };

export function createApp(opts?: AppOptions): FastifyInstance {
  const repoRoot = opts?.repoRoot ?? process.env.REPO_ROOT ?? process.cwd();
  const enableWrites = opts?.enableWrites ?? false;
  // The launch credential is never served over HTTP (see bootstrap.ts); the
  // operator supplies it via ADMIN_CREDENTIAL or reads it from the startup
  // log (start.ts prints it once in operator mode).
  const launchCredential =
    opts?.launchCredential ?? process.env.ADMIN_CREDENTIAL ?? generateCredential();

  const idempotencyStore = new PersistentIdempotencyStore(repoRoot, 200);
  const productService = new ProductService();
  const categoryService = new CategoryService();

  if (enableWrites) {
    productService.enable();
  }

  const fastifyOpts: FastifyServerOptions = {
    bodyLimit: 20 * 1024 * 1024,
  };
  if (opts?.logger === false) {
    fastifyOpts.logger = false;
  } else {
    fastifyOpts.logger = { level: 'info' };
  }

  const app = Fastify(fastifyOpts);

  // Only ProductRepository is wired to the journal: it's the only
  // repository built on AtomicWriter. CategoryRepository and
  // StorefrontRepository have their own inline write() implementations
  // (see plan 078) and are out of scope for journal wiring.
  const recoveryJournal = new RecoveryJournal(repoRoot);
  const repos = {
    products: new ProductRepository({ repoRoot, recoveryJournal }, idempotencyStore),
    categories: new CategoryRepository({ repoRoot }),
    storefront: new StorefrontRepository({ repoRoot }),
  };

  const media = new MediaRepository({ repoRoot });
  const changeSets = new ChangeSetRepository(repoRoot);
  const conflictService = new ConflictService();
  const conflicts = new ConflictRepository(repoRoot);
  const syncConfigPath = resolve(repoRoot, 'data', 'sync-config.json');
  const syncConfig = loadSyncConfig(syncConfigPath);
  const syncAdapter = new SyncAdapter(syncConfig);

  const jobRunner = new JobRunner();
  const git = new GitAdapter(repoRoot);

  app.decorate('repos', repos);
  app.decorate('recoveryJournal', recoveryJournal);
  app.decorate('media', media);
  app.decorate('enableWrites', enableWrites);
  app.decorate('launchCredential', launchCredential);

  app.register(healthRoute, { prefix: '/api/v1' });

  app.register(
    async function (instance) {
      await productRoutes(instance, repos, productService);
    },
    { prefix: '/api/v1' }
  );

  app.register(
    async function (instance) {
      await categoryRoutes(instance, repos, productService, categoryService);
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
      await changesRoutes(instance, repos, changeSets, repoRoot);
    },
    { prefix: '/api/v1' }
  );

  app.register(
    async function (instance) {
      await conflictsRoutes(instance, conflictService, conflicts, syncAdapter, syncConfigPath);
    },
    { prefix: '/api/v1' }
  );

  app.register(
    async function (instance) {
      await publicationRoutes(instance, repos, jobRunner, git, productService, repoRoot);
    },
    { prefix: '/api/v1' }
  );

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

  app.addHook('preHandler', async (request, reply) => {
    const url = request.url.split('?')[0] ?? '';
    if (url.startsWith('/api/v1/health')) return;

    const routeClass = classifyRoute(request.method, url);

    if (routeClass.class === 'mutation' || routeClass.class === 'preview') {
      if (!enableWrites) {
        return reply.status(405).send({
          error: { code: 'READ_ONLY', message: 'Write operations are disabled in read-only mode' },
        });
      }
    }

    if (routeClass.class === 'mutation') {
      const credential = extractCredential(
        request.headers as Record<string, string | string[] | undefined>
      );
      if (!validateCredential(credential, launchCredential)) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Valid launch credential required for write operations',
          },
        });
      }
    }
  });

  app.addHook('onRequest', async (request, reply) => {
    // Host-header allowlist (DNS rebinding protection): the admin app is a
    // loopback-only control plane, so any other Host is rejected before any
    // origin/method logic runs — including on /health.
    const host = (request.headers.host ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Invalid Host header' },
      });
    }

    const url = request.url.split('?')[0] ?? '';
    if (url === '/api/v1/health') return;

    const method = request.method;
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return;

    const secFetchSite = request.headers['sec-fetch-site'];
    const origin = request.headers['origin'];

    if (secFetchSite === undefined && origin === undefined) return;

    if (secFetchSite !== undefined && secFetchSite !== 'same-origin') {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Cross-site requests are not allowed' },
      });
    }

    if (origin !== undefined) {
      // Use the raw Host header, not request.hostname: Fastify's hostname
      // getter strips the port (and un-brackets IPv6), but a browser's
      // Origin header always includes the port for non-default ports and
      // keeps IPv6 brackets — reconstructing from hostname alone rejected
      // every real same-origin request on any non-default port (this admin
      // app defaults to :3000). The Host header was already validated
      // against the loopback allowlist above, so it's safe to reuse as-is.
      const expectedOrigin = `${request.protocol}://${request.headers.host}`;
      if (origin !== expectedOrigin) {
        return reply.status(403).send({
          error: { code: 'FORBIDDEN', message: 'Invalid origin' },
        });
      }
    }
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
    );
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    return payload;
  });

  const webDist = resolve(repoRoot, 'admin', 'content-manager', 'dist', 'web');
  if (existsSync(webDist)) {
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    };

    app.get('/*', async (request, reply) => {
      const urlPath = request.url.split('?')[0] ?? '/';
      if (urlPath.startsWith('/api/')) return reply.callNotFound();

      if (urlPath.startsWith('/assets/')) {
        const assetPath = resolve(repoRoot, `.${urlPath}`);
        if (existsSync(assetPath)) {
          try {
            const ext = assetPath.includes('.') ? `.${assetPath.split('.').pop() ?? ''}` : '';
            const contentType = mimeTypes[ext] ?? 'application/octet-stream';
            const content = readFileSync(assetPath);
            return reply.header('Content-Type', contentType).send(content);
          } catch {
            return reply
              .status(404)
              .send({ error: { code: 'NOT_FOUND', message: 'Asset not found' } });
          }
        }
      }

      let filePath = resolve(webDist, urlPath === '/' ? 'index.html' : `.${urlPath}`);
      if (!existsSync(filePath)) {
        filePath = resolve(webDist, 'index.html');
      }

      try {
        const ext = filePath.includes('.') ? `.${filePath.split('.').pop() ?? ''}` : '';
        const contentType = mimeTypes[ext] ?? 'application/octet-stream';
        const content = readFileSync(filePath);
        return reply.header('Content-Type', contentType).send(content);
      } catch {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'File not found' } });
      }
    });
  }

  return app;
}
