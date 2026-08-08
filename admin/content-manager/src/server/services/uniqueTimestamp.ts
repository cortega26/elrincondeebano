let sequence = 0;

/**
 * ISO timestamp with a monotonic suffix. Plain `toISOString()` truncated to
 * milliseconds collides when two backups happen in the same millisecond
 * (rapid clicks, retries, scheduled+manual overlap); the suffix keeps
 * concurrent callers in this process unique even then.
 */
export function uniqueTimestamp(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  sequence += 1;
  return `${ts}-${sequence}`;
}
