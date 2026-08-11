import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { resolve } from 'node:path';
import type { MediaIntent } from '../../shared/schemas/mediaIntent.ts';
import { mediaIntentSchema } from '../../shared/schemas/mediaIntent.ts';
import { isSafeId } from '../../shared/identity.ts';

// Durable media intents (plan 063): survive restart, tolerate corrupt files
// (load returns null), and never hold bytes — staged files are separate.
export class MediaIntentRepository {
  private readonly dir: string;
  readonly stagingRoot: string;

  constructor(repoRoot: string) {
    this.dir = resolve(repoRoot, 'data', 'media-intents');
    this.stagingRoot = resolve(repoRoot, 'data', '.media-staging');
    mkdirSync(this.dir, { recursive: true });
    mkdirSync(this.stagingRoot, { recursive: true });
  }

  save(intent: MediaIntent): void {
    if (!isSafeId(intent.id)) return;
    const path = resolve(this.dir, `${intent.id}.json`);
    writeFileSync(path, JSON.stringify(intent, null, 2), { encoding: 'utf-8', flush: true });
  }

  load(id: string): MediaIntent | null {
    if (!isSafeId(id)) return null;
    const path = resolve(this.dir, `${id}.json`);
    if (!existsSync(path)) return null;
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8'));
      const result = mediaIntentSchema.safeParse(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }

  listAll(): MediaIntent[] {
    const items: MediaIntent[] = [];
    try {
      for (const entry of readdirSafe(this.dir)) {
        if (!entry.endsWith('.json')) continue;
        const intent = this.load(entry.slice(0, -5));
        if (intent) items.push(intent);
      }
    } catch {
      // Empty or unreadable directory
    }
    return items.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  delete(id: string): boolean {
    if (!isSafeId(id)) return false;
    const path = resolve(this.dir, `${id}.json`);
    if (!existsSync(path)) return false;
    try {
      unlinkSync(path);
      return true;
    } catch {
      return false;
    }
  }
}

function readdirSafe(dir: string): string[] {
  return readdirSync(dir) as string[];
}
