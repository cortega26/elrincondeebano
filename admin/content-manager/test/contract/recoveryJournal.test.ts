import { test, expect } from 'vitest';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
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
