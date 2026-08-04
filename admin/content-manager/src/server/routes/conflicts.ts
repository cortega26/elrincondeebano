import type { FastifyInstance } from 'fastify';
import type { ConflictService } from '../../domain/conflicts/conflictService.ts';
import type { ConflictRepository } from '../repositories/conflictRepository.ts';
import type { SyncAdapter } from '../adapters/syncAdapter.ts';
import type { ConflictFilter } from '../../shared/schemas/conflict.ts';
import { conflictFilterSchema } from '../../shared/schemas/conflict.ts';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve as pathResolve, dirname } from 'node:path';
import { syncConfigSchema, type SyncConfig } from '../adapters/syncAdapter.ts';

export async function conflictsRoutes(
  app: FastifyInstance,
  conflictService: ConflictService,
  conflicts: ConflictRepository,
  syncAdapter: SyncAdapter,
  syncConfigPath: string
): Promise<void> {
  app.get('/conflicts', async (request, reply) => {
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
    const body = request.body as {
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

  app.get('/sync/status', async () => {
    const config = syncAdapter.getConfig();
    const tokenEnv = process.env.SYNC_API_TOKEN;
    return {
      sync: {
        enabled: config.enabled,
        api_base: config.api_base ?? null,
        token_configured: !!tokenEnv,
        poll_interval: config.poll_interval,
        pull_interval: config.pull_interval,
      },
      capabilities: {
        push: 'not_implemented',
        pull: 'not_implemented',
      },
    };
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

      if (validated.api_base && !validated.api_base.startsWith('https://')) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'api_base must use HTTPS for remote hosts (https://…)',
          },
        });
      }

      const dir = dirname(syncConfigPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(syncConfigPath, JSON.stringify(validated, null, 2), {
        encoding: 'utf-8',
        flush: true,
      });

      return reply.status(200).send(validated);
    } catch (err) {
      return reply.status(500).send({
        error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
      });
    }
  });

  app.post('/sync/now', async (request, reply) => {
    const result = await syncAdapter.pushChanges({});

    return reply.status(result.status).send({
      ok: result.ok,
      status: result.status,
      body: result.body,
      message: result.ok ? 'Sync triggered' : 'Sync not available — see contract',
    });
  });
}
