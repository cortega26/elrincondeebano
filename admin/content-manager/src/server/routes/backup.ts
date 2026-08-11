import type { FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { isSafeId } from '../../shared/identity.ts';
import { BackupManager } from '../services/backupManager.ts';

const BACKUP_FILES = [
  'data/product_data.json',
  'data/category_registry.json',
  'data/categories.json',
  'astro-poc/src/data/storefront-experience.json',
];

export async function backupRoutes(
  app: FastifyInstance,
  repoRoot: string,
  enableWrites: boolean
): Promise<void> {
  const manager = new BackupManager(repoRoot);

  app.post('/backup', async (_request, reply) => {
    // Plan 067 step 2: verified creation with policy-driven pruning.
    const created = await manager.createBackup(BACKUP_FILES, 'manual', 'manual');
    if (!created.ok) {
      return reply.status(500).send({
        error: { code: 'INTERNAL_ERROR', message: created.error },
      });
    }
    return {
      backup_id: created.id,
      timestamp: new Date().toISOString(),
      files: BACKUP_FILES.filter((f) => existsSync(resolve(repoRoot, f))),
    };
  });

  // Index-driven, paginated listing — no synchronous per-file stat.
  app.get('/backup', async (request) => {
    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    return { backups: manager.list(page, limit) };
  });

  app.post('/backup/prune-preview', async () => {
    return manager.prunePreview();
  });

  app.post('/backup/prune', async (request, reply) => {
    const body = request.body as { ids?: string[] };
    if (!body?.ids || !Array.isArray(body.ids)) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Expected { ids: [...] }' },
      });
    }
    if (body.ids.some((id) => !isSafeId(id))) {
      return reply.status(400).send({
        error: { code: 'INVALID_ID', message: 'Invalid backup id' },
      });
    }
    const result = await manager.prune(body.ids);
    if (!result.ok && result.pruned === 0) {
      return reply.status(409).send({
        error: { code: 'PROTECTED_BACKUP', message: result.error ?? 'Prune rejected' },
      });
    }
    return { status: 'pruned', pruned: result.pruned, warning: result.error ?? null };
  });

  app.post('/backup/reconcile', async () => {
    const result = manager.reconcile();
    return { status: 'reconciled', added: result.added, removed: result.removed };
  });

  app.post('/backup/:id/restore', async (request, reply) => {
    // Restore overwrites canonical data files; enforce write mode here as
    // defense in depth in addition to the central preHandler gate.
    if (!enableWrites) {
      return reply.status(405).send({
        error: { code: 'READ_ONLY', message: 'Write operations are disabled in read-only mode' },
      });
    }

    const { id } = request.params as { id: string };
    if (!isSafeId(id)) {
      return reply.status(400).send({
        error: { code: 'INVALID_ID', message: `Invalid backup id "${id}"` },
      });
    }
    const backupDir = resolve(repoRoot, 'data', 'backups', id);

    if (!existsSync(backupDir)) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Backup "${id}" not found` },
      });
    }

    try {
      // Pre-restore snapshot goes through the same verified, pruned pipeline.
      const snapshot = await manager.createBackup(
        BACKUP_FILES,
        'pre-restore',
        `before-restore-${id}`
      );
      if (!snapshot.ok) {
        return reply.status(500).send({
          error: { code: 'INTERNAL_ERROR', message: snapshot.error },
        });
      }

      for (const file of BACKUP_FILES) {
        const srcPath = resolve(repoRoot, file);
        if (!existsSync(srcPath)) continue;
        const backupFile = resolve(backupDir, file.split('/').pop() ?? '');
        if (!existsSync(backupFile)) continue;
        const { copyFileSync } = await import('node:fs');
        copyFileSync(backupFile, srcPath);
      }

      return {
        status: 'restored',
        backup_id: id,
        pre_restore_snapshot: snapshot.id,
      };
    } catch (err) {
      return reply.status(500).send({
        error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
      });
    }
  });
}
