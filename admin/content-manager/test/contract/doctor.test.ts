import { test, expect } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { runDoctor } from '../../src/server/services/doctor.ts';
import { RecoveryJournal } from '../../src/server/services/recoveryJournal.ts';

function createTempRepo(): string {
  const dir = resolve(tmpdir(), `doctor-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  return dir;
}

test('runDoctor reports recoveryNeeded=false and an ok check with no journal entries', () => {
  const dir = createTempRepo();
  try {
    const report = runDoctor(dir);
    expect(report.recoveryNeeded).toBe(false);
    const check = report.checks.find((c) => c.name === 'recovery-journal');
    expect(check?.status).toBe('ok');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runDoctor reports recoveryNeeded=true when the journal has an unrecovered failure', () => {
  const dir = createTempRepo();
  try {
    const journal = new RecoveryJournal(dir);
    journal.startOperation('atomic-write', 'product_data.json', 'cmd-1');
    journal.failOperation('atomic-write', 'product_data.json', 'cmd-1');

    const report = runDoctor(dir);
    expect(report.recoveryNeeded).toBe(true);
    const check = report.checks.find((c) => c.name === 'recovery-journal');
    expect(check?.status).toBe('error');
    expect(check?.message).toContain('product_data.json');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runDoctor still reports recoveryNeeded=true for a stale .tmp file even with no journal failures', () => {
  const dir = createTempRepo();
  try {
    writeFileSync(resolve(dir, 'data', 'product_data.json.tmp'), '{}');

    const report = runDoctor(dir);
    expect(report.recoveryNeeded).toBe(true);
    const check = report.checks.find((c) => c.name === 'recovery-journal');
    expect(check?.status).toBe('ok');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
