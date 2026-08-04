import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ChangeSet } from '../../shared/schemas/changeSet.ts';
import { changeSetSchema } from '../../shared/schemas/changeSet.ts';

export class ChangeSetRepository {
  private readonly dir: string;

  constructor(repoRoot: string) {
    this.dir = resolve(repoRoot, 'data', 'change-sets');
    mkdirSync(this.dir, { recursive: true });
  }

  save(cs: ChangeSet): void {
    const path = resolve(this.dir, `${cs.id}.json`);
    writeFileSync(path, JSON.stringify(cs, null, 2), { encoding: 'utf-8', flush: true });
  }

  load(id: string): ChangeSet | null {
    const path = resolve(this.dir, `${id}.json`);
    if (!existsSync(path)) return null;

    try {
      const raw = readFileSync(path, 'utf-8');
      const parsed = JSON.parse(raw);
      const result = changeSetSchema.safeParse(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }

  listAll(): ChangeSet[] {
    const items: ChangeSet[] = [];
    try {
      for (const entry of readdirSync(this.dir)) {
        if (!entry.endsWith('.json')) continue;
        const id = entry.slice(0, -5);
        const cs = this.load(id);
        if (cs) items.push(cs);
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
