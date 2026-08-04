import type { Conflict } from '../../shared/schemas/conflict.ts';
import { generateConflictId } from '../../shared/schemas/conflict.ts';

export class ConflictService {
  createConflict(params: {
    entity_type: 'product' | 'category' | 'storefront';
    entity_id: string;
    entity_name?: string;
    base_revision: number;
    local_snapshot: Record<string, unknown>;
    server_snapshot: Record<string, unknown>;
    fields: Array<{
      field: string;
      base_value: unknown;
      local_value: unknown;
      server_value: unknown;
    }>;
  }): Conflict {
    const now = new Date().toISOString();

    return {
      id: generateConflictId(),
      status: 'unresolved',
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      entity_name: params.entity_name,
      base_revision: params.base_revision,
      local_snapshot: params.local_snapshot,
      server_snapshot: params.server_snapshot,
      fields: params.fields.map((f) => ({
        field: f.field,
        base_value: f.base_value,
        local_value: f.local_value,
        server_value: f.server_value,
        resolution: 'unresolved' as const,
      })),
      created_at: now,
      updated_at: now,
      retry_count: 0,
      resolution_audit: [],
    };
  }

  resolveField(
    conflict: Conflict,
    field: string,
    resolution: 'local' | 'server' | 'manual',
    manualValue?: unknown
  ): { ok: boolean; error?: string } {
    if (conflict.status === 'resolved') {
      return { ok: false, error: 'Conflict is already resolved' };
    }

    const fieldConflict = conflict.fields.find((f) => f.field === field);
    if (!fieldConflict) {
      return { ok: false, error: `Field "${field}" not found in conflict` };
    }

    const now = new Date().toISOString();

    fieldConflict.resolution = resolution;
    if (resolution === 'manual' && manualValue !== undefined) {
      fieldConflict.manual_value = manualValue;
    }
    fieldConflict.resolved_at = now;

    conflict.resolution_audit.push({
      timestamp: now,
      field,
      from: 'unresolved',
      to: resolution,
    });

    const allResolved = conflict.fields.every((f) => f.resolution !== 'unresolved');
    if (allResolved) {
      conflict.status = 'resolved';
    }

    conflict.updated_at = now;
    return { ok: true };
  }

  retry(conflict: Conflict): { ok: boolean; error?: string } {
    if (conflict.status === 'resolved') {
      return { ok: false, error: 'Cannot retry a resolved conflict' };
    }

    conflict.status = 'retrying';

    // Preserve existing evidence and selections
    // All field resolutions stay as they were

    return { ok: true };
  }

  failRetry(conflict: Conflict, error: string): { ok: boolean; error?: string } {
    if (conflict.status !== 'retrying') {
      return { ok: false, error: 'Cannot mark as failed unless retrying' };
    }

    conflict.status = 'failed';
    conflict.last_error = error;
    conflict.retry_count += 1;
    conflict.updated_at = new Date().toISOString();

    return { ok: true };
  }
}
