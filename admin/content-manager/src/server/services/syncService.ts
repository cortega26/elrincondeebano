import type { SyncAdapter } from '../adapters/syncAdapter.ts';
import type { SyncQueueEntry } from '../repositories/syncQueueRepository.ts';
import { SyncQueueRepository, generateChangesetId } from '../repositories/syncQueueRepository.ts';
import { ConflictRepository } from '../repositories/conflictRepository.ts';
import {
  conflictSchema,
  generateConflictId,
  type Conflict,
} from '../../shared/schemas/conflict.ts';
import type { Repositories } from '../routes/helpers.ts';
import { productSchema, type ProductCatalog } from '../../shared/schemas/product.ts';
import { createHash } from 'node:crypto';

// Durable remote sync engine (plan 064). Python-parity semantics:
// - queue entries with attempts/backoff/terminal state, atomic persistence
// - push: 409/412 -> durable conflict (evidence never dropped)
// - pull: incremental since the last committed catalog revision; the cursor
//   advances only when the catalog write succeeds (exactly-once)
export class SyncService {
  private readonly queue: SyncQueueRepository;
  private readonly conflicts: ConflictRepository;
  private readonly adapter: SyncAdapter;
  private readonly repos: Repositories;
  private paused = false;
  private lastPushResult: { at: string; ok: boolean; error?: string } | null = null;
  private lastPullResult: { at: string; ok: boolean; error?: string } | null = null;

  constructor(repoRoot: string, adapter: SyncAdapter, repos: Repositories) {
    this.queue = new SyncQueueRepository(repoRoot);
    this.conflicts = new ConflictRepository(repoRoot);
    this.adapter = adapter;
    this.repos = repos;
  }

  getQueue(): SyncQueueEntry[] {
    return this.queue.load();
  }

  isPaused(): boolean {
    return this.paused;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  getLastResults(): {
    lastPush: { at: string; ok: boolean; error?: string } | null;
    lastPull: { at: string; ok: boolean; error?: string } | null;
  } {
    return { lastPush: this.lastPushResult, lastPull: this.lastPullResult };
  }

  // ── enqueue (idempotent) ───────────────────────────────────────────────────

  enqueue(
    productId: string,
    baseRev: number,
    fields: Record<string, unknown>,
    snapshot: Record<string, unknown>
  ): boolean {
    if (!this.adapter.isConfigured) return false;
    const entries = this.queue.load();
    // Idempotent enqueue: same product/base_rev/fields is a duplicate.
    const signature = JSON.stringify({ productId, baseRev, fields });
    const exists = entries.some(
      (e) =>
        e.status !== 'synced' &&
        JSON.stringify({ productId: e.product_id, baseRev: e.base_rev, fields: e.fields }) ===
          signature
    );
    if (exists) return false;

    const now = new Date().toISOString();
    const entry: SyncQueueEntry = {
      product_id: productId,
      base_rev: baseRev,
      fields,
      snapshot,
      changeset_id: generateChangesetId(),
      status: 'pending',
      attempts: 0,
      enqueued_at: now,
      next_retry_at: null,
    };
    entries.push(entry);
    this.queue.save(entries);
    return true;
  }

  // ── processing ─────────────────────────────────────────────────────────────

  private retryDelay(attempts: number, pollInterval: number): number {
    const exponent = Math.max(0, Math.min(attempts - 1, 6));
    const initial = Math.max(30, pollInterval);
    return Math.min(initial * 2 ** exponent, 15 * 60);
  }

  async processOnce(): Promise<{ pushed: number; failed: number }> {
    if (this.paused || !this.adapter.isConfigured) return { pushed: 0, failed: 0 };
    if (!this.queue.acquireLock()) return { pushed: 0, failed: 0 };

    try {
      const entries = this.queue.load();
      const now = Date.now();
      let pushed = 0;
      let failed = 0;

      for (const entry of entries) {
        if (entry.status === 'synced') continue;
        const retryTs = entry.next_retry_at ? new Date(entry.next_retry_at).getTime() : 0;
        if (retryTs > now) continue;

        entry.attempts += 1;
        entry.last_attempt = new Date().toISOString();
        const result = await this.adapter.pushChange({
          product_id: entry.product_id,
          base_rev: entry.base_rev,
          fields: entry.fields,
          changeset_id: entry.changeset_id,
        });

        if (result.ok) {
          const body = result.body as
            { product?: Record<string, unknown>; rev?: number } | undefined;
          if (body?.product) {
            // Plan 086: the entry is only synced when the server snapshot
            // also applies locally — a remote ack without a local write must
            // not drop the update (queue evidence preserved for retry).
            const applied = await this.applyServerSnapshot(
              body.product,
              body.rev ?? entry.base_rev,
              entry.product_id,
              `sync-push-${entry.changeset_id}`
            );
            if (!applied) {
              entry.status = 'error';
              entry.last_error = 'Local apply failed after remote ack';
              const config = this.adapter.getConfig();
              entry.next_retry_at = new Date(
                Date.now() + this.retryDelay(entry.attempts, config.poll_interval) * 1000
              ).toISOString();
              failed += 1;
              continue;
            }
          }
          entry.status = 'synced';
          entry.last_error = undefined;
          entry.next_retry_at = null;
          pushed += 1;
        } else if (result.conflicts && result.conflicts.length > 0) {
          // 409/412: durable conflict — the queue evidence is preserved.
          entry.status = 'error';
          entry.last_error = result.error ?? 'Remote conflict';
          entry.next_retry_at = null;
          this.storeConflict(
            entry,
            result.conflicts,
            (result.body as { product?: Record<string, unknown> } | undefined)?.product
          );
          failed += 1;
        } else if (result.retryable) {
          entry.status = 'error';
          entry.last_error = result.error ?? 'Retryable failure';
          const config = this.adapter.getConfig();
          entry.next_retry_at = new Date(
            Date.now() + this.retryDelay(entry.attempts, config.poll_interval) * 1000
          ).toISOString();
          failed += 1;
        } else {
          // Permanent: auth errors, redirects, 4xx non-conflict.
          entry.status = 'error';
          entry.last_error = result.error ?? `Permanent failure (${result.status})`;
          entry.next_retry_at = null;
          failed += 1;
        }
      }

      this.queue.save(entries);
      this.lastPushResult = {
        at: new Date().toISOString(),
        ok: failed === 0,
        error: failed > 0 ? `${failed} entries failed` : undefined,
      };
      return { pushed, failed };
    } finally {
      this.queue.releaseLock();
    }
  }

  private storeConflict(
    entry: SyncQueueEntry,
    remoteConflicts: Array<{
      field: string;
      base_value: unknown;
      local_value: unknown;
      server_value: unknown;
    }>,
    serverProduct?: Record<string, unknown>
  ): void {
    const now = new Date().toISOString();
    const conflict: Conflict = {
      id: generateConflictId(),
      status: 'unresolved',
      entity_type: 'product',
      entity_id: entry.product_id,
      entity_name: String(entry.snapshot['name'] ?? entry.product_id),
      base_revision: entry.base_rev,
      local_snapshot: entry.snapshot,
      server_snapshot: serverProduct ?? {},
      fields: remoteConflicts.map((c) => ({
        field: c.field,
        base_value: c.base_value,
        local_value: c.local_value,
        server_value: c.server_value,
        resolution: 'unresolved',
      })),
      created_at: now,
      updated_at: now,
      retry_count: 0,
      resolution_audit: [],
    };
    const parsed = conflictSchema.safeParse(conflict);
    if (parsed.success) this.conflicts.save(parsed.data);
  }

  // ── pull ───────────────────────────────────────────────────────────────────

  async pullOnce(): Promise<{ applied: number; cursor: number; error?: string }> {
    if (this.paused || !this.adapter.isConfigured) {
      return {
        applied: 0,
        cursor: this.repos.products.loadCatalog().rev,
        error: 'Sync not configured',
      };
    }
    const catalog = this.repos.products.loadCatalog();
    const sinceRev = catalog.rev;
    const result = await this.adapter.pullChanges(sinceRev);

    if (!result.ok) {
      this.lastPullResult = { at: new Date().toISOString(), ok: false, error: result.error };
      return { applied: 0, cursor: sinceRev, error: result.error };
    }

    const body = result.body as { changes: Array<Record<string, unknown>>; to_rev?: number };
    const changes = body.changes ?? [];
    if (changes.length === 0) {
      this.lastPullResult = { at: new Date().toISOString(), ok: true };
      return { applied: 0, cursor: sinceRev };
    }

    let applied = 0;
    let failedApply = 0;
    if (changes.length > 0) {
      // Plan 092: batch the whole pull into one catalog load and one write
      // (was one load + one write per change); all-or-nothing on the write.
      const catalog = this.repos.products.loadCatalog();
      for (const change of changes) {
        const snapshot = change['product_snapshot'] as Record<string, unknown> | undefined;
        if (!snapshot) {
          failedApply += 1;
          continue;
        }
        const productId = change['product_id'] as string | undefined;
        const rev = change['rev'] as number | undefined;
        if (this.mergeSnapshotIntoCatalog(catalog, snapshot, rev ?? sinceRev, productId)) {
          applied += 1;
        } else {
          failedApply += 1;
        }
      }
      if (applied > 0) {
        catalog.rev += 1;
        catalog.last_updated = new Date().toISOString();
        const baseRev = catalog.rev - 1;
        const commandId = `sync-pull-${baseRev}-${createHash('sha256')
          .update(JSON.stringify(changes))
          .digest('hex')
          .slice(0, 16)}`;
        const write = await this.repos.products.writeCatalog(catalog, commandId, baseRev);
        if (!write.ok) {
          applied = 0;
          failedApply = changes.length;
        }
      }
    }

    const ok = failedApply === 0;
    this.lastPullResult = {
      at: new Date().toISOString(),
      ok,
      error: ok ? undefined : `${failedApply} change(s) could not be applied`,
    };
    return {
      applied,
      cursor: this.repos.products.loadCatalog().rev,
      error: ok ? undefined : `${failedApply} change(s) could not be applied`,
    };
  }

  // Merges one server snapshot into an in-memory catalog. Validated against
  // productSchema — a poisoned remote snapshot can never corrupt the
  // canonical catalog (plan 086). The caller owns the single write.
  private mergeSnapshotIntoCatalog(
    catalog: ProductCatalog,
    snapshot: Record<string, unknown>,
    rev: number,
    lookupProductId?: string
  ): boolean {
    const existing = lookupProductId
      ? catalog.products.find((p) => p.id === lookupProductId)
      : undefined;

    if (existing) {
      for (const [field, value] of Object.entries(snapshot)) {
        if (
          field === 'id' ||
          field === 'rev' ||
          field === 'order' ||
          field === 'field_last_modified'
        ) {
          continue;
        }
        (existing as unknown as Record<string, unknown>)[field] = value;
      }
      existing.rev = Math.max(existing.rev, rev);
      return productSchema.safeParse(existing).success;
    }

    const id = lookupProductId ?? String(snapshot['id'] ?? '');
    if (!id) return false;
    const candidate = {
      ...(snapshot as unknown as ProductCatalog['products'][number]),
      id,
      rev: Math.max(0, rev),
      order: catalog.products.length,
      field_last_modified: {},
    };
    if (!productSchema.safeParse(candidate).success) return false;
    catalog.products.push(candidate);
    return true;
  }

  // Upserts a server snapshot into the local catalog with a single
  // revision-guarded write; the catalog revision acts as the pull cursor.
  // Plan 086: the write command id is content-derived (base revision + hash
  // of the snapshot) so distinct pulls never collide in the idempotency
  // store, while an identical retry stays idempotent.
  private async applyServerSnapshot(
    snapshot: Record<string, unknown>,
    rev: number,
    lookupProductId?: string,
    commandId?: string
  ): Promise<boolean> {
    const catalog = this.repos.products.loadCatalog();
    if (!this.mergeSnapshotIntoCatalog(catalog, snapshot, rev, lookupProductId)) return false;

    catalog.rev += 1;
    catalog.last_updated = new Date().toISOString();
    const baseRev = catalog.rev - 1;
    const writeCommandId =
      commandId ??
      `sync-pull-${baseRev}-${createHash('sha256')
        .update(JSON.stringify(snapshot))
        .digest('hex')
        .slice(0, 16)}`;
    const write = await this.repos.products.writeCatalog(catalog, writeCommandId, baseRev);
    return write.ok;
  }
}
