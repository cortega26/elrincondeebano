import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export interface HistoryEntry {
  id: string;
  timestamp: string;
  kind: 'change-set-applied' | 'change-set-discarded' | 'undo' | 'redo';
  change_set_id: string;
  source_change_set_id?: string;
  summary: {
    created?: number;
    updated?: number;
    archived?: number;
    restored?: number;
    product_ids: string[];
  };
  ops: Array<{
    product_id?: string;
    action: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    base_revision?: number;
    resulting_revision?: number;
  }>;
}

const MAX_ENTRIES = 1000;

// Append-only, bounded, restart-safe history log (plan 062 step 4). History
// reads from recorded operations — never reconstructed from current metadata.
export class HistoryRepository {
  private readonly path: string;

  constructor(repoRoot: string) {
    this.path = resolve(repoRoot, 'data', 'history.json');
    mkdirSync(resolve(repoRoot, 'data'), { recursive: true });
  }

  load(): HistoryEntry[] {
    if (!existsSync(this.path)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf-8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  append(entry: HistoryEntry): void {
    const entries = this.load();
    entries.push(entry);
    // Bounded: keep the newest MAX_ENTRIES.
    const trimmed = entries.slice(-MAX_ENTRIES);
    writeFileSync(this.path, JSON.stringify(trimmed, null, 2), {
      encoding: 'utf-8',
      flush: true,
    });
  }
}
