// Plan 127 F2.2: preflight entry — run catalog schema migrations on the
// canonical data file. Idempotent: the schema_version marker prevents
// re-running. Wired into the root preflight chain (package.json).
'use strict';

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const CATALOG_PATH = resolve(REPO_ROOT, 'data', 'product_data.json');

async function run() {
  if (!existsSync(CATALOG_PATH)) {
    console.log('[catalog-migrations] no data/product_data.json — nothing to migrate.');
    return;
  }
  const raw = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));
  const startVersion = typeof raw.schema_version === 'number' ? raw.schema_version : 1;

  // Load the TS migration registry from the admin package.
  const { migrateCatalog } = await import('../src/server/services/catalogMigrations.ts');
  const { catalog, migrated, version } = migrateCatalog(raw);

  if (!migrated) {
    console.log(`[catalog-migrations] catalog already at schema v${startVersion} — no-op.`);
    return;
  }

  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n', 'utf-8');
  console.log(`[catalog-migrations] migrated catalog v${startVersion} -> v${version}.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
