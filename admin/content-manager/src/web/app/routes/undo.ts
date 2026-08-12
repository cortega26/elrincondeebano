export type UndoField = 'price' | 'discount' | 'stock' | 'category';

export interface UndoPatch {
  price?: number;
  discount?: number;
  stock?: boolean;
  category?: string;
}

export interface BulkPreviewChange {
  product_id: string;
  field: string;
  old_value: number | boolean | string;
}

export interface UndoSnapshotProduct {
  id: string;
  price: number;
  discount: number;
  stock: boolean;
  category: string;
}

export interface UndoEntry {
  action: string;
  value: number | boolean | string;
  product_ids: string[];
  perProductOldValues: Array<{
    product_id: string;
    field: UndoField;
    old_value: number | boolean | string;
  }>;
}

const ACTION_FIELD: Record<string, UndoField> = {
  set_discount_percent: 'discount',
  set_discount_fixed: 'discount',
  set_price_delta_percent: 'price',
  set_category: 'category',
  set_stock: 'stock',
};

export interface BuildUndoEntryInput {
  action: string;
  value: number | boolean | string;
  productIds: string[];
  products: UndoSnapshotProduct[];
  preview: BulkPreviewChange[] | null;
}

/**
 * Snapshots the pre-apply value for every targeted product so undo can
 * restore it exactly, whether or not the operator ran a preview first.
 * Preview values are preferred (they reflect the server's own computation);
 * unpreviewed products fall back to the last-loaded list value.
 */
export function buildUndoEntry({
  action,
  value,
  productIds,
  products,
  preview,
}: BuildUndoEntryInput): UndoEntry {
  const field = ACTION_FIELD[action];
  const perProductOldValues: UndoEntry['perProductOldValues'] = [];

  for (const id of productIds) {
    const previewed = preview?.find((c) => c.product_id === id);
    if (previewed) {
      perProductOldValues.push({
        product_id: id,
        field: (previewed.field as UndoField) || field,
        old_value: previewed.old_value,
      });
      continue;
    }
    if (!field) continue;
    const product = products.find((p) => p.id === id);
    if (!product) continue;
    perProductOldValues.push({ product_id: id, field, old_value: product[field] });
  }

  return { action, value, product_ids: [...productIds], perProductOldValues };
}

/**
 * Turns a snapshot into concrete per-product updates against *current*
 * revisions (fetched fresh by the caller right before undo) — never the
 * possibly-stale revisions cached from the last list load.
 */
export function computeUndoActions(
  entry: UndoEntry,
  currentProducts: Array<{ id: string; rev: number }>
): Array<{ id: string; rev: number; patch: UndoPatch }> {
  const actions: Array<{ id: string; rev: number; patch: UndoPatch }> = [];

  for (const item of entry.perProductOldValues) {
    const product = currentProducts.find((p) => p.id === item.product_id);
    if (!product) continue;
    const patch = { [item.field]: item.old_value } as UndoPatch;
    actions.push({ id: item.product_id, rev: product.rev, patch });
  }

  return actions;
}

// ── plan 097: multi-level undo/redo with session persistence ────────────────

export const MAX_UNDO_LEVELS = 20;

export function loadStack(key: string): UndoEntry[] {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UndoEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStack(key: string, entries: UndoEntry[]): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(entries.slice(-MAX_UNDO_LEVELS)));
  } catch {
    // Session storage full/blocked: the in-memory stack still works.
  }
}
