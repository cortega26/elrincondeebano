const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

// Setup JSDOM environment
const dom = new JSDOM(`<!DOCTYPE html><div id="product-container"></div>
<input id="filter-keyword" />
<select id="sort-options"></select>
<input type="checkbox" id="filter-discount" />`);

global.window = dom.window;
global.document = dom.window.document;

const sortOptions = document.getElementById('sort-options');
const filterKeyword = document.getElementById('filter-keyword');
const discountCheckbox = document.getElementById('filter-discount');

// Sample products
const products = [
  { id: 1, name: 'Banana', description: 'Yellow banana', price: 2, discount: 1, stock: true, originalIndex: 0 },
  { id: 2, name: 'Apple', description: 'Red apple', price: 3, discount: 0, stock: true, originalIndex: 1 },
  { id: 3, name: 'Cherry', description: 'Red cherry', price: 5, discount: 0, stock: true, originalIndex: 2 }
];

function memoize(fn) {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

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

function filterProducts(list, keyword, sortCriterion, discountOnly = false) {
  return list
    .filter(p => (
      p.name.toLowerCase().includes(keyword.toLowerCase()) ||
      p.description.toLowerCase().includes(keyword.toLowerCase())
    ) && p.stock && (!discountOnly || (p.discount && Number(p.discount) > 0)))
    .sort((a, b) => sortProducts(a, b, sortCriterion));
}

const memoizedFilterProducts = memoize(filterProducts);

function renderProducts(list) {
  const container = document.getElementById('product-container');
  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  list.forEach(p => {
    const div = document.createElement('div');
    div.className = 'product';
    div.textContent = p.name;
    frag.appendChild(div);
  });
  container.appendChild(frag);
}

function updateProductDisplay() {
  const criterion = sortOptions.value || 'original';
  const keyword = filterKeyword.value.trim();
  const discountOnly = document.getElementById('filter-discount')?.checked || false;
  const filteredAndSorted = memoizedFilterProducts(products, keyword, criterion, discountOnly);
  renderProducts(filteredAndSorted);
}

function getDisplayedNames() {
  return Array.from(document.querySelectorAll('#product-container .product')).map(el => el.textContent);
}

test('updateProductDisplay', async (t) => {
  await t.test('sorts by price ascending', () => {
    sortOptions.value = 'price-asc';
    filterKeyword.value = '';
    discountCheckbox.checked = false;
    updateProductDisplay();
    assert.deepStrictEqual(getDisplayedNames(), ['Banana', 'Apple', 'Cherry']);
  });

  await t.test('filters by keyword', () => {
    sortOptions.value = 'original';
    filterKeyword.value = 'cher';
    discountCheckbox.checked = false;
    updateProductDisplay();
    assert.deepStrictEqual(getDisplayedNames(), ['Cherry']);
  });

  await t.test('filters discount only', () => {
    sortOptions.value = 'original';
    filterKeyword.value = '';
    discountCheckbox.checked = true;
    updateProductDisplay();
    assert.deepStrictEqual(getDisplayedNames(), ['Banana']);
  });
});

