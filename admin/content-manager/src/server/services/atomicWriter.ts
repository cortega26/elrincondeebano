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

// Plan 108: injectable fs seam for fault-injection tests — production uses
// the real node:fs (default).
export interface AtomicFs {
  mkdirSync: typeof mkdirSync;
  writeFileSync: typeof writeFileSync;
  readFileSync: typeof readFileSync;
  renameSync: typeof renameSync;
  unlinkSync: typeof unlinkSync;
  existsSync: typeof existsSync;
  readdirSync: typeof readdirSync;
  statSync: typeof statSync;
}

export const NODE_FS: AtomicFs = {
  mkdirSync,
  writeFileSync,
  readFileSync,
  renameSync,
  unlinkSync,
  existsSync,
  readdirSync,
  statSync,
};

export class AtomicWriter {
  private readonly targetPath: string;
  private readonly recoveryJournal?: RecoveryJournal;
  private readonly fs: AtomicFs;

  constructor(targetPath: string, recoveryJournal?: RecoveryJournal, fs: AtomicFs = NODE_FS) {
    this.targetPath = targetPath;
    this.recoveryJournal = recoveryJournal;
    this.fs = fs;
  }

  write(data: ProductCatalog, commandId?: string, backupCount = 5): WriteResult {
    const tmpPath = `${this.targetPath}.tmp`;
    const backupPath = this.backupPath();
    const fileName = this.targetPath.split('/').pop() ?? 'unknown';

    try {
      this.recoveryJournal?.startOperation('atomic-write', fileName, commandId);

      this.fs.mkdirSync(dirname(this.targetPath), { recursive: true });

      const json = JSON.stringify(data, null, 2);

      this.fs.writeFileSync(tmpPath, json, { encoding: 'utf-8', flush: true });

      const written = this.fs.readFileSync(tmpPath, 'utf-8');
      JSON.parse(written);

      const backedUp = this.fs.existsSync(this.targetPath);
      if (backedUp) {
        this.fs.renameSync(this.targetPath, backupPath);
      }

      this.fs.renameSync(tmpPath, this.targetPath);

      const verified = this.fs.readFileSync(this.targetPath, 'utf-8');
      JSON.parse(verified);

      this.pruneBackups(backupCount);

      this.recoveryJournal?.completeOperation('atomic-write', fileName, commandId);

      return { success: true, backedUp, verified: true };
    } catch (err) {
      try {
        if (!this.fs.existsSync(this.targetPath) && this.fs.existsSync(backupPath)) {
          this.fs.renameSync(backupPath, this.targetPath);
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

      const backups = this.fs
        .readdirSync(dir)
        .filter((f: string) => f.startsWith(prefix))
        .map((f: string) => resolve(dir, f))
        .sort((a: string, b: string) => {
          return this.fs.statSync(b).mtimeMs - this.fs.statSync(a).mtimeMs;
        });

      while (backups.length > maxBackups) {
        const oldest = backups.pop();
        if (oldest) {
          try {
            this.fs.unlinkSync(oldest);
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
      this.fs.unlinkSync(`${this.targetPath}.tmp`);
    } catch {
      /* ignore */
    }
  }
}
