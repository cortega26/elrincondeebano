import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export interface RecoveryState {
  current_job_id?: string;
  current_step?: string;
  commit_made?: boolean;
  commit_sha?: string;
  staged_paths: string[];
  timestamp: string;
}

export class RecoveryJournal {
  private readonly filePath: string;

  constructor(repoRoot: string) {
    const dir = resolve(repoRoot, 'data');
    mkdirSync(dir, { recursive: true });
    this.filePath = resolve(dir, 'publication-recovery.json');
  }

  save(state: RecoveryState): void {
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), {
      encoding: 'utf-8',
      flush: true,
    });
  }

  load(): RecoveryState | null {
    if (!existsSync(this.filePath)) return null;
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw) as RecoveryState;
    } catch {
      return null;
    }
  }

  clear(): void {
    try {
      const { unlinkSync } = require('node:fs');
      unlinkSync(this.filePath);
    } catch {
      /* ignore */
    }
  }

  hasPendingRecovery(): boolean {
    const state = this.load();
    return state !== null && state.current_job_id !== undefined;
  }
}
