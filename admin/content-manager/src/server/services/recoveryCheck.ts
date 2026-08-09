import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RecoveryJournal, RecoveryEntry } from './recoveryJournal.ts';

export interface RecoveryCheckResult {
  blocked: boolean;
  message: string | null;
}

export interface RecoveryCheckOptions {
  enableWrites: boolean;
  skipCheck: boolean;
}

/**
 * Fail-closed startup gate: refuses operator mode when a write failed and
 * was never superseded by a later successful write of the same file,
 * unless ADMIN_SKIP_RECOVERY_CHECK=1. Read-only mode is never blocked --
 * an unrecovered write failure doesn't affect reads any differently than a
 * missing file already would.
 */
export function checkStartupRecovery(
  journal: RecoveryJournal,
  repoRoot: string,
  options: RecoveryCheckOptions
): RecoveryCheckResult {
  const failures = journal.getUnrecoveredFailures();
  if (failures.length === 0) {
    return { blocked: false, message: null };
  }

  const details = failures.map((entry) => describeFailure(entry, repoRoot)).join('\n');
  const message =
    `Unrecovered write failure(s) detected in the recovery journal:\n${details}\n` +
    'Restore the canonical file from one of the backup candidates above, then ' +
    'restart. Set ADMIN_SKIP_RECOVERY_CHECK=1 to bypass this check.';

  return { blocked: options.enableWrites && !options.skipCheck, message };
}

function describeFailure(entry: RecoveryEntry, repoRoot: string): string {
  const dataDir = resolve(repoRoot, 'data');
  let candidates: string[] = [];
  try {
    const prefix = `${entry.targetFile}.backup_`;
    candidates = readdirSync(dataDir).filter((f) => f.startsWith(prefix));
  } catch {
    /* data dir may not exist in a fresh repo; report no candidates */
  }

  const backupList = candidates.length > 0 ? candidates.join(', ') : 'none found in data/';
  return `  - ${entry.targetFile} (operation=${entry.operation}, failed at ${entry.timestamp}); backup candidates: ${backupList}`;
}
