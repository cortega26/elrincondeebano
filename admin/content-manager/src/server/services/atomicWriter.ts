import {
  writeFileSync,
  readFileSync,
  renameSync,
  unlinkSync,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { ProductCatalog } from '../../shared/schemas/product.ts';
import type { RecoveryJournal } from './recoveryJournal.ts';
import { uniqueTimestamp } from './uniqueTimestamp.ts';

export interface WriteResult {
  success: boolean;
  backedUp: boolean;
  verified: boolean;
  error?: string;
}

export class AtomicWriter {
  private readonly targetPath: string;
  private readonly recoveryJournal?: RecoveryJournal;

  constructor(targetPath: string, recoveryJournal?: RecoveryJournal) {
    this.targetPath = targetPath;
    this.recoveryJournal = recoveryJournal;
  }

  write(data: ProductCatalog, commandId?: string, backupCount = 5): WriteResult {
    const tmpPath = `${this.targetPath}.tmp`;
    const backupPath = this.backupPath();
    const fileName = this.targetPath.split('/').pop() ?? 'unknown';

    try {
      this.recoveryJournal?.startOperation('atomic-write', fileName, commandId);

      mkdirSync(dirname(this.targetPath), { recursive: true });

      const json = JSON.stringify(data, null, 2);

      writeFileSync(tmpPath, json, { encoding: 'utf-8', flush: true });

      const written = readFileSync(tmpPath, 'utf-8');
      JSON.parse(written);

      const backedUp = existsSync(this.targetPath);
      if (backedUp) {
        renameSync(this.targetPath, backupPath);
      }

      renameSync(tmpPath, this.targetPath);

      const verified = readFileSync(this.targetPath, 'utf-8');
      JSON.parse(verified);

      this.pruneBackups(backupCount);

      this.recoveryJournal?.completeOperation('atomic-write', fileName, commandId);

      return { success: true, backedUp, verified: true };
    } catch (err) {
      try {
        if (!existsSync(this.targetPath) && existsSync(backupPath)) {
          renameSync(backupPath, this.targetPath);
        }
      } catch {
        /* restoration is best-effort; the journal entry is the fallback */
      }
      this.cleanup();
      this.recoveryJournal?.failOperation('atomic-write', fileName, commandId);

      return {
        success: false,
        backedUp: false,
        verified: false,
        error: (err as Error).message,
      };
    }
  }

  private backupPath(): string {
    return `${this.targetPath}.backup_${uniqueTimestamp()}`;
  }

  private pruneBackups(maxBackups: number): void {
    try {
      const dir = dirname(this.targetPath);
      const prefix = `${this.targetPath.split('/').pop()}.backup_`;

      const backups = readdirSync(dir)
        .filter((f: string) => f.startsWith(prefix))
        .map((f: string) => resolve(dir, f))
        .sort((a: string, b: string) => {
          return statSync(b).mtimeMs - statSync(a).mtimeMs;
        });

      while (backups.length > maxBackups) {
        const oldest = backups.pop();
        if (oldest) {
          try {
            unlinkSync(oldest);
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      // Backup pruning is best-effort
    }
  }

  private cleanup(): void {
    try {
      unlinkSync(`${this.targetPath}.tmp`);
    } catch {
      /* ignore */
    }
  }
}
