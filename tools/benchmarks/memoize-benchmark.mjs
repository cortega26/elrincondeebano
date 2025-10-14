import { performance } from 'node:perf_hooks';

const documentStub = {
  readyState: 'loading',
  addEventListener() {},
  removeEventListener() {},
  querySelector() { return null; },
  getElementById() { return null; },
  createElement() {
    return {
      setAttribute() {},
      appendChild() {},
      remove() {},
      querySelector() { return null; },
      classList: { add() {}, remove() {}, toggle() {} }
    };
  },
  createTextNode(text) {
    return { textContent: text };
  },
  body: {
    appendChild() {},
    contains() { return false; }
  }
};

const windowStub = {
  addEventListener() {},
  removeEventListener() {},
  location: { reload() {} },
  document: documentStub
};

const serviceWorkerStub = {
  register: async () => ({ addEventListener() {}, installing: null, active: null }),
  addEventListener() {},
  controller: null
};

global.window = windowStub;
global.document = documentStub;
Object.defineProperty(globalThis, 'navigator', {
  value: { serviceWorker: serviceWorkerStub, onLine: true },
  configurable: true
});
windowStub.navigator = global.navigator;

function defineLegacyMemoize() {
  global.legacyMemoize = (fn, cacheSize = 100) => {
    const cache = new Map();
    return (...args) => {
      const key = JSON.stringify(args);
      if (cache.has(key)) {
        return cache.get(key);
      }
      const result = fn(...args);
      if (cache.size >= cacheSize) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
      }
      cache.set(key, result);
      return result;
    };
  };
}

const products = generateProducts(2000);
const keywords = ['vino', 'cerveza', 'queso', 'chocolate', 'galletas', 'aceite', 'te'];
const sortCriteria = ['original', 'price-asc', 'price-desc', 'name-asc'];
const iterations = 5000;

function generateProducts(count) {
  const items = [];
  for (let i = 0; i < count; i += 1) {
    items.push({
      id: i,
      name: `Producto ${i}`,
      description: `Descripción gourmet número ${i}`,
      price: 500 + (i % 200) * 10,
      discount: i % 3 === 0 ? 150 : 0,
      stock: i % 5 !== 0,
      originalIndex: i
    });
  }
  return items;
}

function filterScenario(productsList, keyword, sortCriterion, discountOnly = false) {
  const normalizedKeyword = keyword.toLowerCase();
  const matches = [];
  for (let i = 0; i < productsList.length; i += 1) {
    const product = productsList[i];
    if (!product.stock) {
      continue;
    }
    if (discountOnly && !(product.discount && product.discount > 0)) {
      continue;
    }
    if (normalizedKeyword) {
      const name = product.name.toLowerCase();
      const description = product.description.toLowerCase();
      if (!name.includes(normalizedKeyword) && !description.includes(normalizedKeyword)) {
        continue;
      }
    }
    matches.push(product);
  }
  switch (sortCriterion) {
    case 'price-asc':
      matches.sort((a, b) => (a.price - a.discount) - (b.price - b.discount));
      break;
    case 'price-desc':
      matches.sort((a, b) => (b.price - b.discount) - (a.price - a.discount));
      break;
    case 'name-asc':
      matches.sort((a, b) => a.name.localeCompare(b.name));
      break;
    default:
      matches.sort((a, b) => a.originalIndex - b.originalIndex);
      break;
  }
  return matches.length;
}

function runBenchmark(label, memoizeImpl) {
  const memoized = memoizeImpl(filterScenario, 200);
  for (let i = 0; i < keywords.length; i += 1) {
    memoized(products, keywords[i], sortCriteria[i % sortCriteria.length], i % 2 === 0);
  }
  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    const keyword = keywords[i % keywords.length];
    const sortCriterion = sortCriteria[i % sortCriteria.length];
    const discountOnly = i % 3 === 0;
    memoized(products, keyword, sortCriterion, discountOnly);
  }
  const duration = performance.now() - start;
  return duration;
}

async function main() {
  defineLegacyMemoize();
  const { __memoizeForTest: optimizedMemoize } = await import('../../src/js/script.mjs');

  const legacyDuration = runBenchmark('legacy', global.legacyMemoize);
  const optimizedDuration = runBenchmark('optimized', optimizedMemoize);

  console.log('Memoize benchmark (2000 products,', iterations, 'queries)');
  console.log(`Legacy JSON.stringify cache key: ${legacyDuration.toFixed(2)} ms`);
  console.log(`Optimized structural cache:      ${optimizedDuration.toFixed(2)} ms`);
  console.log(`Speedup: ${(legacyDuration / optimizedDuration).toFixed(2)}x faster`);
}

main().catch((error) => {
  console.error('Memoize benchmark failed:', error);
  process.exit(1);
});

