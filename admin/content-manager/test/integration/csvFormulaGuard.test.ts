// Plan 184: spreadsheet formula guard — exported cells starting with a
// formula introducer (= + - @ tab CR) carry a text-marker prefix, because
// quoting alone does not stop spreadsheet evaluation. Owner-confirmed: the
// operator opens exports in formula-evaluating spreadsheets.
import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

function createTempDir(): string {
  return resolve(
    tmpdir(),
    `cm-csv-formula-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function product(id: string, name: string, description: string) {
  return {
    id,
    name,
    description,
    price: 100,
    discount: 0,
    stock: true,
    category: 'abarrotes',
    order: 0,
    is_archived: false,
    rev: 0,
    field_last_modified: {},
  };
}

function setup(dir: string): void {
  const dataDir = resolve(dir, 'data');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    resolve(dataDir, 'product_data.json'),
    JSON.stringify({
      version: 'test',
      last_updated: '',
      rev: 0,
      products: [
        product('f-1', '=HYPERLINK("http://evil.example","Oferta")', 'normal desc'),
        product('f-2', '+2+3 Riña', '@SUM en descripcion'),
        product('f-3', '-5% off esta semana', 'plain'),
        product('f-4', 'Arroz', 'plain'),
      ],
    })
  );
  writeFileSync(
    resolve(dataDir, 'category_registry.json'),
    JSON.stringify({ nav_groups: [], categories: [] })
  );
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

test('formula-shaped cells are text-marked, benign cells are untouched', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/export.csv' });
      expect(res.statusCode).toBe(200);
      const body = res.body;

      // Guarded: leading text marker inside the quoted cell.
      expect(body).toContain(`"'=HYPERLINK(`);
      expect(body).toContain(`'+2+3 Riña`);
      expect(body).toContain(`'-5% off esta semana`);
      expect(body).toContain(`'@SUM en descripcion`);
      // Unguarded cells carry no marker.
      expect(body).toContain('\nArroz,plain,');
      expect(body).not.toContain(`'Arroz`);
    } finally {
      await app.close();
    }
  } finally {
    cleanup(dir);
  }
});
