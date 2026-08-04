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

const REDACTED_FIELDS = new Set(['token', 'password', 'secret', 'authorization', 'cookie']);

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
      const lower = key.toLowerCase();
      const shouldRedact =
        REDACTED_FIELDS.has(lower) ||
        lower.includes('token') ||
        lower.includes('secret') ||
        lower.includes('password');
      cleaned[key] = shouldRedact ? '[REDACTED]' : value;
    }
    return { ...entry, details: cleaned };
  }
}
