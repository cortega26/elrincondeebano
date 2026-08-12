import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const routesDir = resolve(__dirname, '..', '..', 'src', 'web', 'app', 'routes');
const componentsDir = resolve(__dirname, '..', '..', 'src', 'web', 'app', 'components');

function readSource(filename: string): string {
  return readFileSync(resolve(routesDir, filename), 'utf-8');
}

function readComponent(filename: string): string {
  return readFileSync(resolve(componentsDir, filename), 'utf-8');
}

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
    resolve(__dirname, '..', '..', 'src', 'web', 'index.html'),
    'utf-8'
  );
  expect(indexHtml).toContain('<title>');
  expect(indexHtml).toContain('Content Manager');
});
