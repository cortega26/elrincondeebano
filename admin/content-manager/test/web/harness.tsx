// @vitest-environment jsdom
// Plan 127 F1.1: shared harness for web component tests — a single mocked
// API client (configured per test through `mockApi`), router wrapper, and
// the global fetch stub the panels need.

import { render, screen, cleanup } from '@testing-library/react';
import { vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';

// Single mock instance for the whole suite — tests configure per-case via
// mockApi.<method>.mockResolvedValueOnce(...) before rendering.
const { mockApi } = vi.hoisted(() => {
  const mockApi = {
    getProducts: vi.fn(),
    getCategories: vi.fn(),
    getBundles: vi.fn(),
    getFeatured: vi.fn(),
    getMedia: vi.fn(),
    getProduct: vi.fn(),
    updateProduct: vi.fn(),
    batchUpdateProducts: vi.fn(),
    bulkApply: vi.fn(),
    reorderProducts: vi.fn(),
    getGitStatus: vi.fn(),
    gitPull: vi.fn(),
    updateBundles: vi.fn(),
    updateFeatured: vi.fn(),
    importPreview: vi.fn(),
    importApply: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    batchUpdateCategories: vi.fn(),
    createNavGroup: vi.fn(),
    updateNavGroup: vi.fn(),
    deleteNavGroup: vi.fn(),
    createSubcategory: vi.fn(),
    updateSubcategory: vi.fn(),
    deleteSubcategory: vi.fn(),
  };
  return { mockApi };
});

vi.mock('@web/api/client.ts', () => {
  class MockContentManagerClient {
    getProducts = mockApi.getProducts;
    getCategories = mockApi.getCategories;
    getBundles = mockApi.getBundles;
    getFeatured = mockApi.getFeatured;
    getMedia = mockApi.getMedia;
    getProduct = mockApi.getProduct;
    updateProduct = mockApi.updateProduct;
    batchUpdateProducts = mockApi.batchUpdateProducts;
    bulkApply = mockApi.bulkApply;
    reorderProducts = mockApi.reorderProducts;
    getGitStatus = mockApi.getGitStatus;
    gitPull = mockApi.gitPull;
    updateBundles = mockApi.updateBundles;
    updateFeatured = mockApi.updateFeatured;
    importPreview = mockApi.importPreview;
    importApply = mockApi.importApply;
    createCategory = mockApi.createCategory;
    updateCategory = mockApi.updateCategory;
    deleteCategory = mockApi.deleteCategory;
    batchUpdateCategories = mockApi.batchUpdateCategories;
    createNavGroup = mockApi.createNavGroup;
    updateNavGroup = mockApi.updateNavGroup;
    deleteNavGroup = mockApi.deleteNavGroup;
    createSubcategory = mockApi.createSubcategory;
    updateSubcategory = mockApi.updateSubcategory;
    deleteSubcategory = mockApi.deleteSubcategory;
  }
  return { ContentManagerClient: MockContentManagerClient };
});

export const productA = {
  id: 'p1',
  sku: null,
  name: 'Producto A',
  description: '',
  price: 1000,
  discount: 0,
  stock: true,
  category: 'cat-a',
  order: 0,
  is_archived: false,
  image_path: '',
  image_avif_path: '',
  rev: 1,
  field_last_modified: {},
};

export function renderWithRouter(ui: ReactElement): ReturnType<typeof render> {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

export { screen, mockApi };

// The panels raw-fetch status/diagnostics endpoints; jsdom has no fetch.
beforeEach(() => {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ syncEnabled: false, status: 'idle', pending: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
  ) as unknown as typeof fetch;
});

export function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// vitest globals are off — RTL's auto-cleanup cannot register itself.
afterEach(() => {
  cleanup();
});
