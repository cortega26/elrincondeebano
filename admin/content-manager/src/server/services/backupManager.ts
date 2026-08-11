import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  statSync,
  copyFileSync,
} from 'node:fs';
import { resolve, basename } from 'node:path';
import { selectPrunable, type BackupClass, type BackupEntryMeta } from './backupPolicy.ts';
import { uniqueTimestamp } from './uniqueTimestamp.ts';

// Centralized backup creation/listing/pruning (plan 067 steps 2-3): verified
// creation (hash), atomic metadata index (no per-file stat on the request
// path), explicit prune preview/confirmation, and explicit reconciliation.
export class BackupManager {
  private readonly backupsDir: string;
  private readonly indexPath: string;

  constructor(private readonly repoRoot: string) {
    this.backupsDir = resolve(repoRoot, 'data', 'backups');
    this.indexPath = resolve(repoRoot, 'data', 'backups-index.json');
    mkdirSync(this.backupsDir, { recursive: true });
  }

  // ── index ──────────────────────────────────────────────────────────────────

  loadIndex(): BackupEntryMeta[] {
    if (!existsSync(this.indexPath)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.indexPath, 'utf-8'));
      const entries = Array.isArray(parsed) ? parsed : parsed.backups;
      if (!Array.isArray(entries)) return [];
      return entries.filter(
        (e) =>
          e &&
          typeof e.id === 'string' &&
          typeof e.timestamp === 'string' &&
          (e.backup_class === 'auto' ||
            e.backup_class === 'manual' ||
            e.backup_class === 'pre-restore')
      );
    } catch {
      return [];
    }
  }

  private saveIndex(entries: BackupEntryMeta[]): void {
    const tmp = `${this.indexPath}.tmp`;
    writeFileSync(tmp, JSON.stringify({ backups: entries }, null, 2), {
      encoding: 'utf-8',
      flush: true,
    });
    renameSync(tmp, this.indexPath);
  }

  // ── verified creation ──────────────────────────────────────────────────────

  async createBackup(
    files: string[],
    backupClass: BackupClass,
    reason = 'operator'
  ): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
    try {
      const id = `${backupClass}-${uniqueTimestamp()}`;
      const dir = resolve(this.backupsDir, id);
      mkdirSync(dir, { recursive: true });

      const copied: Array<{ name: string; size: number }> = [];
      for (const file of files) {
        const src = resolve(this.repoRoot, file);
        if (!existsSync(src)) continue;
        const dest = resolve(dir, basename(file));
        copyFileSync(src, dest);
        // Verify: hash of the copy must match the source.
        const hashSrc = createHash('sha256').update(readFileSync(src)).digest('hex');
        const hashDest = createHash('sha256').update(readFileSync(dest)).digest('hex');
        if (hashSrc !== hashDest) {
          rmSync(dir, { recursive: true, force: true });
          return { ok: false, error: `Verificación de backup falló para ${file}` };
        }
        copied.push({ name: basename(file), size: statSize(dest) });
      }

      const entries = this.loadIndex();
      entries.push({
        id,
        backup_class: backupClass,
        timestamp: id.split('-').slice(1).join('-'),
        files: copied,
        reason,
      });
      this.saveIndex(entries);

      // Prune after success; cleanup errors are visible, never fatal.
      const prunable = selectPrunable(entries, this.recoveryReferencedIds());
      if (prunable.length > 0) {
        const pruned = await this.prune(
          prunable.map((p) => p.id),
          false
        );
        if (!pruned.ok) {
          const index = this.loadIndex();
          const entry = index.find((e) => e.id === id);
          if (entry) entry.cleanup_warning = pruned.error;
          this.saveIndex(index);
        }
      }

      return { ok: true, id };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  // ── listing (index-driven, paginated, no sync stat per file) ───────────────

  list(page = 1, limit = 50): { entries: BackupEntryMeta[]; total: number; page: number } {
    const all = this.loadIndex().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const total = all.length;
    const offset = (page - 1) * limit;
    return { entries: all.slice(offset, offset + limit), total, page };
  }

  // ── explicit prune ─────────────────────────────────────────────────────────

  prunePreview(): { prunable: Array<{ id: string; reason: string }> } {
    const prunable = selectPrunable(this.loadIndex(), this.recoveryReferencedIds());
    return { prunable };
  }

  async prune(
    ids: string[],
    requirePreview = true
  ): Promise<{ ok: boolean; pruned: number; error?: string }> {
    const entries = this.loadIndex();
    const byId = new Map(entries.map((e) => [e.id, e]));

    const targets = ids.map((id) => ({ id, entry: byId.get(id) })).filter((t) => t.entry);
    if (requirePreview) {
      const allowed = new Set(
        selectPrunable(entries, this.recoveryReferencedIds()).map((p) => p.id)
      );
      const illegal = targets.filter((t) => !allowed.has(t.id));
      if (illegal.length > 0) {
        return {
          ok: false,
          pruned: 0,
          error: `Los siguientes backups están protegidos y no se pueden eliminar: ${illegal.map((t) => t.id).join(', ')}`,
        };
      }
    }

    let pruned = 0;
    let warning: string | undefined;
    for (const target of targets) {
      const dir = resolve(this.backupsDir, target.id);
      try {
        rmSync(dir, { recursive: true, force: true });
        pruned += 1;
      } catch (err) {
        warning = `No se pudo eliminar ${target.id}: ${(err as Error).message}`;
      }
    }

    const remaining = entries.filter((e) => !ids.includes(e.id));
    this.saveIndex(remaining);
    return { ok: warning === undefined, pruned, error: warning };
  }

  // ── recovery protection ────────────────────────────────────────────────────

  private recoveryReferencedIds(): Set<string> {
    const referenced = new Set<string>();
    try {
      const journalPath = resolve(this.repoRoot, 'data', 'recovery-journal.json');
      if (!existsSync(journalPath)) return referenced;
      const parsed = JSON.parse(readFileSync(journalPath, 'utf-8'));
      const pending = Array.isArray(parsed) ? parsed : (parsed.entries ?? []);
      for (const entry of pending) {
        const path: string | undefined = entry?.backupPath;
        if (path) {
          const id = path.split('/').pop() ?? '';
          if (id) referenced.add(id);
        }
      }
    } catch {
      // Journal unreadable — conservative: nothing referenced.
    }
    return referenced;
  }

  // ── explicit reconciliation (index vs disk drift) ──────────────────────────

  reconcile(): { added: number; removed: number } {
    const index = this.loadIndex();
    const onDisk = new Set(
      readdirSync(this.backupsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    );
    const indexed = new Set(index.map((e) => e.id));

    const removed: BackupEntryMeta[] = [];
    for (const entry of index) {
      if (!onDisk.has(entry.id)) removed.push(entry);
    }
    const added: BackupEntryMeta[] = [];
    for (const id of onDisk) {
      if (!indexed.has(id) && !id.includes('..')) {
        added.push({
          id,
          backup_class: id.startsWith('manual-')
            ? 'manual'
            : id.startsWith('pre-restore-')
              ? 'pre-restore'
              : 'auto',
          timestamp: id.split('-').slice(1).join('-'),
          files: [],
          reason: 'reconciliado desde disco',
        });
      }
    }

    const next = index.filter((e) => !removed.includes(e)).concat(added);
    this.saveIndex(next);
    return { added: added.length, removed: removed.length };
  }
}

function statSize(path: string): number {
  return statSync(path).size;
}
