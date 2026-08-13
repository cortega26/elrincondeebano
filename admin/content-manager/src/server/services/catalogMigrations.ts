// Plan 127 F2.2: catalog schema versioning + migration registry. The
// catalog is the system of record (ADR 0009): shape evolution goes through
// here instead of ad-hoc data edits. Migrations run in loadCatalog BEFORE
// validation, and the migrated catalog is persisted atomically (via the
// repository's AtomicWriter) so the migration is durable and idempotent.

export const CATALOG_SCHEMA_VERSION = 1;

export interface CatalogMigration {
  /** The version this migration upgrades FROM. */
  from: number;
  /** Mutates/returns the catalog for the next shape. */
  migrate(catalog: Record<string, unknown>): Record<string, unknown>;
}

// The built-in registry — append new migrations here as the shape evolves.
// Each entry upgrades from `from` to `from + 1`.
const BUILTIN_MIGRATIONS: CatalogMigration[] = [];

export interface MigrationResult {
  catalog: Record<string, unknown>;
  /** True when at least one migration ran. */
  migrated: boolean;
  /** The catalog's version after migrations. */
  version: number;
}

export function migrateCatalog(
  catalog: unknown,
  registry: CatalogMigration[] = BUILTIN_MIGRATIONS
): MigrationResult {
  if (!catalog || typeof catalog !== 'object') {
    return { catalog: catalog as Record<string, unknown>, migrated: false, version: 1 };
  }

  const record = catalog as Record<string, unknown>;
  const startVersion = typeof record.schema_version === 'number' ? record.schema_version : 1;
  let version = startVersion;
  let migrated = false;

  // Iterate until no migration matches — sequential upgrades only.
  let applied = true;
  while (applied) {
    applied = false;
    for (const migration of registry) {
      if (migration.from === version) {
        record.schema_version = migration.from + 1;
        migration.migrate(record);
        version = migration.from + 1;
        migrated = true;
        applied = true;
      }
    }
  }

  return { catalog: record, migrated, version };
}
