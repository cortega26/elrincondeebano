import { test, expect } from 'vitest';
import { ValidationAdapter } from '../../src/server/adapters/validationAdapter.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

function createTempDir(): string {
  const dir = resolve(tmpdir(), `cm-val-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  return dir;
}

function writeValidData(dir: string): void {
  writeFileSync(
    resolve(dir, 'data', 'product_data.json'),
    JSON.stringify({
      version: 'test',
      last_updated: '2026-07-15T00:00:00.000Z',
      rev: 1,
      products: [
        {
          name: 'Valid Product',
          description: 'ok',
          price: 1000,
          discount: 100,
          stock: true,
          category: 'cat1',
          image_path: '',
          image_avif_path: '',
          order: 0,
          is_archived: false,
          rev: 1,
          field_last_modified: {},
        },
      ],
    })
  );

  writeFileSync(
    resolve(dir, 'data', 'category_registry.json'),
    JSON.stringify({
      nav_groups: [{ id: 'g1', active: true, sort_order: 0 }],
      categories: [{ id: 'c1', key: 'cat1', slug: 'cat-1', active: true, sort_order: 0 }],
    })
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

test('validateProducts passes with valid data', () => {
  const dir = createTempDir();
  try {
    writeValidData(dir);
    const adapter = new ValidationAdapter();
    const result = adapter.validateProducts(dir);
    expect(result.step).toBe('products-schema');
    expect(result.status).toBe('pass');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validateProducts fails with invalid schema', () => {
  const dir = createTempDir();
  try {
    mkdirSync(resolve(dir, 'data'), { recursive: true });
    writeFileSync(
      resolve(dir, 'data', 'product_data.json'),
      JSON.stringify({
        version: 'bad',
        last_updated: '',
        rev: 'not-a-number',
        products: [{ invalid: true }],
      })
    );

    const adapter = new ValidationAdapter();
    const result = adapter.validateProducts(dir);
    expect(result.step).toBe('products-schema');
    expect(result.status).toBe('fail');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validateProducts handles missing file gracefully', () => {
  const dir = createTempDir();
  try {
    const adapter = new ValidationAdapter();
    const result = adapter.validateProducts(dir);
    expect(result.step).toBe('products-schema');
    expect(result.status).toBe('fail');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validateProducts detects discount exceeding price', () => {
  const dir = createTempDir();
  try {
    mkdirSync(resolve(dir, 'data'), { recursive: true });
    writeFileSync(
      resolve(dir, 'data', 'product_data.json'),
      JSON.stringify({
        version: 'test',
        last_updated: '',
        rev: 1,
        products: [
          {
            name: 'Bad Discount',
            description: 'x',
            price: 100,
            discount: 200,
            stock: true,
            category: 'cat1',
            image_path: '',
            image_avif_path: '',
            order: 0,
            is_archived: false,
            rev: 1,
            field_last_modified: {},
          },
        ],
      })
    );

    const adapter = new ValidationAdapter();
    const result = adapter.validateProducts(dir);
    expect(result.status).toBe('fail');
    expect(result.output).toContain('1 errors');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validateCategories passes with valid data', () => {
  const dir = createTempDir();
  try {
    writeValidData(dir);
    const adapter = new ValidationAdapter();
    const result = adapter.validateCategories(dir);
    expect(result.step).toBe('categories-schema');
    expect(result.status).toBe('pass');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validateCategories fails with invalid schema', () => {
  const dir = createTempDir();
  try {
    mkdirSync(resolve(dir, 'data'), { recursive: true });
    writeFileSync(
      resolve(dir, 'data', 'category_registry.json'),
      JSON.stringify({ nav_groups: 'not-an-array', categories: null })
    );

    const adapter = new ValidationAdapter();
    const result = adapter.validateCategories(dir);
    expect(result.status).toBe('fail');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validateCategories handles missing file', () => {
  const dir = createTempDir();
  try {
    const adapter = new ValidationAdapter();
    const result = adapter.validateCategories(dir);
    expect(result.status).toBe('fail');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validateStorefront passes with valid data', () => {
  const dir = createTempDir();
  try {
    writeValidData(dir);
    const adapter = new ValidationAdapter();
    const result = adapter.validateStorefront(dir);
    expect(result.step).toBe('storefront-schema');
    expect(result.status).toBe('pass');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validateStorefront fails with invalid schema', () => {
  const dir = createTempDir();
  try {
    mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
    writeFileSync(
      resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
      JSON.stringify({ trustBar: 'bad' })
    );

    const adapter = new ValidationAdapter();
    const result = adapter.validateStorefront(dir);
    expect(result.status).toBe('fail');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validateStorefront handles missing file', () => {
  const dir = createTempDir();
  try {
    const adapter = new ValidationAdapter();
    const result = adapter.validateStorefront(dir);
    expect(result.status).toBe('fail');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runAllValidations returns results for all steps', async () => {
  const dir = createTempDir();
  try {
    writeValidData(dir);
    const adapter = new ValidationAdapter();
    const results = await adapter.runAllValidations(dir);
    expect(results.length).toBeGreaterThanOrEqual(3);

    const productResult = results.find((r) => r.step === 'products-schema');
    expect(productResult).toBeDefined();

    const catResult = results.find((r) => r.step === 'categories-schema');
    expect(catResult).toBeDefined();

    const sfResult = results.find((r) => r.step === 'storefront-schema');
    expect(sfResult).toBeDefined();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runTool returns pass for valid command', async () => {
  const dir = createTempDir();
  try {
    writeValidData(dir);

    const adapter = new ValidationAdapter();
    const result = await adapter.runTool(dir, 'node', ['-e', "console.log('ok')"]);
    expect(result.step).toBe('node');
    expect(result.status).toBe('pass');
    expect(result.output).toContain('ok');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runTool returns fail for invalid command', async () => {
  const dir = createTempDir();
  try {
    const adapter = new ValidationAdapter();
    const result = await adapter.runTool(dir, 'nonexistent_command_xyz', []);
    expect(result.status).toBe('fail');
    expect(result.error).toBeDefined();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validation results include duration_ms', () => {
  const dir = createTempDir();
  try {
    writeValidData(dir);
    const adapter = new ValidationAdapter();
    const result = adapter.validateProducts(dir);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    expect(typeof result.duration_ms).toBe('number');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validation results have correct shapes', () => {
  const dir = createTempDir();
  try {
    writeValidData(dir);
    const adapter = new ValidationAdapter();
    const productResult = adapter.validateProducts(dir);
    expect(productResult).toHaveProperty('step');
    expect(productResult).toHaveProperty('status');
    expect(productResult).toHaveProperty('duration_ms');
    expect(['pass', 'fail', 'skipped']).toContain(productResult.status);

    const catResult = adapter.validateCategories(dir);
    expect(['pass', 'fail', 'skipped']).toContain(catResult.status);

    const sfResult = adapter.validateStorefront(dir);
    expect(['pass', 'fail', 'skipped']).toContain(sfResult.status);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
