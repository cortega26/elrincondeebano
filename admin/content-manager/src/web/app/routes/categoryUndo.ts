// Plan 127 F2.1: undo/redo entries for category operations — record-level
// snapshots (key/slug/nav_group/active/sort_order/display_name/description)
// restored through the batch endpoint. Reuses the moveEntryOnSuccess stack
// semantics from the product undo (plan 099).
import { loadUndoStack, saveUndoStack } from '../undoStack.ts';

// Type alias (not interface) so it keeps the implicit index signature the
// batch client's Record<string, unknown> payloads accept.
export type CategorySnapshot = {
  key: string;
  slug: string;
  display_name?: { default?: string };
  nav_group?: string;
  active?: boolean;
  sort_order?: number;
  description?: string;
};

export interface CategoryUndoEntry {
  op: 'create' | 'update' | 'delete';
  id: string;
  /** Record snapshot to restore (upsert) for update/delete undos. */
  previous?: CategorySnapshot;
  /** Post-update record snapshot — redo upserts this instead of `previous`
   * so an edit is not silently lost (plan 129). Absent on legacy entries
   * persisted before the fix — redo then falls back to `previous`. */
  next?: CategorySnapshot;
  /** Deletes that reassigned products note it — the category record is
   * restored, but the products stay under the reassign target (limitation
   * documented in the plan). */
  reassignedTo?: string;
}

export const CATEGORY_UNDO_KEY = 'cm-category-undo-stack';
export const CATEGORY_REDO_KEY = 'cm-category-redo-stack';

export function buildCategoryUndoEntry(
  op: CategoryUndoEntry['op'],
  id: string,
  snapshots: { previous?: CategorySnapshot; next?: CategorySnapshot; reassignedTo?: string }
): CategoryUndoEntry {
  return { op, id, ...snapshots };
}

// Stack helpers — delegated to the shared implementation (plans 097/099,
// single-sourced in plan 195). Levels stay domain-named.
export const MAX_CATEGORY_UNDO_LEVELS = 20;

export function loadStack(key: string): CategoryUndoEntry[] {
  return loadUndoStack<CategoryUndoEntry>(key);
}

export function saveStack(key: string, entries: CategoryUndoEntry[]): void {
  saveUndoStack(key, entries, MAX_CATEGORY_UNDO_LEVELS);
}

export type { StackRef } from '../undoStack.ts';
export { moveEntryOnSuccess } from '../undoStack.ts';
