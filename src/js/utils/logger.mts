/**
 * Generate a short correlation ID useful for request tracing.
 * @returns {string} Base36 timestamp plus random segment.
 */
export function createCorrelationId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|token|secret|password|api[-_]?key|session|credential)/i;

function redactIfSensitive(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return '[REDACTED]';
  }
  return value;
}

function sanitizeMetaValue(
  value: unknown,
  keyPath: string[] = [],
  seen: WeakSet<object> = new WeakSet()
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  const currentKey = keyPath.length ? keyPath[keyPath.length - 1] : '';
  const redacted = redactIfSensitive(currentKey, value);
  if (redacted === '[REDACTED]') {
    return redacted;
  }

  if (typeof value === 'string') {
    return value.length > 512 ? `${value.slice(0, 509)}...` : value;
  }
  if (typeof value !== 'object') {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }

  if (seen.has(value as object)) {
    return '[Circular]';
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetaValue(item, keyPath, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    out[key] = sanitizeMetaValue(nested, [...keyPath, key], seen);
  }
  return out;
}

export function sanitizeLogMeta(meta: Record<string, unknown> = {}): Record<string, unknown> {
  const sanitized = sanitizeMetaValue(meta);
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    return {};
  }
  return sanitized as Record<string, unknown>;
}

/**
 * Log a JSON message to the console with an explicit level.
 */
export function log(
  level: 'log' | 'info' | 'warn' | 'error',
  message: string,
  meta: Record<string, unknown> = {}
): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...sanitizeLogMeta(meta),
  };
  const out = JSON.stringify(entry);
  if (typeof console[level] === 'function') {
    console[level](out);
  } else {
    console.log(out);
  }
}
