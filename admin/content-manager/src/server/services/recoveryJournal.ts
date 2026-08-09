import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface RecoveryEntry {
  timestamp: string;
  operation: string;
  targetFile: string;
  tmpPath?: string;
  backupPath?: string;
  status: 'started' | 'completed' | 'failed';
  commandId?: string;
}

export class RecoveryJournal {
  private readonly journalPath: string;

  constructor(repoRoot: string) {
    this.journalPath = resolve(repoRoot, 'data', 'recovery-journal.ndjson');
  }

  private append(entry: RecoveryEntry): void {
    appendFileSync(this.journalPath, JSON.stringify(entry) + '\n', { encoding: 'utf-8' });
  }

  startOperation(operation: string, targetFile: string, commandId?: string): void {
    this.append({
      timestamp: new Date().toISOString(),
      operation,
      targetFile,
      status: 'started',
      commandId,
    });
  }

  completeOperation(operation: string, targetFile: string, commandId?: string): void {
    this.append({
      timestamp: new Date().toISOString(),
      operation,
      targetFile,
      status: 'completed',
      commandId,
    });
  }

  failOperation(operation: string, targetFile: string, commandId?: string, _error?: string): void {
    this.append({
      timestamp: new Date().toISOString(),
      operation,
      targetFile,
      status: 'failed',
      commandId,
    });
  }

  getPendingRecoveries(): RecoveryEntry[] {
    if (!existsSync(this.journalPath)) {
      return [];
    }

    const lines = readFileSync(this.journalPath, 'utf-8').split('\n').filter(Boolean);
    const entries: RecoveryEntry[] = lines.map((line) => JSON.parse(line) as RecoveryEntry);

    const started = new Set<string>();
    const finished = new Set<string>();

    for (const entry of entries) {
      const key = `${entry.operation}::${entry.targetFile}::${entry.commandId ?? ''}`;
      if (entry.status === 'started') {
        started.add(key);
      } else {
        finished.add(key);
      }
    }

    const pending = entries.filter((entry) => {
      if (entry.status !== 'started') return false;
      const key = `${entry.operation}::${entry.targetFile}::${entry.commandId ?? ''}`;
      return !finished.has(key);
    });

    return pending;
  }

  // Unlike getPendingRecoveries() (crash-mid-write: a 'started' entry with
  // no matching 'completed'/'failed' for the same commandId), this looks
  // for explicit failures that were never superseded by a later successful
  // write of the same file. Each write has a fresh commandId, so a failure
  // is matched against the most recent event for its targetFile, not its
  // own commandId.
  getUnrecoveredFailures(): RecoveryEntry[] {
    if (!existsSync(this.journalPath)) {
      return [];
    }

    const lines = readFileSync(this.journalPath, 'utf-8').split('\n').filter(Boolean);
    const entries: RecoveryEntry[] = lines.map((line) => JSON.parse(line) as RecoveryEntry);

    const lastFailureByFile = new Map<string, number>();
    const lastCompletedIndexByFile = new Map<string, number>();

    entries.forEach((entry, index) => {
      if (entry.status === 'failed') {
        lastFailureByFile.set(entry.targetFile, index);
      } else if (entry.status === 'completed') {
        lastCompletedIndexByFile.set(entry.targetFile, index);
      }
    });

    const unrecovered: RecoveryEntry[] = [];
    for (const [targetFile, failureIndex] of lastFailureByFile) {
      const completedIndex = lastCompletedIndexByFile.get(targetFile);
      if (completedIndex === undefined || completedIndex < failureIndex) {
        unrecovered.push(entries[failureIndex]);
      }
    }
    return unrecovered;
  }
}
