// Plan 195: shared undo/redo stack mechanics — session persistence and the
// move-on-success discipline. Extracted verbatim from routes/undo.ts so the
// product and category undo flows obey ONE implementation of the plan-099
// invariant (a failed undo/redo stays retryable; entries move stacks only on
// success). Entry shapes and per-domain constants stay in their own modules,
// which re-export these under their historical names (zero importer churn).
export interface StackRef<T> {
  current: T[];
}

export function loadUndoStack<T>(key: string): T[] {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveUndoStack<T>(key: string, entries: T[], maxLevels: number): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(entries.slice(-maxLevels)));
  } catch {
    // Session storage full/blocked: the in-memory stack still works.
  }
}

/**
 * Runs an operation on the entry popped from `source`. On success the entry
 * is pushed to `target`; on failure it is restored to `source` so the
 * operator can retry — a failed undo/redo must never lose the entry or move
 * it to the opposite stack (where "redo" would re-apply the very change the
 * operator wanted to undo).
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
