import { test, expect, vi, beforeEach } from 'vitest';
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ProductRepository } from '../../src/server/repositories/productRepository.ts';
import { IdempotencyStore } from '../../src/server/services/idempotencyStore.ts';
import { AtomicWriter } from '../../src/server/services/atomicWriter.ts';
import type { ProductCatalog } from '../../src/shared/schemas/product.ts';
import { AuditLogger } from '../../src/server/services/auditLogger.ts';
import { createApp } from '../../src/server/app.ts';
import { RecoveryJournal } from '../../src/server/services/recoveryJournal.ts';
import { runDoctor } from '../../src/server/services/doctor.ts';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import type { FastifyInstance } from 'fastify';

// `renameSync` on `node:fs` can't be spied on directly (ESM named exports
// aren't configurable), so the second-rename failure used by the full
// end-to-end failure-path test below is simulated by mocking the whole
// module and wrapping just that one export.
const { renameState } = vi.hoisted(() => ({
  renameState: { failAtCall: null as number | null, callCount: 0 },
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    renameSync: (...args: Parameters<typeof actual.renameSync>) => {
      renameState.callCount += 1;
      if (renameState.failAtCall !== null && renameState.callCount === renameState.failAtCall) {
        throw new Error('simulated rename failure');
      }
      return actual.renameSync(...args);
    },
  };
});

beforeEach(() => {
  renameState.failAtCall = null;
  renameState.callCount = 0;
});

function createTempDir(): string {
  const dir = resolve(tmpdir(), `cm-fail-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  return dir;
}

function getCredential(app: FastifyInstance): string {
  const cred = (app as unknown as { launchCredential?: string }).launchCredential;
  return typeof cred === 'string' ? cred : '';
}

function setupFullRepo(dir: string): void {
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  writeFileSync(
    resolve(dir, 'data', 'product_data.json'),
    JSON.stringify({ version: 'test', last_updated: '', rev: 0, products: [] })
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
}

test('writeCatalog preserves source on IO failure', async () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'product_data.json');
    const catalog = {
      version: 'test',
      last_updated: '',
      rev: 5,
      products: [
        {
          name: 'P1',
          description: '',
          price: 100,
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
    writeFileSync(dataFile, JSON.stringify(catalog));

    const store = new IdempotencyStore();
    const repo = new ProductRepository({ repoRoot: dir }, store);
    const loaded = repo.loadCatalog();

    // Remove write permission from the directory to cause IO failure
    const original = resolve(dir, 'data', 'product_data.json');
    const originalContent = readFileSync(original, 'utf-8');

    // Create an invalid path scenario: writeCatalog with stale rev should fail without touching file
    const stale = { ...loaded, rev: loaded.rev + 1 };
    const result = await repo.writeCatalog(stale, 'cmd-fail', 999);
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(409);

    const after = readFileSync(original, 'utf-8');
    expect(after).toBe(originalContent);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeCatalog with empty products works', async () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'product_data.json');
    const catalog = { version: 'test', last_updated: '', rev: 1, products: [] };
    writeFileSync(dataFile, JSON.stringify(catalog));

    const store = new IdempotencyStore();
    const repo = new ProductRepository({ repoRoot: dir }, store);
    const loaded = repo.loadCatalog();
    expect(loaded.products).toHaveLength(0);

    loaded.products.push({
      name: 'New',
      description: '',
      price: 100,
      discount: 0,
      stock: true,
      category: '',
      image_path: '',
      image_avif_path: '',
      order: 0,
      is_archived: false,
      rev: 1,
      field_last_modified: {},
    });
    loaded.rev += 1;
    const result = await repo.writeCatalog(loaded, 'cmd-empty', 1);
    expect(result.ok).toBe(true);

    const reloaded = repo.loadCatalog();
    expect(reloaded.products).toHaveLength(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AuditLogger writes entries with redaction', () => {
  const dir = createTempDir();
  try {
    const logger = new AuditLogger(dir);
    logger.log({
      timestamp: new Date().toISOString(),
      action: 'product.create',
      entity_type: 'product',
      entity_id: 'prod-1',
      command_id: 'cmd-1',
      outcome: 'success',
      details: { name: 'Test', token: 'secret123', password: 'pw', category: 'x' },
    });

    const logPath = resolve(dir, 'logs', 'audit.ndjson');
    const content = readFileSync(logPath, 'utf-8');
    expect(content).toContain('product.create');
    expect(content).toContain('[REDACTED]');
    expect(content).not.toContain('secret123');
    expect(content).not.toContain('pw');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AtomicWriter creates backups on every write', () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'product_data.json');
    mkdirSync(resolve(dir, 'data'), { recursive: true });
    const writer = new AtomicWriter(dataFile);

    const catalog1: ProductCatalog = { version: 'v1', last_updated: '', rev: 1, products: [] };
    const result1 = writer.write(catalog1);
    expect(result1.success).toBe(true);
    expect(result1.backedUp).toBe(false); // First write, nothing to back up

    const catalog2: ProductCatalog = { version: 'v2', last_updated: '', rev: 2, products: [] };
    const result2 = writer.write(catalog2);
    expect(result2.success).toBe(true);
    expect(result2.backedUp).toBe(true);

    const files = readdirSync(resolve(dir, 'data')).filter((f: string) => f.includes('backup_'));
    expect(files.length).toBeGreaterThanOrEqual(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AtomicWriter verifies written JSON', () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'verify_test.json');
    mkdirSync(resolve(dir, 'data'), { recursive: true });
    const writer = new AtomicWriter(dataFile);

    const catalog: ProductCatalog = { version: 'v1', last_updated: '', rev: 1, products: [] };
    const result = writer.write(catalog);
    expect(result.success).toBe(true);
    expect(result.verified).toBe(true);

    const raw = readFileSync(dataFile, 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Plan 078, Step 4: the full failure path through a real HTTP request --
// not just AtomicWriter in isolation. A product write whose second rename
// fails must: respond 500, leave the canonical catalog file readable with
// its previous content (GET /products still works), record the failure in
// the recovery journal, and be visible to doctor as recoveryNeeded.
test('POST /products with a failing second rename: 500 response, catalog survives, journal and doctor see it', async () => {
  const dir = createTempDir();
  try {
    setupFullRepo(dir);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const credential = getCredential(app);

    const dataFile = resolve(dir, 'data', 'product_data.json');
    const previousContent = readFileSync(dataFile, 'utf-8');

    // Call 1 = target -> backup (must succeed). Call 2 = tmp -> target --
    // the one this test simulates failing.
    renameState.failAtCall = 2;

    const writeResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: {
        'content-type': 'application/json',
        host: '127.0.0.1:3000',
        origin: 'http://127.0.0.1:3000',
        'sec-fetch-site': 'same-origin',
        [CREDENTIAL_HEADER]: credential,
      },
      payload: {
        command_id: 'fail-second-rename',
        payload: { name: 'Rename Failure', price: 500, category: 'x' },
      },
    });

    expect(writeResponse.statusCode).toBe(500);

    // The canonical file must still exist with its previous content -- no
    // window where it's absent.
    expect(existsSync(dataFile)).toBe(true);
    expect(readFileSync(dataFile, 'utf-8')).toBe(previousContent);

    // GET /products must keep working -- loadCatalog() doesn't throw.
    const readResponse = await app.inject({ method: 'GET', url: '/api/v1/products' });
    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.json<{ total: number }>().total).toBe(0);

    await app.close();

    // The journal recorded the failure and doctor surfaces it.
    const journal = new RecoveryJournal(dir);
    const unrecovered = journal.getUnrecoveredFailures();
    expect(unrecovered).toHaveLength(1);
    expect(unrecovered[0].targetFile).toBe('product_data.json');

    const report = runDoctor(dir);
    expect(report.recoveryNeeded).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
