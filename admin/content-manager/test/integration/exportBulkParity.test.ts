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
//
// Plan 221: the table-driven case at the bottom pins the whole filter
// contract (q, category, price, discount, stock, archived + combinations):
// GET /products, the CSV export and bulk scope:'all' must agree on the exact
// same set, all three through the canonical repository predicate.
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

const BASE_PRODUCTS = [
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
];

// Plan 221: whole-contract parity fixture — the base three cannot express the
// discount, out-of-stock and archived keys, so the table below adds one row
// per remaining contract dimension (25% and 50% raw ratios, two archived
// ofertas, one unstocked).
const PARITY_PRODUCTS = [
  ...BASE_PRODUCTS,
  {
    id: 'p4',
    name: 'Galletas de arroz',
    description: 'Crujientes',
    price: 2200,
    discount: 550,
    stock: true,
    category: 'postres',
    image_path: '',
    image_avif_path: '',
    order: 3,
    is_archived: false,
    rev: 1,
    field_last_modified: {},
  },
  {
    id: 'p5',
    name: 'Té chai especiado',
    description: 'Mezcla aromática',
    price: 3000,
    discount: 1500,
    stock: true,
    category: 'infusiones',
    image_path: '',
    image_avif_path: '',
    order: 4,
    is_archived: false,
    rev: 1,
    field_last_modified: {},
  },
  {
    id: 'p6',
    name: 'Mermelada retirada',
    description: 'Lote antiguo',
    price: 1800,
    discount: 0,
    stock: true,
    category: 'ofertas',
    image_path: '',
    image_avif_path: '',
    order: 5,
    is_archived: true,
    rev: 1,
    field_last_modified: {},
  },
  {
    id: 'p7',
    name: 'Salsa extra',
    description: 'Picante suave',
    price: 900,
    discount: 0,
    stock: false,
    category: 'ofertas',
    image_path: '',
    image_avif_path: '',
    order: 6,
    is_archived: true,
    rev: 1,
    field_last_modified: {},
  },
];

function setup(dir: string, products: typeof BASE_PRODUCTS = BASE_PRODUCTS): void {
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
      products,
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

// ── Plan 221: whole-contract parity table ───────────────────────────────────
//
// One row per filter key (plus combinations). For each row the same query
// string drives GET /products and GET /export.csv, and the equivalent typed
// object drives bulk scope:'all'. The bulk probe uses set_category:'paridad'
// because it is an effective change for every fixture product (preview
// .changes lists only effective changes, plan 172), so the preview enumerates
// exactly the filter's candidate set. The q/category rows intentionally pin
// the plan-221 behavior change: export q now matches the category field and
// export category is case-insensitive after trim, both matching the list.

interface ParityCase {
  name: string;
  query: string;
  body: Record<string, unknown>;
  expected: string[];
}

const PARITY_CASES: ParityCase[] = [
  {
    name: 'q matches a category name',
    query: 'q=bebidas',
    body: { q: 'bebidas' },
    expected: ['p1', 'p2'],
  },
  {
    name: 'category is case-insensitive',
    query: 'category=BEBIDAS',
    body: { category: 'BEBIDAS' },
    expected: ['p1', 'p2'],
  },
  {
    name: 'min_price is inclusive',
    query: 'min_price=2200',
    body: { min_price: 2200 },
    expected: ['p1', 'p3', 'p4', 'p5'],
  },
  {
    name: 'max_price is inclusive',
    query: 'max_price=1000',
    body: { max_price: 1000 },
    expected: ['p2', 'p7'],
  },
  {
    name: 'min_discount uses the raw ratio (25% boundary)',
    query: 'min_discount=25',
    body: { min_discount: 25 },
    expected: ['p4', 'p5'],
  },
  {
    name: 'max_discount',
    query: 'max_discount=10',
    body: { max_discount: 10 },
    expected: ['p1', 'p2', 'p3', 'p6', 'p7'],
  },
  {
    name: 'discounted_only',
    query: 'discounted_only=true',
    body: { discounted_only: true },
    expected: ['p4', 'p5'],
  },
  {
    name: 'out_of_stock',
    query: 'out_of_stock=true',
    body: { out_of_stock: true },
    expected: ['p2', 'p7'],
  },
  {
    name: 'archived=true',
    query: 'archived=true',
    body: { archived: true },
    expected: ['p6', 'p7'],
  },
  {
    name: 'archived=false',
    query: 'archived=false',
    body: { archived: false },
    expected: ['p1', 'p2', 'p3', 'p4', 'p5'],
  },
  {
    name: 'combination: category + archived',
    query: 'category=OFERTAS&archived=true',
    body: { category: 'OFERTAS', archived: true },
    expected: ['p6', 'p7'],
  },
  {
    name: 'combination: min_price + discounted_only + archived=false',
    query: 'min_price=1500&discounted_only=true&archived=false',
    body: { min_price: 1500, discounted_only: true, archived: false },
    expected: ['p4', 'p5'],
  },
];

async function listIds(app: FastifyInstance, query: string): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: `/api/v1/products?limit=200&${query}` });
  expect(res.statusCode).toBe(200);
  const body = res.json<{ total: number; items: Array<{ id?: string }> }>();
  // The fixture stays far below the 200 server clamp — one page is the whole set.
  expect(body.items.length).toBe(body.total);
  return body.items.map((p) => p.id!).filter(Boolean);
}

test.each(PARITY_CASES)('parity ($name): list == export == bulk scope=all', async (row) => {
  const dir = createTempDir();
  setup(dir, PARITY_PRODUCTS);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = { [CREDENTIAL_HEADER]: getCredential(app) };
    const expected = [...row.expected].sort();

    const listed = (await listIds(app, row.query)).sort();
    expect(listed).toEqual(expected);

    const nameToId = new Map(PARITY_PRODUCTS.map((p) => [p.name, p.id]));
    const exported = (await exportNames(app, `?${row.query}`))
      .map((name) => nameToId.get(name) ?? `unknown:${name}`)
      .sort();
    expect(exported).toEqual(expected);

    const previewed = await bulkPreview(app, ch, 'set_category', 'paridad', row.body);
    const bulkIds = previewed.changes.map((c) => c.product_id).sort();
    expect(bulkIds).toEqual(expected);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
