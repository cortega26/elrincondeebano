/**
 * Generate a short correlation ID useful for request tracing.
 * @returns {string} Base36 timestamp plus random segment.
 */
export function createCorrelationId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Log a JSON message to the console with an explicit level.
 */
export function log(
  level: 'log' | 'info' | 'warn' | 'error',
  message: string,
  meta: Record<string, unknown> = {}
): void {
  const entry = { level, message, ...meta };
  const out = JSON.stringify(entry);
  if (typeof console[level] === 'function') {
    console[level](out);
  } else {
    console.log(out);
  }
}
