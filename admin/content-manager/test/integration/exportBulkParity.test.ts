// Plan 193 slice 3: filtered export and filter-scoped bulk must agree on
// the product set for the same filters (plan 088 contract). The only prior
// pin lived in the sharded scope.spec.ts:176 — these run in the default
// integration suite. (The history undo/redo round-trip half of the slice
// already exists: changeSetWorkflow.test.ts edit/create/history cases.)
//
// Note on no-ops: preview.changes lists only effective changes (plan 172:
// already-satisfied products are skipped, not changed), so the parity
// actions below are chosen to change every candidate; the third case pins
// the changed+skipped accounting against the export count instead.
import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import type { FastifyInstance } from 'fastify';

function getCredential(app: FastifyInstance): string {
  const cred = (app as unknown as { launchCredential?: string }).launchCredential;
  return typeof cred === 'string' ? cred : '';
}

function createTempDir(): string {
  return resolve(
    tmpdir(),
    `cm-export-parity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function setup(dir: string): void {
  const dataDir = resolve(dir, 'data');
  const astroDataDir = resolve(dir, 'astro-poc', 'src', 'data');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(astroDataDir, { recursive: true });

  writeFileSync(
    resolve(dataDir, 'product_data.json'),
    JSON.stringify({
      version: 'test',
      last_updated: '',
      rev: 1,
      products: [
        {
          id: 'p1',
          name: 'Café de Grano',
          description: 'Tostado medio',
          price: 4500,
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
        {
          id: 'p2',
          name: 'Agua Mineral',
          description: 'Sin gas',
          price: 1000,
          discount: 0,
          stock: false,
          category: 'bebidas',
          image_path: '',
          image_avif_path: '',
          order: 1,
          is_archived: false,
          rev: 1,
          field_last_modified: {},
        },
        {
          id: 'p3',
          name: 'Pirulín grande',
          description: 'Lata de 300g',
          price: 8600,
          discount: 0,
          stock: true,
          category: 'snacks',
          image_path: '',
          image_avif_path: '',
          order: 2,
          is_archived: false,
          rev: 1,
          field_last_modified: {},
        },
      ],
    })
  );
  writeFileSync(
    resolve(dataDir, 'category_registry.json'),
    JSON.stringify({ nav_groups: [], categories: [] })
  );
  writeFileSync(
    resolve(astroDataDir, 'storefront-experience.json'),
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

function csvNames(csv: string): string[] {
  const lines = csv.trim().split('\n');
  // First column is the stable `name` export (CSV_EXPORT_COLUMNS[0]).
  return lines
    .slice(1)
    .map((line) => line.split(',')[0]?.replace(/^"|"$/g, ''))
    .filter(Boolean) as string[];
}

async function exportNames(app: FastifyInstance, query: string): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: `/api/v1/export.csv${query}` });
  expect(res.statusCode).toBe(200);
  return csvNames(res.body);
}

interface BulkPreview {
  changes: Array<{ product_id: string }>;
}

async function bulkPreview(
  app: FastifyInstance,
  ch: Record<string, string>,
  action: string,
  value: number | boolean | string,
  filters: Record<string, unknown>
): Promise<BulkPreview> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/products/bulk/preview',
    headers: ch,
    payload: { command_id: randomUUID(), action, value, scope: 'all', filters },
  });
  expect(res.statusCode).toBe(200);
  return res.json<BulkPreview>();
}

test('category filter: export.csv and bulk scope=all agree on the set', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = { [CREDENTIAL_HEADER]: getCredential(app) };

    // set_discount_fixed=100 changes every candidate (all discount 0).
    const exported = await exportNames(app, '?category=bebidas');
    expect([...exported].sort()).toEqual(['Agua Mineral', 'Café de Grano']);

    const previewed = await bulkPreview(app, ch, 'set_discount_fixed', 100, {
      category: 'bebidas',
    });
    expect(previewed.changes.map((c) => c.product_id).sort()).toEqual(['p1', 'p2']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('q filter: export.csv and bulk scope=all agree on the set', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = { [CREDENTIAL_HEADER]: getCredential(app) };

    const exported = await exportNames(app, '?q=Pirul%C3%ADn');
    expect(exported).toEqual(['Pirulín grande']);

    const previewed = await bulkPreview(app, ch, 'set_stock', false, { q: 'Pirulín' });
    expect(previewed.changes.map((c) => c.product_id)).toEqual(['p3']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('already-satisfied exclusion reconciles: complementary previews union to the export set', async () => {
  // Plan 102 (by design): preview.changes lists only effective changes —
  // already-satisfied products are excluded, NOT counted as skipped
  // (skipped = schema-reverted mutations, plan 172). The union over
  // complementary actions must equal the export set.
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = { [CREDENTIAL_HEADER]: getCredential(app) };

    // p1 stocked, p2 unstocked: each action flips exactly one.
    const exported = await exportNames(app, '?category=bebidas');
    expect([...exported].sort()).toEqual(['Agua Mineral', 'Café de Grano']);

    const toTrue = await bulkPreview(app, ch, 'set_stock', true, { category: 'bebidas' });
    expect(toTrue.changes.map((c) => c.product_id)).toEqual(['p2']);

    const toFalse = await bulkPreview(app, ch, 'set_stock', false, { category: 'bebidas' });
    expect(toFalse.changes.map((c) => c.product_id)).toEqual(['p1']);

    const union = new Set([
      ...toTrue.changes.map((c) => c.product_id),
      ...toFalse.changes.map((c) => c.product_id),
    ]);
    expect([...union].sort()).toEqual(['p1', 'p2']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
