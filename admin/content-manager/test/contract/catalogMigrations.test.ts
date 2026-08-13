import { test, expect } from 'vitest';
import {
  migrateCatalog,
  type CatalogMigration,
} from '../../src/server/services/catalogMigrations.ts';

// Plan 127 F2.2: the migration registry — sequential upgrades, idempotency
// via the version marker, and in-memory application for the loadCatalog hook.

const baseCatalog = (): Record<string, unknown> => ({
  version: 'v1',
  last_updated: '2026-01-01T00:00:00.000Z',
  rev: 3,
  products: [],
});

test('catalog without schema_version is treated as v1 and not migrated', () => {
  const { migrated, version } = migrateCatalog(baseCatalog());
  expect(migrated).toBe(false);
  expect(version).toBe(1);
  // The field stays absent — productCatalogSchema's default(1) covers it.
});

test('sequential migration 0 -> 1 runs exactly once', () => {
  const fake: CatalogMigration[] = [
    {
      from: 0,
      migrate: (catalog) => {
        catalog.migrated_marker = 'yes';
      },
    },
  ];
  const input = { ...baseCatalog(), schema_version: 0 };
  const first = migrateCatalog(input, fake);
  expect(first.migrated).toBe(true);
  expect(first.version).toBe(1);
  expect(first.catalog.migrated_marker).toBe('yes');

  // Idempotent: a second pass is a no-op.
  const second = migrateCatalog(first.catalog, fake);
  expect(second.migrated).toBe(false);
  expect(second.version).toBe(1);
});

test('chained migrations 0 -> 1 -> 2 run in order', () => {
  const fake: CatalogMigration[] = [
    {
      from: 0,
      migrate: (c) => {
        c.step = ['zero'];
      },
    },
    {
      from: 1,
      migrate: (c) => {
        (c.step as string[]).push('one');
      },
    },
  ];
  const { catalog, version, migrated } = migrateCatalog(
    { ...baseCatalog(), schema_version: 0 },
    fake
  );
  expect(migrated).toBe(true);
  expect(version).toBe(2);
  expect(catalog.step).toEqual(['zero', 'one']);
  expect(catalog.schema_version).toBe(2);
});
