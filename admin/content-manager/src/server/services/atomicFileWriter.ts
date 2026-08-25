import { writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { pruneFileBackups } from './backupPolicy.ts';
import { uniqueTimestamp } from './uniqueTimestamp.ts';

export interface AtomicWriteOptions {
  maxBackups?: number;
  filePrefix?: string;
}

/**
 * Generic atomic JSON writer — tmp + rename + backup + prune.
 * Extracted from categoryRepository.ts:100-133 (plan 152), minus the
 * ProductRepository journal semantics. Accepts any JSON-serializable
 * payload; callers validate before invoking.
 */
export function writeJsonFileAtomic(
  targetPath: string,
  payload: unknown,
  options: AtomicWriteOptions = {},
): void {
  const { maxBackups = 10, filePrefix } = options;
  const tmpPath = `${targetPath}.tmp`;
  const backupPath = `${targetPath}.backup_${uniqueTimestamp()}`;
  const prefix = filePrefix ?? targetPath.split('/').pop() ?? 'unknown';
  const dir = dirname(targetPath);

  try {
    mkdirSync(dir, { recursive: true });
    const json = JSON.stringify(payload, null, 2);
    writeFileSync(tmpPath, json, { encoding: 'utf-8', flush: true });

    if (maxBackups > 0 && existsSync(targetPath)) {
      renameSync(targetPath, backupPath);
    }

    renameSync(tmpPath, targetPath);

    if (maxBackups > 0) {
      pruneFileBackups(dir, prefix, maxBackups);
    }
  } catch (err) {
    try {
      if (!existsSync(targetPath) && existsSync(backupPath)) {
        renameSync(backupPath, targetPath);
      }
    } catch {
      /* restoration is best-effort */
    }
    try {
      unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    throw err;
  }
}
