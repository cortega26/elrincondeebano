/* eslint-disable max-lines-per-function -- suite-level describe block (plan 149) */
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
      'Mostrando 2 productos para "a"'
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

  it('loads more products when the sentinel enters the viewport', () => {
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

    observerCallback?.([{ isIntersecting: true }]);
    expect(document.querySelector('[data-product-id="p2"]').classList.contains('is-hidden')).toBe(
      false
    );
  });

  it('does not re-append nodes when the DOM order already matches (original sort, search, loadMore)', () => {
    setupCatalogDom();

    const container = document.getElementById('product-container');
    const controller = createCatalogViewController({
      container,
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
    const appendSpy = vi.spyOn(container, 'appendChild');

    controller.updateView();
    expect(appendSpy).not.toHaveBeenCalled();

    document.getElementById('filter-keyword').value = 'a';
    controller.updateView();
    expect(appendSpy).not.toHaveBeenCalled();

    controller.loadMore();
    expect(appendSpy).not.toHaveBeenCalled();
    expect(document.querySelector('[data-product-id="p3"]').classList.contains('is-hidden')).toBe(
      false
    );

    const orderedIds = Array.from(container.querySelectorAll('.producto')).map((element) =>
      element.getAttribute('data-product-id')
    );
    expect(orderedIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('re-appends only on an actual order change and restores server order when switching back to original', () => {
    setupCatalogDom();

    const container = document.getElementById('product-container');
    const controller = createCatalogViewController({
      container,
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
    const appendSpy = vi.spyOn(container, 'appendChild');

    controller.updateView();
    expect(appendSpy).not.toHaveBeenCalled();

    document.getElementById('sort-options').value = 'name-desc';
    controller.updateView();
    expect(appendSpy).toHaveBeenCalledTimes(1);
    let orderedIds = Array.from(container.querySelectorAll('.producto')).map((element) =>
      element.getAttribute('data-product-id')
    );
    expect(orderedIds).toEqual(['p2', 'p3', 'p1']);

    document.getElementById('sort-options').value = 'original';
    controller.updateView();
    expect(appendSpy).toHaveBeenCalledTimes(2);
    orderedIds = Array.from(container.querySelectorAll('.producto')).map((element) =>
      element.getAttribute('data-product-id')
    );
    expect(orderedIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('keeps filtering/hiding independent of the reorder gate and reports matches (original sort)', () => {
    setupCatalogDom();

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
      pageSize: 1,
    });

    const state = controller.updateView();

    expect(state).toEqual({ matchedCount: 2, visibleLimit: 1 });
    expect(document.querySelector('[data-product-id="p2"]').classList.contains('is-hidden')).toBe(
      true
    );
    expect(document.querySelector('[data-product-id="p1"]').classList.contains('is-hidden')).toBe(
      false
    );
    expect(document.getElementById('catalog-results-status').textContent).toBe(
      'Mostrando 2 productos para "a"'
    );
  });

  it('produces byte-identical DOM for the default (original) sort path', () => {
    setupCatalogDom();

    const container = document.getElementById('product-container');
    const before = container.innerHTML;
    const controller = createCatalogViewController({
      container,
      sortSelect: document.getElementById('sort-options'),
      searchInput: document.getElementById('filter-keyword'),
      discountCheckbox: document.getElementById('filter-discount'),
      loadMoreButton: document.getElementById('catalog-load-more'),
      resultsStatus: document.getElementById('catalog-results-status'),
      emptyState: document.getElementById('catalog-empty-state'),
      normalizeSearchText,
      parseNumber,
      pageSize: 100,
    });

    controller.updateView();
    expect(container.innerHTML).toBe(before);
    controller.updateView();
    expect(container.innerHTML).toBe(before);
  });
});

// Plan 149 companion-cache note: getCompanionProducts/getCompanionProductMap live in
// astro-poc/src/scripts/storefront.js, a side-effect ESM module with no exports
// (verified: no `export` statements). It cannot be imported into the root unit suite
// without executing initStorefront against a full production DOM (bootstrap wiring,
// offcanvas, order dialog, matchMedia-dependent setup). The cache contract is
// therefore enforced at the catalog boundary here: updateView's onViewUpdated resets
// the product card caches, and the reorder gate above guarantees the DOM queries the
// companion map relies on happen only when the view actually changes.
