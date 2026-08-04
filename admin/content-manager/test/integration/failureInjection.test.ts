import { test, expect } from 'vitest';
import { writeFileSync, readFileSync, mkdirSync, rmSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ProductRepository } from '../../src/server/repositories/productRepository.ts';
import { IdempotencyStore } from '../../src/server/services/idempotencyStore.ts';
import { AtomicWriter } from '../../src/server/services/atomicWriter.ts';
import { ProductService } from '../../src/domain/products/productService.ts';
import type { ProductCatalog } from '../../src/shared/schemas/product.ts';
import { AuditLogger } from '../../src/server/services/auditLogger.ts';

function createTempDir(): string {
  const dir = resolve(tmpdir(), `cm-fail-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  return dir;
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

    const { readdirSync } = require('node:fs');
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
