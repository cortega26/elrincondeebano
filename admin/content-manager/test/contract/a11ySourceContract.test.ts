import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Re-scoped from test/browser/keyboardA11y.test.ts + test/contract/wcagAudit.test.ts:
// these are source-string scans (not behavioral) — they guard against wholesale
// attribute removal but pass even if the rendered a11y breaks. Keep them as a
// contract; real behavioral coverage lives in test/e2e/.
const componentsDir = resolve(__dirname, '../../src/web/app/components');
const routesDir = resolve(__dirname, '../../src/web/app/routes');
const productsPath = resolve(__dirname, '../../src/web/app/routes/ProductsPage.tsx');
const productListPath = resolve(__dirname, '../../src/web/app/components/ProductList.tsx');
const categoriesPath = resolve(__dirname, '../../src/web/app/routes/CategoriesPage.tsx');

function readSourceAbsolute(filePath: string): string {
  return readFileSync(filePath, 'utf-8');
}

function readSource(filename: string): string {
  return readFileSync(resolve(routesDir, filename), 'utf-8');
}

function readComponent(filename: string): string {
  return readFileSync(resolve(componentsDir, filename), 'utf-8');
}

describe('a11y source contract — string-level, not behavioral (keyboard source scans)', () => {
  test("ProductsPage source contains role='main'", () => {
    const source = readSourceAbsolute(productsPath);
    expect(source).toContain('role="main"');
  });

  test("ProductsPage source contains aria-label='Productos'", () => {
    const source = readSourceAbsolute(productsPath);
    expect(source).toContain('aria-label="Productos"');
  });

  test("ProductList source contains aria-label='Lista de productos'", () => {
    const source = readSourceAbsolute(productListPath);
    expect(source).toContain('aria-label="Lista de productos"');
  });

  test("ProductsPage source contains role='alert'", () => {
    const source = readSourceAbsolute(productsPath);
    expect(source).toContain('role="alert"');
  });

  test('ProductsPage source contains aria-live', () => {
    const source = readSourceAbsolute(productsPath);
    expect(source).toContain('aria-live');
  });

  test("ProductList source contains role='row'", () => {
    const source = readSourceAbsolute(productListPath);
    expect(source).toContain('role="row"');
  });

  test('ProductList source contains aria-grabbed', () => {
    const source = readSourceAbsolute(productListPath);
    expect(source).toContain('aria-grabbed');
  });

  test('ProductList source contains draggable', () => {
    const source = readSourceAbsolute(productListPath);
    expect(source).toContain('draggable');
  });

  test("ProductsPage source contains role='status' (via Feedback, plan 093)", () => {
    const source = readSourceAbsolute(productsPath);
    expect(source).toContain('Feedback');
    const feedbackSource = readSourceAbsolute(componentsDir + '/Feedback.tsx');
    expect(feedbackSource).toContain("role={kind === 'error' ? 'alert' : 'status'}");
  });

  test('ProductsPage source contains aria-label for buttons', () => {
    const source = readSourceAbsolute(productsPath);
    expect(source).toContain('aria-label=');
  });

  test("CategoriesPage source contains role='main'", () => {
    const source = readSourceAbsolute(categoriesPath);
    expect(source).toContain('role="main"');
  });

  test("CategoriesPage source contains aria-label='Categorías'", () => {
    const source = readSourceAbsolute(categoriesPath);
    expect(source).toContain('aria-label="Categorías"');
  });

  test("CategoriesPage source contains role='alert'", () => {
    const source = readSourceAbsolute(categoriesPath);
    expect(source).toContain('role="alert"');
  });

  test("CategoriesPage source contains aria-label='Grupos de navegación'", () => {
    const source = readSourceAbsolute(categoriesPath);
    expect(source).toContain('aria-label="Grupos de navegación"');
  });

  test("CategoriesPage source contains role='status'", () => {
    const source = readSourceAbsolute(categoriesPath);
    expect(source).toContain('role="status"');
  });

  test('Feedback component provides the single status/alert pattern', () => {
    const source = readSourceAbsolute(componentsDir + '/Feedback.tsx');
    expect(source).toContain('role');
    expect(source).toContain('aria-label');
  });
});

describe('a11y source contract — string-level, not behavioral (WCAG source scans)', () => {
  test('WCAG 1.3.1: ProductsPage has main landmark with accessible label', () => {
    const src = readSource('ProductsPage.tsx');
    expect(src).toContain('role="main"');
    expect(src).toContain('aria-label="Productos"');
  });

  test('WCAG 1.3.1: CategoriesPage has main landmark with accessible label', () => {
    const src = readSource('CategoriesPage.tsx');
    expect(src).toContain('role="main"');
    expect(src).toContain('aria-label');
  });

  test('WCAG 1.3.1: ProductsPage source contains main landmark with label', () => {
    const src = readSource('ProductsPage.tsx');
    expect(src).toContain('role="main"');
    expect(src).toContain('aria-label="Productos"');
  });

  test('WCAG 2.4.3: No positive tabindex values (focus order must follow DOM)', () => {
    const src =
      readSource('ProductsPage.tsx') + readSource('CategoriesPage.tsx') + readSource('MediaPage.tsx');
    const positiveTabindex = src.match(/tabIndex\s*=\s*\{(\d+)\}/g)?.filter((m) => {
      const n = Number(m.match(/\d+/)![0]);
      return n > 0;
    });
    expect(positiveTabindex ?? []).toHaveLength(0);
  });

  test('WCAG 4.1.2: Product actions have accessible names', () => {
    const src = readSource('ProductsPage.tsx') + readComponent('ProductList.tsx');
    // Verify at least one button has aria-label
    expect(src).toContain('aria-label=');
    // Verify archive/restore buttons are labeled
    expect(src).toContain('Archivar');
    expect(src).toContain('Restaurar');
    // Verify edit button is labeled
    expect(src).toContain('Editar');
  });

  test('WCAG 4.1.3: Error messages use role=alert or aria-live', () => {
    const src =
      readSource('ProductsPage.tsx') + readSource('CategoriesPage.tsx') + readSource('MediaPage.tsx');
    const hasAlert = src.includes('role="alert"') || src.includes('aria-live=');
    expect(hasAlert).toBe(true);
  });

  test('WCAG 1.3.2: Table headers use scope attribute', () => {
    const src = readComponent('ProductList.tsx');
    expect(src).toContain('scope="col"');
    expect(src).toContain('aria-label="Lista de productos"');
  });

  test('WCAG 3.3.2: Form inputs have associated labels', () => {
    const src = readSource('ProductsPage.tsx');
    const formArea = src.match(/<form[^>]*>[\s\S]*?<\/form>/);
    if (formArea) {
      const labelCount = (formArea[0].match(/label/g) ?? []).length;
      const inputCount = (formArea[0].match(/<input/g) ?? []).length;
      expect(labelCount).toBeGreaterThanOrEqual(inputCount);
    }
  });

  test('WCAG 2.2.2: No auto-playing or blinking content', () => {
    const allSrc = readSource('ProductsPage.tsx') + readSource('CategoriesPage.tsx');
    expect(allSrc).not.toContain('<blink');
    expect(allSrc).not.toContain('autoplay');
    expect(allSrc).not.toContain('<marquee');
  });

  test('WCAG 2.4.2: Pages have descriptive titles', () => {
    // SPA title is set in index.html
    const indexHtml = readFileSync(
      resolve(__dirname, '../../src/web/index.html'),
      'utf-8'
    );
    expect(indexHtml).toContain('<title>');
    expect(indexHtml).toContain('Content Manager');
  });
});
