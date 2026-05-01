import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createCatalogViewController } from '../astro-poc/src/scripts/storefront/catalog-view.js';

function setupCatalogDom() {
  const dom = new JSDOM(`<!DOCTYPE html>
    <body>
      <select id="sort-options">
        <option value="original">Original</option>
        <option value="name-desc">Nombre Z-A</option>
        <option value="price-asc">Precio asc</option>
      </select>
      <input id="filter-keyword" />
      <input id="filter-discount" type="checkbox" />
      <div id="catalog-results-status"></div>
      <div id="catalog-empty-state" class="d-none"></div>
      <button id="catalog-load-more" class="d-none">Cargar más productos</button>
      <div id="catalog-sentinel"></div>
      <div id="product-container">
        <article class="producto" data-product-id="p1" data-product-name="Agua" data-product-order="0" data-product-final-price="900" data-product-discount="0"></article>
        <article class="producto" data-product-id="p2" data-product-name="Zumo" data-product-order="1" data-product-final-price="1500" data-product-discount="100"></article>
        <article class="producto" data-product-id="p3" data-product-name="Cafe" data-product-order="2" data-product-final-price="2500" data-product-discount="0"></article>
      </div>
    </body>`);

  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;

  return dom;
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
});

describe('createCatalogViewController', () => {
  it('sorts, filters, and reports visible product state', () => {
    setupCatalogDom();
    document.getElementById('sort-options').value = 'name-desc';
    document.getElementById('filter-keyword').value = 'a';

    const controller = createCatalogViewController({
      container: document.getElementById('product-container'),
      sortSelect: document.getElementById('sort-options'),
      searchInput: document.getElementById('filter-keyword'),
      discountCheckbox: document.getElementById('filter-discount'),
      loadMoreButton: document.getElementById('catalog-load-more'),
      resultsStatus: document.getElementById('catalog-results-status'),
      emptyState: document.getElementById('catalog-empty-state'),
      normalizeSearchText,
      parseNumber,
      pageSize: 2,
    });

    const state = controller.updateView();
    const orderedIds = Array.from(document.querySelectorAll('#product-container .producto')).map(
      (element) => element.getAttribute('data-product-id')
    );

    expect(orderedIds).toEqual(['p2', 'p3', 'p1']);
    expect(state).toEqual({ matchedCount: 2, visibleLimit: 2 });
    expect(document.getElementById('catalog-results-status').textContent).toBe(
      '2 productos encontrados'
    );
    expect(document.getElementById('catalog-empty-state').classList.contains('d-none')).toBe(true);
  });

  it('paginates matching products through the shared controller state', () => {
    setupCatalogDom();

    const controller = createCatalogViewController({
      container: document.getElementById('product-container'),
      sortSelect: document.getElementById('sort-options'),
      searchInput: document.getElementById('filter-keyword'),
      discountCheckbox: document.getElementById('filter-discount'),
      loadMoreButton: document.getElementById('catalog-load-more'),
      resultsStatus: document.getElementById('catalog-results-status'),
      emptyState: document.getElementById('catalog-empty-state'),
      normalizeSearchText,
      parseNumber,
      pageSize: 2,
    });

    controller.updateView();

    expect(document.querySelector('[data-product-id="p3"]').classList.contains('is-hidden')).toBe(
      true
    );
    expect(document.getElementById('catalog-load-more').classList.contains('d-none')).toBe(false);

    controller.loadMore();

    expect(document.querySelector('[data-product-id="p3"]').classList.contains('is-hidden')).toBe(
      false
    );
    expect(document.getElementById('catalog-load-more').classList.contains('d-none')).toBe(true);
  });

  it('suppresses observer-driven pagination during programmatic jumps and resumes afterward', () => {
    vi.useFakeTimers();
    setupCatalogDom();

    let observerCallback = null;
    const observers = [];
    const intersectionObserverFactory = vi.fn((callback) => {
      observerCallback = callback;
      const observer = {
        observe: vi.fn(),
        disconnect: vi.fn(),
      };
      observers.push(observer);
      return observer;
    });

    const controller = createCatalogViewController({
      container: document.getElementById('product-container'),
      sortSelect: document.getElementById('sort-options'),
      searchInput: document.getElementById('filter-keyword'),
      discountCheckbox: document.getElementById('filter-discount'),
      loadMoreButton: document.getElementById('catalog-load-more'),
      resultsStatus: document.getElementById('catalog-results-status'),
      emptyState: document.getElementById('catalog-empty-state'),
      sentinel: document.getElementById('catalog-sentinel'),
      normalizeSearchText,
      parseNumber,
      pageSize: 1,
      intersectionObserverFactory,
    });

    controller.updateView();
    controller.setupPagination();
    expect(observers).toHaveLength(1);
    expect(controller.getState().paginationSuppressed).toBe(false);

    controller.suspendPaginationForProgrammaticScroll();
    expect(controller.getState().paginationSuppressed).toBe(true);
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);

    observerCallback?.([{ isIntersecting: true }]);
    expect(document.querySelector('[data-product-id="p2"]').classList.contains('is-hidden')).toBe(
      true
    );

    vi.advanceTimersByTime(40);
    expect(controller.getState().paginationSuppressed).toBe(false);
    expect(observers).toHaveLength(2);

    observerCallback?.([{ isIntersecting: true }]);
    expect(document.querySelector('[data-product-id="p2"]').classList.contains('is-hidden')).toBe(
      false
    );
  });
});
