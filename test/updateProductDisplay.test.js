const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(`<!DOCTYPE html><div id="product-container"></div>
<button id="catalog-load-more" class="d-none"></button>
<div id="catalog-sentinel"></div>`);

global.window = dom.window;
global.document = dom.window.document;

const products = [
  { id: 1, name: 'Banana', description: 'Yellow banana', price: 2, discount: 1, stock: true, originalIndex: 0 },
  { id: 2, name: 'Apple', description: 'Red apple', price: 3, discount: 0, stock: true, originalIndex: 1 },
  { id: 3, name: 'Cherry', description: 'Red cherry', price: 5, discount: 0, stock: true, originalIndex: 2 },
  { id: 4, name: 'Date', description: 'Sweet date', price: 4, discount: 0, stock: true, originalIndex: 3 }
];

const INITIAL_BATCH = 2;
const SUBSEQUENT_BATCH = 2;
let filteredProducts = [...products];
let visibleCount = 0;

function sortProducts(a, b, criterion) {
  if (!criterion || criterion === 'original') {
    return a.originalIndex - b.originalIndex;
  }
  const [property, order] = criterion.split('-');
  const valueA = property === 'price' ? a.price - (a.discount || 0) : a.name.toLowerCase();
  const valueB = property === 'price' ? b.price - (b.discount || 0) : b.name.toLowerCase();
  return order === 'asc'
    ? (valueA < valueB ? -1 : valueA > valueB ? 1 : 0)
    : (valueB < valueA ? -1 : valueB > valueA ? 1 : 0);
}

function applyFilters(keyword = '', sortCriterion = 'original', discountOnly = false) {
  const lower = keyword.toLowerCase();
  return products
    .filter(p => (
      (p.name.toLowerCase().includes(lower) || p.description.toLowerCase().includes(lower)) &&
      p.stock && (!discountOnly || (p.discount && Number(p.discount) > 0))
    ))
    .sort((a, b) => sortProducts(a, b, sortCriterion));
}

function updateLoadMore(hasMore) {
  const loadMoreButton = document.getElementById('catalog-load-more');
  loadMoreButton.classList.toggle('d-none', !hasMore);
  loadMoreButton.disabled = !hasMore;
}

function renderProducts(list) {
  const container = document.getElementById('product-container');
  const fragment = document.createDocumentFragment();
  list.forEach(p => {
    const div = document.createElement('div');
    div.className = 'product';
    div.textContent = p.name;
    fragment.appendChild(div);
  });
  container.appendChild(fragment);
}

function clearProducts() {
  const container = document.getElementById('product-container');
  container.innerHTML = '';
  visibleCount = 0;
}

function appendBatch(size) {
  const next = filteredProducts.slice(visibleCount, visibleCount + size);
  if (!next.length) {
    updateLoadMore(false);
    return 0;
  }
  renderProducts(next);
  visibleCount += next.length;
  updateLoadMore(visibleCount < filteredProducts.length);
  return next.length;
}

function updateProductDisplay({ keyword = '', sort = 'original', discountOnly = false } = {}) {
  filteredProducts = applyFilters(keyword, sort, discountOnly);
  clearProducts();
  if (!filteredProducts.length) {
    updateLoadMore(false);
    return;
  }
  appendBatch(INITIAL_BATCH);
}

function loadMore() {
  appendBatch(SUBSEQUENT_BATCH);
}

function getDisplayedNames() {
  return Array.from(document.querySelectorAll('#product-container .product')).map(el => el.textContent);
}

test('updateProductDisplay incremental flow', async (t) => {
  await t.test('initial render limits to first batch', () => {
    updateProductDisplay();
    assert.deepStrictEqual(getDisplayedNames(), ['Banana', 'Apple']);
    const loadMoreButton = document.getElementById('catalog-load-more');
    assert.strictEqual(loadMoreButton.classList.contains('d-none'), false);
  });

  await t.test('load more appends additional products', () => {
    loadMore();
    assert.deepStrictEqual(getDisplayedNames(), ['Banana', 'Apple', 'Cherry', 'Date']);
  });

  await t.test('filtering resets visible batch', () => {
    updateProductDisplay({ keyword: 'che' });
    assert.deepStrictEqual(getDisplayedNames(), ['Cherry']);
    const loadMoreButton = document.getElementById('catalog-load-more');
    assert.strictEqual(loadMoreButton.classList.contains('d-none'), true);
  });

  await t.test('discount-only filter respects incremental flow', () => {
    updateProductDisplay({ discountOnly: true });
    assert.deepStrictEqual(getDisplayedNames(), ['Banana']);
  });
});

