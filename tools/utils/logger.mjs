// Plan 206 slice 4: tiny shared logger for tools/ (~100 raw console sites
// and counting). Level via LOG_LEVEL env (default info), ISO timestamps,
// redaction mirroring astro-poc/src/lib/logger.ts, one JSON line per call
// (machine-readable; grep for `"level":"error"` in CI logs).
//
// Maintenance rule: NEW/edited tools MUST use this logger (no new bare
// console.* in tools/). Mass migration of existing sites is a follow-up.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|token|secret|password|api[-_]?key|session|credential)/i;

function currentLevel() {
  const raw = String(process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return LEVELS[raw] ?? LEVELS.info;
}

function redactValue(key, value) {
  if (SENSITIVE_KEY_PATTERN.test(key)) return '[REDACTED]';
  if (typeof value === 'string' && value.length > 512) return `${value.slice(0, 509)}...`;
  return value;
}

function sanitize(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] = redactValue(key, value);
  }
  return out;
}

function emit(level, message, meta) {
  if (LEVELS[level] < currentLevel()) return;
  const line = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...sanitize(meta),
  });
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message, meta) => emit('debug', message, meta),
  info: (message, meta) => emit('info', message, meta),
  warn: (message, meta) => emit('warn', message, meta),
  error: (message, meta) => emit('error', message, meta),
};
