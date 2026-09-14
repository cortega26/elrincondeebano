import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { resolve } from 'node:path';
import type { ImportPreviewRecord } from '../../shared/schemas/importExport.ts';
import { importPreviewRecordSchema } from '../../shared/schemas/importExport.ts';
import { isSafeId } from '../../shared/identity.ts';

// Plan 180: cap for the preview directory — every preview stores ~4×
// overlapping full catalog copies with no TTL, so unbounded operator use
// grows data/import-previews/ forever.
const MAX_PREVIEW_RECORDS = 50;

// Durable preview records: survives server restart between preview and apply
// (plan 060). Pattern mirrors ChangeSetRepository.
export class PreviewRepository {
  private readonly dir: string;

  constructor(repoRoot: string) {
    this.dir = resolve(repoRoot, 'data', 'import-previews');
    mkdirSync(this.dir, { recursive: true });
  }

  save(preview: ImportPreviewRecord): void {
    if (!isSafeId(preview.id)) return;
    const path = resolve(this.dir, `${preview.id}.json`);
    writeFileSync(path, JSON.stringify(preview, null, 2), { encoding: 'utf-8', flush: true });
    try {
      this.prune();
    } catch {
      // Pruning is best-effort — a full directory must never fail a save.
    }
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

  /** Evict oldest-by-mtime records beyond the cap. Returns evicted count. */
  prune(maxEntries: number = MAX_PREVIEW_RECORDS): number {
    let files: string[];
    try {
      files = readdirSync(this.dir).filter((f) => f.endsWith('.json'));
    } catch {
      return 0;
    }
    if (files.length <= maxEntries) return 0;
    const byMtime = files
      .map((f) => {
        try {
          return { file: f, mtime: statSync(resolve(this.dir, f)).mtimeMs };
        } catch {
          return { file: f, mtime: 0 };
        }
      })
      .sort((a, b) => a.mtime - b.mtime);
    let evicted = 0;
    for (const entry of byMtime.slice(0, byMtime.length - maxEntries)) {
      try {
        unlinkSync(resolve(this.dir, entry.file));
        evicted += 1;
      } catch {
        // Best-effort per file.
      }
    }
    return evicted;
  }

  load(id: string): ImportPreviewRecord | null {
    if (!isSafeId(id)) return null;
    const path = resolve(this.dir, `${id}.json`);
    if (!existsSync(path)) return null;

    try {
      const raw = readFileSync(path, 'utf-8');
      const parsed = JSON.parse(raw);
      const result = importPreviewRecordSchema.safeParse(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }
}
