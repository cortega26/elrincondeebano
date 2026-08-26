import { CREATE_EXTRA_FIELDS, forbiddenOpFields } from '../services/changeSetApplier.ts';
import type {
  ImportPreviewRecord,
  ImportPreviewResponse,
} from '../../shared/schemas/importExport.ts';

// Plan 087: collects every forbidden data key across all product ops of a
// change set (create ops may carry 'id').
export function forbiddenOpFieldsInChangeSet(cs: {
  product_ops: Array<{ action: string; data: Record<string, unknown> }>;
}): string[] {
  const forbidden: string[] = [];
  for (const op of cs.product_ops) {
    const extra = op.action === 'create' ? CREATE_EXTRA_FIELDS : undefined;
    forbidden.push(...forbiddenOpFields(op.data, extra));
  }
  return [...new Set(forbidden)];
}

// Python parity: identity is `normalized_name::normalized_description`
// (import_export_mixin / models.identity_key). Python collapses whitespace
// and casefolds; JS has no casefold, so this matches Python for ASCII names
// and documented-differs for exotic Unicode (plan 060, parity note).
export function normalizeImportIdentity(name: string, description: string): string {
  const norm = (v: string): string =>
    typeof v === 'string' ? v.split(/\s+/).join(' ').trim().toLowerCase() : '';
  return `${norm(name)}::${norm(description)}`;
}

export function productKey(p: { id?: string; name: string; description: string }): string {
  return p.id ? p.id : normalizeImportIdentity(p.name, p.description);
}

export function generatePreviewId(): string {
  return `import-${Date.now()}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
}

export const IMPORT_COMPARE_FIELDS = [
  'name',
  'description',
  'price',
  'discount',
  'stock',
  'category',
  'image_path',
  'image_avif_path',
  'is_archived',
] as const;

export function toPreviewResponse(preview: ImportPreviewRecord): ImportPreviewResponse {
  return {
    preview_id: preview.id,
    input_hash: preview.input_hash,
    base_rev: preview.base_rev,
    summary: {
      additions: preview.additions.length,
      updates: preview.updates.length,
      unchanged: preview.unchanged.length,
      invalid: preview.validation_errors.length,
      conflicts: preview.conflicts.length,
    },
    additions: preview.additions,
    updates: preview.updates,
    conflicts: preview.conflicts,
    validation_errors: preview.validation_errors,
  };
}
