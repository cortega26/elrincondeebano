import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const productsPath = resolve(__dirname, '../../src/web/app/routes/ProductsPage.tsx');
const categoriesPath = resolve(__dirname, '../../src/web/app/routes/CategoriesPage.tsx');

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf-8');
}

test("ProductsPage source contains role='main'", () => {
  const source = readSource(productsPath);
  expect(source).toContain('role="main"');
});

test("ProductsPage source contains aria-label='Productos'", () => {
  const source = readSource(productsPath);
  expect(source).toContain('aria-label="Productos"');
});

test("ProductsPage source contains aria-label='Lista de productos'", () => {
  const source = readSource(productsPath);
  expect(source).toContain('aria-label="Lista de productos"');
});

test("ProductsPage source contains role='alert'", () => {
  const source = readSource(productsPath);
  expect(source).toContain('role="alert"');
});

test('ProductsPage source contains aria-live', () => {
  const source = readSource(productsPath);
  expect(source).toContain('aria-live');
});

test("ProductsPage source contains role='row'", () => {
  const source = readSource(productsPath);
  expect(source).toContain('role="row"');
});

test('ProductsPage source contains aria-grabbed', () => {
  const source = readSource(productsPath);
  expect(source).toContain('aria-grabbed');
});

test('ProductsPage source contains draggable', () => {
  const source = readSource(productsPath);
  expect(source).toContain('draggable');
});

test("ProductsPage source contains role='status'", () => {
  const source = readSource(productsPath);
  expect(source).toContain('role="status"');
});

test('ProductsPage source contains aria-label for buttons', () => {
  const source = readSource(productsPath);
  expect(source).toContain('aria-label=');
});

test("CategoriesPage source contains role='main'", () => {
  const source = readSource(categoriesPath);
  expect(source).toContain('role="main"');
});

test("CategoriesPage source contains aria-label='Categorías'", () => {
  const source = readSource(categoriesPath);
  expect(source).toContain('aria-label="Categorías"');
});

test("CategoriesPage source contains role='alert'", () => {
  const source = readSource(categoriesPath);
  expect(source).toContain('role="alert"');
});

test("CategoriesPage source contains aria-label='Grupos de navegación'", () => {
  const source = readSource(categoriesPath);
  expect(source).toContain('aria-label="Grupos de navegación"');
});

test("CategoriesPage source contains role='status'", () => {
  const source = readSource(categoriesPath);
  expect(source).toContain('role="status"');
});
