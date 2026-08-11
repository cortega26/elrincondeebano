import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

// Backup retention policy (plan 067 step 1). Count-based, deterministic,
// class-aware. The newest valid entry per class is always protected; entries
// referenced by pending recovery are protected too.
export type BackupClass = 'auto' | 'manual' | 'pre-restore';

export interface BackupEntryMeta {
  id: string;
  backup_class: BackupClass;
  timestamp: string;
  files: Array<{ name: string; size: number }>;
  reason: string;
  protected_reason?: string;
  cleanup_warning?: string;
}

export const BACKUP_RETENTION: Record<BackupClass, { count: number }> = {
  auto: { count: 10 },
  manual: { count: 20 },
  'pre-restore': { count: 5 },
};

// Returns the entry ids that the policy would prune, newest-first order.
// Never prunes: the newest valid entry per class, or recovery-referenced ids.
export function selectPrunable(
  entries: BackupEntryMeta[],
  recoveryReferencedIds: Set<string> = new Set()
): Array<{ id: string; reason: string }> {
  const prunable: Array<{ id: string; reason: string }> = [];

  for (const entryClass of Object.keys(BACKUP_RETENTION) as BackupClass[]) {
    const classEntries = entries
      .filter((e) => e.backup_class === entryClass)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const newest = classEntries[0];
    for (const entry of classEntries) {
      const isNewestValid = entry === newest;
      const isRecoveryReferenced = recoveryReferencedIds.has(entry.id);
      const isProtected = isNewestValid || isRecoveryReferenced;
      const index = classEntries.indexOf(entry);
      const overLimit = index >= BACKUP_RETENTION[entryClass].count;

      if (isProtected) {
        entry.protected_reason = isRecoveryReferenced
          ? 'referenciado por recovery pendiente'
          : 'punto de recuperación más reciente';
      } else if (overLimit) {
        prunable.push({
          id: entry.id,
          reason: `política ${entryClass} (máx ${BACKUP_RETENTION[entryClass].count})`,
        });
      }
    }
  }

  return prunable;
}

// Bounded pruning for adjacent per-file backups (`<file>.backup_<ts>`),
// shared by the writers (atomicWriter pattern, plan 067 step 2).
export function pruneFileBackups(
  dir: string,
  filePrefix: string,
  maxBackups: number
): { pruned: number; warning?: string } {
  let pruned = 0;
  try {
    const backups = readdirSync(dir)
      .filter((f) => f.startsWith(`${filePrefix}.backup_`))
      .map((f) => resolve(dir, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

    while (backups.length > maxBackups) {
      const oldest = backups.pop();
      if (oldest) {
        try {
          unlinkSync(oldest);
          pruned += 1;
        } catch (err) {
          return { pruned, warning: `No se pudo limpiar ${oldest}: ${(err as Error).message}` };
        }
      }
    }
  } catch (err) {
    return { pruned, warning: `Prune falló: ${(err as Error).message}` };
  }
  return { pruned };
}
