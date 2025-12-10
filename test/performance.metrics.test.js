const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

const bootstrapDom = () => {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body><div id="product-container"></div><script id="product-data" type="application/json">{"initialProducts":[]}</script></body></html>',
    { url: 'https://example.com' }
  );
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.localStorage = dom.window.localStorage;
  global.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  global.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  return dom;
};

bootstrapDom();

const withPatchedConsole = async (fn) => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const logs = [];
  console.log = (...args) => {
    logs.push(args);
  };
  console.warn = () => {};
  try {
    await fn(logs);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
};

test('logPerformanceMetrics reports unavailable metrics when Performance API data is missing', async () => {
  const { logPerformanceMetrics } = await import('../src/js/script.mjs');

  await withPatchedConsole(async (logs) => {
    const originalPerformance = global.window.performance;
    global.window.performance = {
      getEntriesByType: () => [],
      timing: {},
    };

    logPerformanceMetrics();

    assert.strictEqual(logs.length, 3);
    assert.deepStrictEqual(logs[0], ['First Contentful Paint:', 'unavailable']);
    assert.deepStrictEqual(logs[1], ['DOM Content Loaded:', 'unavailable']);
    assert.deepStrictEqual(logs[2], ['Load Time:', 'unavailable']);

    global.window.performance = originalPerformance;
  });
});

test('logPerformanceMetrics uses available paint and navigation entries', async () => {
  const { logPerformanceMetrics } = await import('../src/js/script.mjs');

  await withPatchedConsole(async (logs) => {
    const perf = {
      getEntriesByType: (type) => {
        if (type === 'paint') {
          return [{ name: 'first-contentful-paint', startTime: 123 }];
        }
        if (type === 'navigation') {
          return [{ domContentLoadedEventEnd: 456, loadEventEnd: 789 }];
        }
        return [];
      },
      timing: {},
    };

    logPerformanceMetrics(perf);

    assert.deepStrictEqual(logs[0], ['First Contentful Paint:', 123]);
    assert.deepStrictEqual(logs[1], ['DOM Content Loaded:', 456]);
    assert.deepStrictEqual(logs[2], ['Load Time:', 789]);
  });
});
