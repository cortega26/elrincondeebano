import { test, expect } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { RecoveryJournal } from '../../src/server/services/publicationRecovery.ts';
import { createApp } from '../../src/server/app.ts';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import type { FastifyInstance } from 'fastify';

function credHeaders(app: FastifyInstance): Record<string, string> {
  const cred = (app as unknown as { launchCredential?: string }).launchCredential ?? '';
  return { [CREDENTIAL_HEADER]: cred };
}

test('Rollback drill: recovery journal detects pending publication after crash', () => {
  const journal = new RecoveryJournal(tmpdir());

  journal.save({
    current_job_id: 'drill-job-1',
    current_step: 'push',
    commit_made: true,
    commit_sha: 'abc123def456',
    staged_paths: ['data/product_data.json'],
    timestamp: new Date().toISOString(),
  });

  expect(journal.hasPendingRecovery()).toBe(true);

  const state = journal.load();
  expect(state).not.toBeNull();
  expect(state!.commit_made).toBe(true);
  expect(state!.commit_sha).toBe('abc123def456');

  journal.clear();
  expect(journal.hasPendingRecovery()).toBe(false);
});

test('Rollback drill: recovery endpoint reports pending state', async () => {
  const dir = resolve(tmpdir(), `cm-drill-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'assets', 'images'), { recursive: true });

  writeFileSync(
    resolve(dir, 'data', 'product_data.json'),
    JSON.stringify({ version: '1', last_updated: '', rev: 0, products: [] })
  );
  writeFileSync(
    resolve(dir, 'data', 'category_registry.json'),
    JSON.stringify({ nav_groups: [], categories: [] })
  );
  writeFileSync(
    resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
    JSON.stringify({
      trustBar: { highlights: [], statusItems: [] },
      home: {
        primaryCategories: [],
        secondaryCategories: [],
        fallbackQuickPicks: [],
        featuredStaples: [],
      },
      bundles: [],
      companionRules: [],
    })
  );

  try {
    // Create a recovery state simulating a failed publication
    const journal = new RecoveryJournal(dir);
    journal.save({
      current_job_id: 'drill-job-2',
      current_step: 'push',
      commit_made: true,
      commit_sha: 'failed-push-sha-123',
      staged_paths: ['data/product_data.json'],
      timestamp: new Date().toISOString(),
    });

    // Start app and check recovery endpoint
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/v1/publications/recovery' });
    expect(res.statusCode).toBe(200);

    const body = res.json<{ pending_recovery: boolean; state: { commit_sha: string } | null }>();
    expect(body.pending_recovery).toBe(true);
    expect(body.state?.commit_sha).toBe('failed-push-sha-123');

    // Clear recovery
    journal.clear();
    const res2 = await app.inject({ method: 'GET', url: '/api/v1/publications/recovery' });
    const body2 = res2.json<{ pending_recovery: boolean }>();
    expect(body2.pending_recovery).toBe(false);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Rollback drill: backup/restore cycle preserves data', async () => {
  const dir = resolve(tmpdir(), `cm-drill-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });

  const originalData = {
    version: 'original',
    last_updated: '',
    rev: 42,
    products: [
      {
        name: 'Drill Product',
        description: '',
        price: 999,
        discount: 0,
        stock: true,
        category: '',
        image_path: '',
        image_avif_path: '',
        order: 0,
        is_archived: false,
        rev: 1,
        field_last_modified: {},
      },
    ],
  };
  writeFileSync(resolve(dir, 'data', 'product_data.json'), JSON.stringify(originalData));

  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    // Create backup
    const backupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/backup',
      payload: {},
      headers: credHeaders(app),
    });
    expect(backupRes.statusCode).toBe(200);
    const backup = backupRes.json<{ backup_id: string; files: string[] }>();
    expect(backup.files.length).toBeGreaterThan(0);

    // Modify data
    writeFileSync(
      resolve(dir, 'data', 'product_data.json'),
      JSON.stringify({ version: 'modified', last_updated: '', rev: 99, products: [] })
    );

    // Restore backup
    const restoreRes = await app.inject({
      method: 'POST',
      url: `/api/v1/backup/${backup.backup_id}/restore`,
      headers: credHeaders(app),
    });
    expect(restoreRes.statusCode).toBe(200);

    // Verify restored data matches original
    const restored = JSON.parse(readFileSync(resolve(dir, 'data', 'product_data.json'), 'utf-8'));
    expect(restored.version).toBe('original');
    expect(restored.rev).toBe(42);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
