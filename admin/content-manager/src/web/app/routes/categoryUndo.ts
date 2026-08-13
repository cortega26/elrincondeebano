// Plan 127 F2.1: undo/redo entries for category operations — record-level
// snapshots (key/slug/nav_group/active/sort_order/display_name/description)
// restored through the batch endpoint. Reuses the moveEntryOnSuccess stack
// semantics from the product undo (plan 099).

export interface CategoryUndoEntry {
  op: 'create' | 'update' | 'delete';
  id: string;
  /** Record snapshot to restore (upsert) for update/delete undos. */
  previous?: {
    key: string;
    slug: string;
    display_name?: { default?: string };
    nav_group?: string;
    active?: boolean;
    sort_order?: number;
    description?: string;
  };
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
  previous?: CategoryUndoEntry['previous'],
  reassignedTo?: string
): CategoryUndoEntry {
  return { op, id, previous, reassignedTo };
}

// Stack helpers — same semantics as the product undo (plans 097/099).
export const MAX_CATEGORY_UNDO_LEVELS = 20;

export function loadStack(key: string): CategoryUndoEntry[] {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CategoryUndoEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStack(key: string, entries: CategoryUndoEntry[]): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(entries.slice(-MAX_CATEGORY_UNDO_LEVELS)));
  } catch {
    // Session storage full/blocked: the in-memory stack still works.
  }
}

export interface StackRef<T> {
  current: T[];
}

/**
 * Runs an operation on the entry popped from `source`. On success the entry
 * is pushed to `target`; on failure it is restored to `source` (plan 099
 * semantics — a failed undo must stay retryable).
 */
export async function moveEntryOnSuccess<T>(
  source: StackRef<T>,
  target: StackRef<T>,
  operation: (entry: T) => Promise<void>
): Promise<void> {
  const entry = source.current.pop();
  if (entry === undefined) return;
  try {
    await operation(entry);
    target.current.push(entry);
  } catch (err) {
    source.current.push(entry);
    throw err;
  }
}
