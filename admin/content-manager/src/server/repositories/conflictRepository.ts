import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Conflict, ConflictFilter } from '../../shared/schemas/conflict.ts';
import { conflictSchema } from '../../shared/schemas/conflict.ts';

export class ConflictRepository {
  private readonly dir: string;

  constructor(repoRoot: string) {
    this.dir = resolve(repoRoot, 'data', 'conflicts');
    mkdirSync(this.dir, { recursive: true });
  }

  save(conflict: Conflict): void {
    const path = resolve(this.dir, `${conflict.id}.json`);
    writeFileSync(path, JSON.stringify(conflict, null, 2), { encoding: 'utf-8', flush: true });
  }

  load(id: string): Conflict | null {
    const path = resolve(this.dir, `${id}.json`);
    if (!existsSync(path)) return null;

    try {
      const raw = readFileSync(path, 'utf-8');
      const parsed = JSON.parse(raw);
      const result = conflictSchema.safeParse(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }

  list(filter?: ConflictFilter): Conflict[] {
    const items: Conflict[] = [];
    try {
      for (const entry of readdirSync(this.dir)) {
        if (!entry.endsWith('.json')) continue;
        const id = entry.slice(0, -5);
        const c = this.load(id);
        if (!c) continue;
        if (filter?.status && c.status !== filter.status) continue;
        if (filter?.entity_type && c.entity_type !== filter.entity_type) continue;
        items.push(c);
      }
    } catch {
      // Directory may be empty
    }
    return items.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  delete(id: string): boolean {
    const path = resolve(this.dir, `${id}.json`);
    if (!existsSync(path)) return false;
    try {
      const { unlinkSync } = require('node:fs');
      unlinkSync(path);
      return true;
    } catch {
      return false;
    }
  }
}
