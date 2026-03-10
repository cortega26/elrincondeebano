function normalizeMetaValue(value) {
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
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeMetaValue(nestedValue)])
    );
  }

  return value;
}

export function log(level, message, meta = {}) {
  const entry = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...normalizeMetaValue(meta),
  });

  if (typeof console[level] === 'function') {
    console[level](entry);
    return;
  }

  console.log(entry);
}
