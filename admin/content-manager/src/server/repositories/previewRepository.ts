import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ImportPreviewRecord } from '../../shared/schemas/importExport.ts';
import { importPreviewRecordSchema } from '../../shared/schemas/importExport.ts';
import { isSafeId } from '../../shared/identity.ts';

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
