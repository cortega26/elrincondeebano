export function normalizeMetaValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeMetaValue(item));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        normalizeMetaValue(nestedValue),
      ])
    );
  }

  return value;
}

export function log(level: string, message: string, meta: Record<string, unknown> = {}): void {
  const entry = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(normalizeMetaValue(meta) as Record<string, unknown>),
  });

  const consoleMethod = (console as unknown as Record<string, unknown>)[level];
  if (typeof consoleMethod === 'function') {
    (consoleMethod as (...args: unknown[]) => void)(entry);
    return;
  }

  console.log(entry);
}
