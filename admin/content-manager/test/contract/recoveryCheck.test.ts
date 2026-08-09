import { test, expect } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { RecoveryJournal } from '../../src/server/services/recoveryJournal.ts';
import { checkStartupRecovery } from '../../src/server/services/recoveryCheck.ts';

function createTempRepo(): string {
  const dir = resolve(tmpdir(), `rc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  return dir;
}

test('checkStartupRecovery does not block when there are no unrecovered failures', () => {
  const dir = createTempRepo();
  try {
    const journal = new RecoveryJournal(dir);
    const result = checkStartupRecovery(journal, dir, { enableWrites: true, skipCheck: false });
    expect(result.blocked).toBe(false);
    expect(result.message).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkStartupRecovery blocks operator mode when a write failed and was never recovered', () => {
  const dir = createTempRepo();
  try {
    const journal = new RecoveryJournal(dir);
    journal.startOperation('atomic-write', 'product_data.json', 'cmd-1');
    journal.failOperation('atomic-write', 'product_data.json', 'cmd-1');

    const result = checkStartupRecovery(journal, dir, { enableWrites: true, skipCheck: false });
    expect(result.blocked).toBe(true);
    expect(result.message).toContain('product_data.json');
    expect(result.message).toContain('ADMIN_SKIP_RECOVERY_CHECK');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkStartupRecovery does not block read-only mode, but still reports the message', () => {
  const dir = createTempRepo();
  try {
    const journal = new RecoveryJournal(dir);
    journal.startOperation('atomic-write', 'product_data.json', 'cmd-1');
    journal.failOperation('atomic-write', 'product_data.json', 'cmd-1');

    const result = checkStartupRecovery(journal, dir, { enableWrites: false, skipCheck: false });
    expect(result.blocked).toBe(false);
    expect(result.message).toContain('product_data.json');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkStartupRecovery honors ADMIN_SKIP_RECOVERY_CHECK', () => {
  const dir = createTempRepo();
  try {
    const journal = new RecoveryJournal(dir);
    journal.startOperation('atomic-write', 'product_data.json', 'cmd-1');
    journal.failOperation('atomic-write', 'product_data.json', 'cmd-1');

    const result = checkStartupRecovery(journal, dir, { enableWrites: true, skipCheck: true });
    expect(result.blocked).toBe(false);
    // Still surfaces the message so the operator knows what was bypassed.
    expect(result.message).toContain('product_data.json');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkStartupRecovery lists actual backup file candidates', () => {
  const dir = createTempRepo();
  try {
    writeFileSync(resolve(dir, 'data', 'product_data.json.backup_2026-08-09T00-00-00-000-1'), '{}');
    const journal = new RecoveryJournal(dir);
    journal.startOperation('atomic-write', 'product_data.json', 'cmd-1');
    journal.failOperation('atomic-write', 'product_data.json', 'cmd-1');

    const result = checkStartupRecovery(journal, dir, { enableWrites: true, skipCheck: false });
    expect(result.message).toContain('product_data.json.backup_2026-08-09T00-00-00-000-1');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkStartupRecovery clears once a later write of the same file succeeds', () => {
  const dir = createTempRepo();
  try {
    const journal = new RecoveryJournal(dir);
    journal.startOperation('atomic-write', 'product_data.json', 'cmd-1');
    journal.failOperation('atomic-write', 'product_data.json', 'cmd-1');
    journal.startOperation('atomic-write', 'product_data.json', 'cmd-2');
    journal.completeOperation('atomic-write', 'product_data.json', 'cmd-2');

    const result = checkStartupRecovery(journal, dir, { enableWrites: true, skipCheck: false });
    expect(result.blocked).toBe(false);
    expect(result.message).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
