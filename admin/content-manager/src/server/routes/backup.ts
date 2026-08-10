import type { FastifyInstance } from 'fastify';
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { uniqueTimestamp } from '../services/uniqueTimestamp.ts';
import { isSafeId } from '../../shared/identity.ts';

const BACKUP_FILES = [
  'data/product_data.json',
  'data/category_registry.json',
  'data/categories.json',
  'astro-poc/src/data/storefront-experience.json',
];

export interface BackupEntry {
  id: string;
  timestamp: string;
  files: Array<{ name: string; size: number }>;
}

export async function backupRoutes(
  app: FastifyInstance,
  repoRoot: string,
  enableWrites: boolean
): Promise<void> {
  const backupsDir = resolve(repoRoot, 'data', 'backups');

  function listBackups(): BackupEntry[] {
    if (!existsSync(backupsDir)) return [];
    const entries: BackupEntry[] = [];
    const dirs = readdirSync(backupsDir, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const backupPath = resolve(backupsDir, d.name);
      const files: Array<{ name: string; size: number }> = [];
      const fileEntries = readdirSync(backupPath, { withFileTypes: true });
      for (const f of fileEntries) {
        if (!f.isFile()) continue;
        const fp = resolve(backupPath, f.name);
        files.push({ name: f.name, size: statSync(fp).size });
      }
      entries.push({ id: d.name, timestamp: d.name, files });
    }
    return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  app.post('/backup', async (_request, reply) => {
    try {
      const timestamp = uniqueTimestamp();
      const backupDir = resolve(backupsDir, timestamp);
      mkdirSync(backupDir, { recursive: true });

      const backedUp: string[] = [];
      for (const file of BACKUP_FILES) {
        const srcPath = resolve(repoRoot, file);
        if (!existsSync(srcPath)) continue;
        const destPath = resolve(backupDir, basename(file));
        copyFileSync(srcPath, destPath);
        backedUp.push(file);
      }

      return {
        backup_id: timestamp,
        files: backedUp,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return reply.status(500).send({
        error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
      });
    }
  });

  app.get('/backup', async () => {
    return { backups: listBackups() };
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
    const backupDir = resolve(backupsDir, id);

    if (!existsSync(backupDir)) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Backup "${id}" not found` },
      });
    }

    try {
      const snapshotTimestamp = uniqueTimestamp();
      const snapshotDir = resolve(backupsDir, `pre-restore-${snapshotTimestamp}`);
      mkdirSync(snapshotDir, { recursive: true });

      for (const file of BACKUP_FILES) {
        const srcPath = resolve(repoRoot, file);
        if (!existsSync(srcPath)) continue;
        const destPath = resolve(snapshotDir, basename(file));
        copyFileSync(srcPath, destPath);
      }

      const restored: string[] = [];
      const backupFiles = readdirSync(backupDir, { withFileTypes: true });
      for (const f of backupFiles) {
        if (!f.isFile()) continue;
        const backupFilePath = resolve(backupDir, f.name);
        const matching = BACKUP_FILES.find((bf) => basename(bf) === f.name);
        if (matching) {
          const targetPath = resolve(repoRoot, matching);
          copyFileSync(backupFilePath, targetPath);
          restored.push(matching);
        }
      }

      return {
        status: 'restored',
        files: restored,
      };
    } catch (err) {
      return reply.status(500).send({
        error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
      });
    }
  });
}
