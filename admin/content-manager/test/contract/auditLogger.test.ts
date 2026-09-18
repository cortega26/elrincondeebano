// Plan 183: audit-log redaction covers credential/key families (exact and
// camelCase/snake forms) while benign lookalikes pass through.
import { test, expect } from 'vitest';
import { AuditLogger } from '../../src/server/services/auditLogger.ts';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

function loggedDetails(
  repoRoot: string,
  details: Record<string, unknown>
): Record<string, unknown> {
  const logger = new AuditLogger(repoRoot);
  logger.log({
    timestamp: new Date().toISOString(),
    action: 'test-action',
    entity_type: 'test',
    outcome: 'success',
    details,
  });
  const lines = readFileSync(resolve(repoRoot, 'logs', 'audit.ndjson'), 'utf-8')
    .trim()
    .split('\n');
  return (JSON.parse(lines[lines.length - 1]) as { details: Record<string, unknown> }).details;
}

function freshRepo(): string {
  const dir = resolve(tmpdir(), `cm-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

test('credential and key families redact in exact, substring, and camelCase forms', () => {
  const dir = freshRepo();
  try {
    const details = loggedDetails(dir, {
      launch_credential: 'SECRET-1',
      api_key: 'SECRET-2',
      accessKey: 'SECRET-3',
      privateKey: 'SECRET-4',
      db_credential: 'SECRET-5',
      apiToken: 'SECRET-6',
      userPassword: 'SECRET-7',
      key: 'SECRET-8',
    });
    for (const value of Object.values(details)) {
      expect(value).toBe('[REDACTED]');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('benign lookalikes pass through unredacted', () => {
  const dir = freshRepo();
  try {
    const details = loggedDetails(dir, {
      monkey: 'banana',
      keyboard: 'qwerty',
      turkey: 'gobble',
      productName: 'Arroz',
      ترکيب: 'unicode-safe',
    });
    expect(details).toEqual({
      monkey: 'banana',
      keyboard: 'qwerty',
      turkey: 'gobble',
      productName: 'Arroz',
      ترکيب: 'unicode-safe',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('entries without details pass through untouched', () => {
  const dir = freshRepo();
  try {
    const logger = new AuditLogger(dir);
    logger.log({
      timestamp: new Date().toISOString(),
      action: 'ping',
      entity_type: 'test',
      outcome: 'success',
    });
    const lines = readFileSync(resolve(dir, 'logs', 'audit.ndjson'), 'utf-8')
      .trim()
      .split('\n');
    const entry = JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
    expect(entry['action']).toBe('ping');
    expect(entry).not.toHaveProperty('details');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
