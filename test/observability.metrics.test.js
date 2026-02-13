'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setupAppDom, teardownAppDom } = require('./helpers/dom-test-utils');

async function loadObservabilityModule() {
  return import('../src/js/modules/observability.mjs');
}

test('observability records slow endpoints and strips query strings', async () => {
  setupAppDom('<!DOCTYPE html><html><body></body></html>', { url: 'https://example.com' });
  const observability = await loadObservabilityModule();
  observability.__resetObservabilityForTest();

  try {
    observability.initObservability({ enabled: true, slowEndpointMs: 100 });
    observability.recordEndpointMetric({
      name: 'product_data_fetch',
      url: 'https://example.com/data/product_data.json?v=1',
      method: 'get',
      status: 200,
      durationMs: 80,
    });
    observability.recordEndpointMetric({
      name: 'product_data_fetch',
      url: 'https://example.com/data/product_data.json?v=2',
      method: 'get',
      status: 200,
      durationMs: 180,
    });

    const snapshot = observability.getObservabilitySnapshot();
    assert.equal(snapshot.endpoints.total, 2);
    assert.equal(snapshot.endpoints.slow.length, 1);
    assert.equal(snapshot.endpoints.slow[0].path, '/data/product_data.json');
    assert.equal(snapshot.endpoints.slow[0].method, 'GET');
    assert.equal(snapshot.endpoints.slow[0].durationMs, 180);
  } finally {
    observability.__resetObservabilityForTest();
    teardownAppDom();
  }
});

test('observability tracks runtime errors and unhandled rejections', async () => {
  setupAppDom('<!DOCTYPE html><html><body></body></html>', { url: 'https://example.com' });
  const observability = await loadObservabilityModule();
  observability.__resetObservabilityForTest();

  try {
    observability.initObservability({ enabled: true, slowEndpointMs: 100 });
    window.dispatchEvent(new window.Event('error'));
    window.dispatchEvent(new window.Event('unhandledrejection'));

    const snapshot = observability.getObservabilitySnapshot();
    assert.equal(snapshot.errors.total, 2);
    assert.equal(snapshot.errors.runtime, 1);
    assert.equal(snapshot.errors.unhandledRejection, 1);
  } finally {
    observability.__resetObservabilityForTest();
    teardownAppDom();
  }
});

test('observability captures web vitals when PerformanceObserver is available', async () => {
  setupAppDom('<!DOCTYPE html><html><body></body></html>', { url: 'https://example.com' });
  const originalPerformanceObserver = global.PerformanceObserver;
  const observability = await loadObservabilityModule();
  observability.__resetObservabilityForTest();

  class FakePerformanceObserver {
    constructor(callback) {
      this.callback = callback;
    }

    observe({ type }) {
      if (type === 'largest-contentful-paint') {
        this.callback({
          getEntries: () => [{ startTime: 123.4 }],
        });
      } else if (type === 'layout-shift') {
        this.callback({
          getEntries: () => [{ value: 0.03, hadRecentInput: false }],
        });
      } else if (type === 'event') {
        this.callback({
          getEntries: () => [{ interactionId: 1, duration: 222.9 }],
        });
      }
    }

    disconnect() {}
  }

  global.PerformanceObserver = FakePerformanceObserver;

  try {
    observability.initObservability({ enabled: true, slowEndpointMs: 100 });
    const snapshot = observability.getObservabilitySnapshot();
    assert.equal(snapshot.webVitals.lcp, 123);
    assert.equal(Number(snapshot.webVitals.cls.toFixed(2)), 0.03);
    assert.equal(snapshot.webVitals.inp, 223);
  } finally {
    observability.__resetObservabilityForTest();
    if (typeof originalPerformanceObserver === 'undefined') {
      delete global.PerformanceObserver;
    } else {
      global.PerformanceObserver = originalPerformanceObserver;
    }
    teardownAppDom();
  }
});
