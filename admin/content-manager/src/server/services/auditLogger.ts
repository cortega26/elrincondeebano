import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export interface AuditEntry {
  timestamp: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  command_id?: string;
  outcome: 'success' | 'error' | 'blocked';
  details?: Record<string, unknown>;
}

const REDACTED_FIELDS = new Set([
  'token',
  'password',
  'secret',
  'authorization',
  'cookie',
  'credential',
  'api_key',
  'apikey',
  'private_key',
]);

// Plan 183: field-name matcher — camelCase is split to snake first so
// accessKey redacts while monkey/keyboard/turkey pass through. Bare `key`
// only matches on boundaries; *-key ids over-redact by design (conservative:
// an id is harmless to hide, a key is not harmless to leak). New
// secret-shaped fields must extend this matcher in the same commit that
// introduces them.

export class AuditLogger {
  private readonly logPath: string;

  constructor(repoRoot: string) {
    const dir = resolve(repoRoot, 'logs');
    mkdirSync(dir, { recursive: true });
    this.logPath = resolve(dir, 'audit.ndjson');
  }

  log(entry: AuditEntry): void {
    const redacted = this.redact(entry);
    const line = JSON.stringify(redacted) + '\n';
    try {
      appendFileSync(this.logPath, line, { encoding: 'utf-8', flush: true });
    } catch {
      // Audit logging is best-effort
    }
  }

  private redact(entry: AuditEntry): AuditEntry {
    if (!entry.details) return entry;

    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entry.details)) {
      cleaned[key] = isSensitiveFieldName(key) ? '[REDACTED]' : value;
    }
    return { ...entry, details: cleaned };
  }
}

function isSensitiveFieldName(name: string): boolean {
  const lower = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  if (REDACTED_FIELDS.has(lower)) return true;
  return (
    lower.includes('token') ||
    lower.includes('secret') ||
    lower.includes('password') ||
    lower.includes('credential') ||
    lower === 'key' ||
    lower.endsWith('_key') ||
    lower.startsWith('key_') ||
    lower.includes('_key_')
  );
}
