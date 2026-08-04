import { test, expect } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { RecoveryJournal } from '../../src/server/services/publicationRecovery.ts';
import { ValidationAdapter } from '../../src/server/adapters/validationAdapter.ts';

test('RecoveryJournal save and load persists state', () => {
  const dir = resolve(tmpdir(), `cm-recov-${Date.now()}`);
  mkdirSync(dir, { recursive: true });

  try {
    const journal = new RecoveryJournal(dir);
    const state = {
      current_job_id: 'job-123',
      current_step: 'push',
      commit_made: true,
      commit_sha: 'abc123',
      staged_paths: ['data/product_data.json'],
      timestamp: new Date().toISOString(),
    };

    journal.save(state);
    const loaded = journal.load();

    expect(loaded).not.toBeNull();
    expect(loaded!.current_job_id).toBe('job-123');
    expect(loaded!.commit_made).toBe(true);
    expect(loaded!.commit_sha).toBe('abc123');
    expect(loaded!.staged_paths).toHaveLength(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('RecoveryJournal.clear removes state', () => {
  const dir = resolve(tmpdir(), `cm-recov-${Date.now()}`);
  mkdirSync(dir, { recursive: true });

  try {
    const journal = new RecoveryJournal(dir);
    journal.save({ current_job_id: 'x', staged_paths: [], timestamp: '' });

    expect(journal.hasPendingRecovery()).toBe(true);

    journal.clear();
    expect(journal.hasPendingRecovery()).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('RecoveryJournal load returns null for missing file', () => {
  const dir = resolve(tmpdir(), `cm-recov-${Date.now()}`);
  mkdirSync(dir, { recursive: true });

  try {
    const journal = new RecoveryJournal(dir);
    expect(journal.load()).toBeNull();
    expect(journal.hasPendingRecovery()).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ValidationAdapter products validation runs', () => {
  const result = new ValidationAdapter().validateProducts(process.cwd());
  expect(result.step).toBe('products-schema');
  expect(['pass', 'fail']).toContain(result.status);
  expect(result.duration_ms).toBeGreaterThanOrEqual(0);
});

test('ValidationAdapter categories validation runs', () => {
  const result = new ValidationAdapter().validateCategories(process.cwd());
  expect(result.step).toBe('categories-schema');
  expect(['pass', 'fail']).toContain(result.status);
});

test('ValidationAdapter storefront validation runs', () => {
  const result = new ValidationAdapter().validateStorefront(process.cwd());
  expect(result.step).toBe('storefront-schema');
  expect(['pass', 'fail']).toContain(result.status);
});

test('ValidationAdapter runAllValidations returns results', async () => {
  const results = await new ValidationAdapter().runAllValidations(process.cwd());
  expect(results.length).toBeGreaterThanOrEqual(3); // At least the 3 schema checks
  for (const r of results) {
    expect(r.step).toBeDefined();
    expect(['pass', 'fail', 'skipped']).toContain(r.status);
  }
});
