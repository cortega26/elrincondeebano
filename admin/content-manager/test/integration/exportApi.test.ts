import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import type { FastifyInstance } from 'fastify';

function getCredential(app: FastifyInstance): string {
  const cred = (app as unknown as { launchCredential?: string }).launchCredential;
  return typeof cred === 'string' ? cred : '';
}

function credHeaders(app: FastifyInstance): Record<string, string> {
  return { [CREDENTIAL_HEADER]: getCredential(app) };
}

function createTempDir(): string {
  return resolve(tmpdir(), `cm-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
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
      rev: 3,
      products: [
        {
          id: 'p1',
          name: 'Café de Grano',
          description: 'Tostado medio, "aroma intenso"',
          price: 4500,
          discount: 500,
          stock: true,
          category: 'bebidas',
          image_path: 'assets/images/cafe.jpg',
          image_avif_path: 'assets/images/cafe.avif',
          order: 0,
          is_archived: false,
          rev: 2,
          field_last_modified: {},
        },
        {
          id: 'p2',
          name: 'Agua Mineral',
          description: 'Sin gas, 1.5 L',
          price: 1000,
          discount: 0,
          stock: false,
          category: 'bebidas',
          image_path: '',
          image_avif_path: '',
          order: 1,
          is_archived: true,
          rev: 1,
          field_last_modified: {},
        },
        {
          id: 'p3',
          name: 'Snacks, surtido',
          description: 'Mezcla\ncon sal y limón',
          price: 1500,
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

// ── JSON export / round-trip ─────────────────────────────────────────────────

test('GET /api/v1/export returns the full catalog and round-trips losslessly', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const exported = (await app.inject({ method: 'GET', url: '/api/v1/export' })).json<{
      rev: number;
      products: Array<Record<string, unknown>>;
    }>();
    expect(exported.rev).toBe(3);
    expect(exported.products).toHaveLength(3);

    // Full round-trip: export -> preview -> apply -> re-export.
    const preview = await app.inject({
      method: 'POST',
      url: '/api/v1/import/preview',
      headers: ch,
      payload: { products: exported.products },
    });
    expect(preview.statusCode).toBe(200);
    const previewBody = preview.json<{
      preview_id: string;
      summary: { additions: number; updates: number };
    }>();
    expect(previewBody.summary.additions).toBe(0);
    expect(previewBody.summary.updates).toBe(0); // identical data is unchanged

    const apply = await app.inject({
      method: 'POST',
      url: '/api/v1/import/apply',
      headers: ch,
      payload: { preview_id: previewBody.preview_id, resolutions: [] },
    });
    expect(apply.statusCode).toBe(200);

    const after = (await app.inject({ method: 'GET', url: '/api/v1/export' })).json<{
      rev: number;
      products: Array<Record<string, unknown>>;
    }>();
    const dropMeta = (p: Record<string, unknown>): Record<string, unknown> => {
      const rest = { ...p };
      delete rest.rev;
      delete rest.field_last_modified;
      return rest;
    };
    expect(after.products.map(dropMeta)).toEqual(exported.products.map(dropMeta));

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── CSV export ───────────────────────────────────────────────────────────────

test('GET /api/v1/export.csv matches the Python column contract', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/v1/export.csv' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');

    const lines = res.body.split('\n');
    expect(lines[0]).toBe(
      'name,description,price,discount,stock,category,image_path,image_avif_path,order'
    );
    const rows = lines.filter((l) => /^(Café|Agua|"Snacks)/.test(l));
    expect(rows).toHaveLength(3);

    const cafe = lines.find((l) => l.startsWith('Café de Grano'))!;
    expect(cafe).toContain('"Tostado medio, ""aroma intenso"""');
    expect(cafe).toMatch(
      /,4500,500,True,bebidas,assets\/images\/cafe\.jpg,assets\/images\/cafe\.avif,0$/
    );

    const agua = lines.find((l) => l.startsWith('Agua Mineral'))!;
    expect(agua).toMatch(/,1000,0,False,bebidas,,,1$/);

    // Multi-line description is quoted (raw body keeps the newline in-field)
    expect(res.body).toContain('"Mezcla\ncon sal y limón"');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/export.csv applies filters', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const byCategory = await app.inject({
      method: 'GET',
      url: '/api/v1/export.csv?category=snacks',
    });
    expect(byCategory.body).toContain('"Snacks, surtido"');
    expect(byCategory.body).not.toContain('Café de Grano');

    const onlyArchived = await app.inject({
      method: 'GET',
      url: '/api/v1/export.csv?archived=true',
    });
    expect(onlyArchived.body).toContain('Agua Mineral');
    expect(onlyArchived.body).not.toContain('Café de Grano');

    const outOfStock = await app.inject({
      method: 'GET',
      url: '/api/v1/export.csv?out_of_stock=true',
    });
    expect(outOfStock.body).toContain('Agua Mineral');
    expect(outOfStock.body).not.toContain('Snacks');

    const search = await app.inject({ method: 'GET', url: '/api/v1/export.csv?q=café' });
    expect(search.body).toContain('Café de Grano');
    expect(search.body).not.toContain('Agua Mineral');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
