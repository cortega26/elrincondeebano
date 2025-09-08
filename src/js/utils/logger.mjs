export function createCorrelationId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function log(level, message, meta = {}) {
  const entry = { level, message, ...meta };
  const out = JSON.stringify(entry);
  if (typeof console[level] === 'function') {
    console[level](out);
  } else {
    console.log(out);
  }
}
