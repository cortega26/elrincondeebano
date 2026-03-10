const test = require('node:test');
const assert = require('node:assert');
const { setupAppDom, teardownAppDom } = require('./helpers/dom-test-utils');

const bootstrapDom = () => {
  setupAppDom(
    '<!DOCTYPE html><html><body><div id="product-container"></div><script id="product-data" type="application/json">{"initialProducts":[]}</script></body></html>',
    { url: 'https://example.com' }
  );
};

test('logPerformanceMetrics reports unavailable metrics when Performance API data is missing', async () => {
  bootstrapDom();
  const { logPerformanceMetrics } = await import('../src/js/script.mjs');
  const events = [];

  const originalPerformance = global.window.performance;
  global.window.performance = {
    getEntriesByType: () => [],
    timing: {},
  };

  logPerformanceMetrics(undefined, (level, message, meta = {}) => {
    events.push({ level, message, meta });
  });

  assert.deepStrictEqual(events, [
    {
      level: 'info',
      message: 'performance_metrics_snapshot',
      meta: {
        firstContentfulPaint: 'unavailable',
        domContentLoaded: 'unavailable',
        loadTime: 'unavailable',
      },
    },
  ]);

  global.window.performance = originalPerformance;

  teardownAppDom();
});

test('logPerformanceMetrics uses available paint and navigation entries', async () => {
  bootstrapDom();
  const { logPerformanceMetrics } = await import('../src/js/script.mjs');
  const events = [];

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

  logPerformanceMetrics(perf, (level, message, meta = {}) => {
    events.push({ level, message, meta });
  });

  assert.deepStrictEqual(events, [
    {
      level: 'info',
      message: 'performance_metrics_snapshot',
      meta: {
        firstContentfulPaint: 123,
        domContentLoaded: 456,
        loadTime: 789,
      },
    },
  ]);

  teardownAppDom();
});

test('logPerformanceMetrics logs a warning when performance access throws', async () => {
  bootstrapDom();
  const { logPerformanceMetrics } = await import('../src/js/script.mjs');
  const events = [];

  const perf = {
    getEntriesByType: () => {
      throw new Error('perf unavailable');
    },
  };

  logPerformanceMetrics(perf, (level, message, meta = {}) => {
    events.push({ level, message, meta });
  });

  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[0].level, 'warn');
  assert.strictEqual(events[0].message, 'performance_metrics_snapshot_failed');
  assert.match(events[0].meta.error.message, /perf unavailable/);
  assert.deepStrictEqual(events[1], {
    level: 'info',
    message: 'performance_metrics_snapshot',
    meta: {
      firstContentfulPaint: 'unavailable',
      domContentLoaded: 'unavailable',
      loadTime: 'unavailable',
    },
  });

  teardownAppDom();
});
