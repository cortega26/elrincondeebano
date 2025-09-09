/**
 * Generate a short correlation ID useful for request tracing.
 * @returns {string} Base36 timestamp plus random segment.
 */
export function createCorrelationId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Log a JSON message to the console with an explicit level.
 * @param {'log'|'info'|'warn'|'error'} level - Console method to invoke.
 * @param {string} message - Human-readable message.
 * @param {object} [meta] - Additional structured data.
 */
export function log(level, message, meta = {}) {
  const entry = { level, message, ...meta };
  const out = JSON.stringify(entry);
  if (typeof console[level] === 'function') {
    console[level](out);
  } else {
    console.log(out);
  }
}
