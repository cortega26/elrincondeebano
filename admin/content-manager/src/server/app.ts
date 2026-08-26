import Fastify from 'fastify';
import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import compress from '@fastify/compress';
import { healthRoute } from './routes/health.ts';
import { productRoutes } from './routes/productRoutes.ts';
import { categoryRoutes } from './routes/categoryRoutes.ts';
import { bootstrapRoute } from './routes/bootstrap.ts';
import { openapiRoute } from './routes/openapi.ts';
import { ProductRepository } from './repositories/productRepository.ts';
import { CategoryRepository } from './repositories/categoryRepository.ts';
import { StorefrontRepository } from './repositories/storefrontRepository.ts';
import { PersistentIdempotencyStore } from './services/persistentIdempotencyStore.ts';
import { RecoveryJournal } from './services/recoveryJournal.ts';
import { ProductService } from '../domain/products/productService.ts';
import { CategoryService } from '../domain/categories/categoryService.ts';
import { HttpError } from '../shared/errors/AppError.ts';
import { isContainedWithin } from '../shared/identity.ts';
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
import { SyncService } from './services/syncService.ts';
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
    // The local Admin is not a long-running public service: close browser
    // keep-alive connections promptly so SIGINT/SIGTERM can finish.
    forceCloseConnections: true,
  };
  if (opts?.logger === false) {
    fastifyOpts.logger = false;
  } else if (opts?.logger && typeof opts.logger === 'object') {
    // Plan 127 F3.2: tests inject a pino options object (level + stream).
    fastifyOpts.logger = opts.logger;
  } else {
    fastifyOpts.logger = { level: 'info' };
  }

  const app = Fastify(fastifyOpts);

  // Plan 092: gzip/deflate responses (API JSON + SPA assets).
  app.register(compress, { threshold: 1024 });

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
  const syncService = new SyncService(repoRoot, syncAdapter, repos);

  const jobRunner = new JobRunner();

  // Plan 097: background auto-sync — polls the queue (push) and pulls remote
  // changes while sync is enabled and not paused. The adapter config is
  // re-read each tick, so enabling/disabling via /sync/config takes effect
  // without a restart.
  const syncTimer = setInterval(async () => {
    if (syncService.isPaused() || !syncAdapter.isConfigured) return;
    try {
      await syncService.processOnce();
      await syncService.pullOnce();
    } catch (err) {
      app.log.error({ err }, 'sync interval failed');
    }
  }, 60_000);
  app.addHook('onClose', async () => {
    clearInterval(syncTimer);
    await jobRunner.shutdown();
  });

  const git = new GitAdapter(repoRoot);

  app.decorate('repos', repos);
  app.decorate('recoveryJournal', recoveryJournal);
  app.decorate('media', media);
  app.decorate('enableWrites', enableWrites);
  app.decorate('launchCredential', launchCredential);

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
      await changesRoutes(instance, repos, changeSets, repoRoot, productService);
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
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.avif': 'image/avif',
      '.gif': 'image/gif',
      '.ico': 'image/x-icon',
    };

    app.get('/*', async (request, reply) => {
      const rawPath = request.url.split('?')[0] ?? '/';
      // Plan 071/audit fix: request.url is raw (percent-encoded) — the SPA
      // emits image srcs with spaces/unicode (e.g. "Nova Clásica 2x14m.webp"),
      // which arrive here encoded; resolve against the decoded path or every
      // image 404s into the SPA fallback.
      let urlPath = rawPath;
      try {
        urlPath = decodeURIComponent(rawPath);
      } catch {
        // Malformed encoding: keep the raw path.
      }
      if (urlPath.startsWith('/api/')) return reply.callNotFound();

      // Plan 090: reject any decoded parent-segment before resolving —
      // resolve() collapses `..` BEFORE a containment check could see it
      // (verified via inject: /assets/%2e%2e/secret.txt resolved to the
      // repo root and served the file).
      if (urlPath.split('/').includes('..')) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Asset not found' },
        });
      }

      if (urlPath.startsWith('/assets/')) {
        // SPA bundles live in dist/web/assets; media images live at the repo
        // root assets/. Resolve in that order so the built app loads while
        // images with spaces/unicode still serve decoded.
        const candidates = [resolve(webDist, `.${urlPath}`), resolve(repoRoot, `.${urlPath}`)];
        for (const assetPath of candidates) {
          // Plan 090: decoded paths must stay inside the serving root —
          // containment by segment, not prefix.
          if (!isContainedWithin(repoRoot, assetPath)) continue;
          if (existsSync(assetPath)) {
            try {
              const ext = assetPath.includes('.') ? `.${assetPath.split('.').pop() ?? ''}` : '';
              const contentType = mimeTypes[ext] ?? 'application/octet-stream';
              const content = readFileSync(assetPath);
              // Plan 092: hashed bundle filenames are immutable; media
              // images are cacheable (revalidated by mtime on deploy).
              const immutable = /-([A-Za-z0-9_-]{8,})\.[a-z0-9]+$/i.test(urlPath);
              return reply
                .header('Content-Type', contentType)
                .header(
                  'Cache-Control',
                  immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=600'
                )
                .send(content);
            } catch {
              return reply
                .status(404)
                .send({ error: { code: 'NOT_FOUND', message: 'Asset not found' } });
            }
          }
        }
        // Never fall back to the SPA for missing assets — a broken image
        // should 404, not return HTML.
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Asset not found' } });
      }

      let filePath = resolve(webDist, urlPath === '/' ? 'index.html' : `.${urlPath}`);
      if (!isContainedWithin(webDist, filePath) || !existsSync(filePath)) {
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

  // Plan 090: central error envelope — HttpError carries its public
  // code/message; everything else is logged with details and answered with a
  // generic message (no operator paths, no stack traces).
  // Plan 127 F3.2: every response carries the request id (Fastify's pino
  // reqId) so operators can correlate UI errors with the server log.
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // Plan 090: central error envelope — HttpError carries its public
  // code/message; everything else is logged (structured, with the request
  // id) and answered with a generic message.
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status < 500) {
      // Fastify internals (e.g. route not found): no internal details.
      return reply.status(status).send({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    }
    request.log.error(
      {
        err,
        route: request.routeOptions?.url ?? request.url,
        req_id: request.id,
      },
      'unhandled error'
    );
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  return app;
}
