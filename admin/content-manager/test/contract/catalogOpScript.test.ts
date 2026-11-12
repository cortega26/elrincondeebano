import { test, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { runCatalogOp } from '../../scripts/catalog-op.ts';

function createCatalogFixture(): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'catalog-op-'));
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  writeFileSync(
    resolve(dir, 'data', 'product_data.json'),
    `${JSON.stringify(
      {
        version: 'test',
        last_updated: '2026-01-01T00:00:00.000Z',
        rev: 5,
        schema_version: 1,
        products: [
          {
            id: 'p1',
            name: 'Café de Grano',
            description: '',
            price: 3000,
            discount: 0,
            stock: true,
            category: 'bebidas',
            image_path: '',
            image_avif_path: '',
            order: 0,
            is_archived: false,
            rev: 1,
            field_last_modified: {},
          },
        ],
      },
      null,
      2
    )}\n`
  );
  return dir;
}

test('--help prints usage and exits 0 (plan 295)', () => {
  const dir = createCatalogFixture();
  try {
    const result = runCatalogOp(['--help'], { repoRoot: dir });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Usage:');
    expect(result.written).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dry-run prints the diff and never touches the file (plan 295)', () => {
  const dir = createCatalogFixture();
  try {
    const path = resolve(dir, 'data', 'product_data.json');
    const before = readFileSync(path, 'utf8');

    const result = runCatalogOp(['edit', '--id', 'p1', '--field', 'price', '--value', '3600'], {
      repoRoot: dir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.written).toBe(false);
    expect(readFileSync(path, 'utf8')).toBe(before);
    const diff = JSON.parse(result.output) as {
      dry_run: boolean;
      before: { price: number };
      after: { price: number; rev: number };
    };
    expect(diff.dry_run).toBe(true);
    expect(diff.before.price).toBe(3000);
    expect(diff.after.price).toBe(3600);
    expect(diff.after.rev).toBe(2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--write persists the edit and seals product and catalog revisions (plan 295)', () => {
  const dir = createCatalogFixture();
  try {
    const path = resolve(dir, 'data', 'product_data.json');
    const result = runCatalogOp(
      ['edit', '--id', 'p1', '--field', 'price', '--value', '3600', '--write'],
      { repoRoot: dir }
    );

    expect(result.exitCode).toBe(0);
    expect(result.written).toBe(true);

    const catalog = JSON.parse(readFileSync(path, 'utf8'));
    expect(catalog.rev).toBe(6);
    expect(catalog.last_updated).not.toBe('2026-01-01T00:00:00.000Z');
    expect(catalog.products[0].price).toBe(3600);
    expect(catalog.products[0].rev).toBe(2);
    expect(catalog.products[0].field_last_modified.price).toMatchObject({
      rev: 2,
      base_rev: 1,
      changeset_id: null,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a discount above the price is rejected without writing (plan 295)', () => {
  const dir = createCatalogFixture();
  try {
    const path = resolve(dir, 'data', 'product_data.json');
    const before = readFileSync(path, 'utf8');

    const result = runCatalogOp(
      ['edit', '--id', 'p1', '--field', 'discount', '--value', '4000', '--write'],
      { repoRoot: dir }
    );

    expect(result.exitCode).toBe(1);
    expect(result.written).toBe(false);
    expect(readFileSync(path, 'utf8')).toBe(before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
