import type { FastifyInstance } from 'fastify';
import type { ConflictService } from '../../domain/conflicts/conflictService.ts';
import type { ConflictRepository } from '../repositories/conflictRepository.ts';
import type { SyncAdapter } from '../adapters/syncAdapter.ts';
import type { ConflictFilter } from '../../shared/schemas/conflict.ts';
import { conflictFilterSchema } from '../../shared/schemas/conflict.ts';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { syncConfigSchema, isAllowedSyncUrl, type SyncConfig } from '../adapters/syncAdapter.ts';
import type { SyncService } from '../services/syncService.ts';
import { isSafeId } from '../../shared/identity.ts';
import { HttpError } from '../../shared/errors/AppError.ts';

let activeSseConnections = 0;
const MAX_SSE_CONNECTIONS = 2;

export async function conflictsRoutes(
  app: FastifyInstance,
  conflictService: ConflictService,
  conflicts: ConflictRepository,
  syncAdapter: SyncAdapter,
  syncConfigPath: string,
  syncService: SyncService
): Promise<void> {
  app.get('/conflicts', async (request, _reply) => {
    const query = request.query as Record<string, string>;

    const filterResult = conflictFilterSchema.safeParse({
      status: query.status,
      entity_type: query.entity_type,
    });

    const filter: ConflictFilter = filterResult.success ? filterResult.data : {};

    const items = conflicts.list(Object.keys(filter).length > 0 ? filter : undefined);

    const statusCounts = { unresolved: 0, retrying: 0, resolved: 0, failed: 0 };
    for (const c of items) {
      if (c.status in statusCounts) {
        statusCounts[c.status as keyof typeof statusCounts] += 1;
      }
    }

    return {
      conflicts: items,
      summary: {
        ...statusCounts,
        total: items.length,
      },
    };
  });

  app.post('/conflicts/:id/resolve', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!isSafeId(id)) {
      return reply.status(400).send({
        error: { code: 'INVALID_ID', message: `Invalid conflict id "${id}"` },
      });
    }
    const body = (request.body ?? {}) as {
      field?: string;
      resolution?: 'local' | 'server' | 'manual';
      manual_value?: unknown;
    };

    if (!body.field || !body.resolution) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'field and resolution are required' },
      });
    }

    if (!['local', 'server', 'manual'].includes(body.resolution)) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'resolution must be local, server, or manual' },
      });
    }

    const conflict = conflicts.load(id);
    if (!conflict) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Conflict not found' },
      });
    }

    if (conflict.status === 'resolved') {
      return reply.status(409).send({
        error: { code: 'CONFLICT', message: 'Conflict is already resolved' },
      });
    }

    const result = conflictService.resolveField(
      conflict,
      body.field,
      body.resolution,
      body.manual_value
    );

    if (!result.ok) {
      return reply.status(409).send({
        error: { code: 'CONFLICT', message: result.error },
      });
    }

    conflicts.save(conflict);
    return conflict;
  });

  app.post('/conflicts/:id/retry', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!isSafeId(id)) {
      return reply.status(400).send({
        error: { code: 'INVALID_ID', message: `Invalid conflict id "${id}"` },
      });
    }

    const conflict = conflicts.load(id);
    if (!conflict) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Conflict not found' },
      });
    }

    if (conflict.status === 'resolved') {
      return reply.status(409).send({
        error: { code: 'CONFLICT', message: 'Cannot retry a resolved conflict' },
      });
    }

    const result = conflictService.retry(conflict);

    if (!result.ok) {
      return reply.status(409).send({
        error: { code: 'CONFLICT', message: result.error },
      });
    }

    conflicts.save(conflict);
    return conflict;
  });

  const buildSyncStatus = (): Record<string, unknown> => {
    const config = syncAdapter.getConfig();
    const tokenEnv = process.env.SYNC_API_TOKEN;
    const queue = syncService.getQueue();
    const counts = {
      pending: queue.filter((e) => e.status === 'pending').length,
      synced: queue.filter((e) => e.status === 'synced').length,
      error: queue.filter((e) => e.status === 'error').length,
      total: queue.length,
    };
    const nextAttempt = queue
      .map((e) => (e.next_retry_at ? new Date(e.next_retry_at).getTime() : null))
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b)[0];
    const results = syncService.getLastResults();
    return {
      sync: {
        enabled: config.enabled,
        api_base: config.api_base ?? null,
        token_configured: !!tokenEnv,
        poll_interval: config.poll_interval,
        pull_interval: config.pull_interval,
        paused: syncService.isPaused(),
        queue: counts,
        next_attempt: nextAttempt ? new Date(nextAttempt).toISOString() : null,
        last_push: results.lastPush,
        last_pull: results.lastPull,
      },
      capabilities: {
        push: 'implemented',
        pull: 'implemented',
      },
    };
  };

  app.get('/sync/status', async () => {
    return buildSyncStatus();
  });

  // Plan 127 F3.4: SSE stream for the sync status — the panel subscribes
  // here instead of polling every 30s. The server pushes the status every
  // 5s (cheap single-user) plus a heartbeat comment to keep the connection
  // alive; the client falls back to polling on error.
  app.get('/sync/events', async (request, reply) => {
    if (activeSseConnections >= MAX_SSE_CONNECTIONS) {
      return reply.status(429).send({
        error: { code: 'SSE_CONNECTIONS_LIMITED', message: 'Too many concurrent SSE connections' },
      });
    }
    activeSseConnections += 1;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write('retry: 5000\n\n');

    const send = (): void => {
      reply.raw.write(`data: ${JSON.stringify(buildSyncStatus())}\n\n`);
    };

    send();
    const pushTimer = setInterval(send, 5_000);
    const heartbeat = setInterval(() => {
      reply.raw.write(': ping\n\n');
    }, 25_000);

    let closed = false;
    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      clearInterval(pushTimer);
      clearInterval(heartbeat);
      activeSseConnections -= 1;
    };
    request.raw.on('close', cleanup);
    reply.raw.on('close', cleanup);

    return reply;
  });

  app.put('/sync/config', async (request, reply) => {
    const body = request.body as {
      enabled?: boolean;
      api_base?: string;
      api_token?: string;
      poll_interval?: number;
      pull_interval?: number;
      timeout?: number;
    };

    try {
      let current: SyncConfig = {
        enabled: false,
        poll_interval: 60,
        pull_interval: 300,
        timeout: 10,
      };
      if (existsSync(syncConfigPath)) {
        const raw = readFileSync(syncConfigPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const result = syncConfigSchema.safeParse(parsed);
        if (result.success) current = result.data;
      }

      const merged: Record<string, unknown> = { ...current };
      if (body.enabled !== undefined) merged.enabled = body.enabled;
      if (body.api_base !== undefined) merged.api_base = body.api_base;
      if (body.poll_interval !== undefined) merged.poll_interval = body.poll_interval;
      if (body.pull_interval !== undefined) merged.pull_interval = body.pull_interval;
      if (body.timeout !== undefined) merged.timeout = body.timeout;

      if (body.api_token !== undefined) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'api_token must be set via SYNC_API_TOKEN environment variable, not via API',
          },
        });
      }

      const validation = syncConfigSchema.safeParse(merged);
      if (!validation.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid config',
            details: validation.error.issues,
          },
        });
      }

      const validated = validation.data;

      if (validated.api_base && !isAllowedSyncUrl(validated.api_base)) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'api_base must use HTTPS (or HTTP for localhost/loopback only)',
          },
        });
      }

      const dir = dirname(syncConfigPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const tmpPath = `${syncConfigPath}.tmp`;
      writeFileSync(tmpPath, JSON.stringify(validated, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
        flush: true,
      });
      renameSync(tmpPath, syncConfigPath);

      // Plan 064 step 5: reconfigure the live adapter — no restart needed.
      syncAdapter.setConfig(validated);
      if (!validated.enabled) {
        syncService.setPaused(false);
      }

      return reply.status(200).send(validated);
    } catch (err) {
      throw new HttpError(500, 'INTERNAL_ERROR', 'Internal server error', (err as Error).message);
    }
  });

  app.post('/sync/pause', async (_request, reply) => {
    syncService.setPaused(true);
    return reply.status(200).send({ status: 'paused' });
  });

  app.post('/sync/resume', async (_request, reply) => {
    syncService.setPaused(false);
    return reply.status(200).send({ status: 'resumed' });
  });

  app.post('/sync/now', async (_request, reply) => {
    const pushed = await syncService.processOnce();
    const pulled = await syncService.pullOnce();
    return reply.status(200).send({
      ok: true,
      message: 'Sync completed',
      pushed: pushed.pushed,
      push_failed: pushed.failed,
      pulled: pulled.applied,
      cursor: pulled.cursor,
      pull_error: pulled.error ?? null,
    });
  });
}
