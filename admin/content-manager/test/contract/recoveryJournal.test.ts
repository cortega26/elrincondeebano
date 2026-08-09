import { test, expect } from 'vitest';
import { rmSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { RecoveryJournal } from '../../src/server/services/recoveryJournal.ts';

test('RecoveryJournal writes and reads entries', () => {
  const dir = resolve(tmpdir(), `rj-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });

  try {
    const journal = new RecoveryJournal(dir);

    journal.startOperation('atomic-write', 'test.json', 'cmd-1');
    journal.completeOperation('atomic-write', 'test.json', 'cmd-1');

    const pending = journal.getPendingRecoveries();
    expect(pending).toHaveLength(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('RecoveryJournal finds pending recoveries', () => {
  const dir = resolve(tmpdir(), `rj-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });

  try {
    const journal = new RecoveryJournal(dir);

    journal.startOperation('atomic-write', 'test.json', 'cmd-1');
    journal.startOperation('atomic-write', 'test2.json', 'cmd-2');
    journal.completeOperation('atomic-write', 'test2.json', 'cmd-2');

    const pending = journal.getPendingRecoveries();
    expect(pending).toHaveLength(1);
    expect(pending[0].targetFile).toBe('test.json');
    expect(pending[0].status).toBe('started');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('RecoveryJournal failOperation marks failure', () => {
  const dir = resolve(tmpdir(), `rj-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });

  try {
    const journal = new RecoveryJournal(dir);

    journal.startOperation('atomic-write', 'test.json', 'cmd-1');
    journal.failOperation('atomic-write', 'test.json', 'cmd-1');

    const pending = journal.getPendingRecoveries();
    expect(pending).toHaveLength(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('RecoveryJournal getUnrecoveredFailures reports a failed write', () => {
  const dir = resolve(tmpdir(), `rj-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });

  try {
    const journal = new RecoveryJournal(dir);

    journal.startOperation('atomic-write', 'product_data.json', 'cmd-1');
    journal.failOperation('atomic-write', 'product_data.json', 'cmd-1');

    const unrecovered = journal.getUnrecoveredFailures();
    expect(unrecovered).toHaveLength(1);
    expect(unrecovered[0].targetFile).toBe('product_data.json');
    expect(unrecovered[0].status).toBe('failed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('RecoveryJournal getUnrecoveredFailures clears once a later write of the same file completes', () => {
  // Empirical check for the exact hazard the advisor flagged: each write
  // gets a fresh commandId, so a failure can only be "superseded" if the
  // lookup is keyed by targetFile alone, not targetFile+commandId.
  const dir = resolve(tmpdir(), `rj-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });

  try {
    const journal = new RecoveryJournal(dir);

    journal.startOperation('atomic-write', 'product_data.json', 'cmd-1');
    journal.failOperation('atomic-write', 'product_data.json', 'cmd-1');
    expect(journal.getUnrecoveredFailures()).toHaveLength(1);

    // A later, different write (fresh commandId) of the same file succeeds.
    journal.startOperation('atomic-write', 'product_data.json', 'cmd-2');
    journal.completeOperation('atomic-write', 'product_data.json', 'cmd-2');

    expect(journal.getUnrecoveredFailures()).toHaveLength(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('RecoveryJournal getUnrecoveredFailures ignores unrelated files', () => {
  const dir = resolve(tmpdir(), `rj-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });

  try {
    const journal = new RecoveryJournal(dir);

    journal.startOperation('atomic-write', 'product_data.json', 'cmd-1');
    journal.completeOperation('atomic-write', 'product_data.json', 'cmd-1');
    journal.startOperation('atomic-write', 'category_registry.json', 'cmd-2');
    journal.failOperation('atomic-write', 'category_registry.json', 'cmd-2');

    const unrecovered = journal.getUnrecoveredFailures();
    expect(unrecovered).toHaveLength(1);
    expect(unrecovered[0].targetFile).toBe('category_registry.json');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('RecoveryJournal handles empty journal', () => {
  const dir = resolve(tmpdir(), `rj-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });

  try {
    const journal = new RecoveryJournal(dir);
    const pending = journal.getPendingRecoveries();
    expect(pending).toHaveLength(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
