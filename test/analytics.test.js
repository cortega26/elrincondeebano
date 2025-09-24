const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const analyticsModulePath = path.resolve(__dirname, '../src/js/modules/analytics.mjs');
const analyticsModuleUrl = pathToFileURL(analyticsModulePath);

async function importAnalyticsModule(tag) {
  const url = new URL(analyticsModuleUrl.href);
  if (tag) {
    url.searchParams.set('scenario', tag);
  }
  return import(url.href);
}

async function runFreshSetupTest() {
  const listeners = [];
  const idleCallbacks = [];
  const timeouts = [];
  const appendedScripts = [];

  const documentMock = {
    visibilityState: 'visible',
    head: {
      appendChild(element) {
        appendedScripts.push(element);
      }
    },
    createElement(tag) {
      if (tag !== 'script') {
        throw new Error('Unexpected element requested');
      }

      return {
        async: false,
        dataset: {},
        listeners: {},
        set src(value) {
          this._src = value;
        },
        get src() {
          return this._src;
        },
        set nonce(value) {
          this._nonce = value;
        },
        get nonce() {
          return this._nonce;
        },
        addEventListener(event, handler) {
          this.listeners[event] = handler;
        }
      };
    },
    querySelector() {
      return null;
    }
  };

  const windowMock = {
    document: documentMock,
    dataLayer: undefined,
    requestIdleCallback(callback, options) {
      idleCallbacks.push({ callback, options });
      return idleCallbacks.length;
    },
    setTimeout(callback, delay) {
      timeouts.push({ callback, delay });
      return timeouts.length;
    },
    addEventListener(event, handler, options) {
      listeners.push({ event, handler, options });
    }
  };

  global.window = windowMock;
  global.document = documentMock;

  const module = await importAnalyticsModule('fresh');

  module.initializeAnalytics();

  assert.ok(idleCallbacks.length > 0 || timeouts.length > 0, 'analytics should schedule a deferred loader');
  assert.ok(Array.isArray(windowMock.dataLayer), 'dataLayer should be initialised as an array');
  assert.strictEqual(typeof windowMock.gtag, 'function', 'gtag stub should be defined');
  assert.strictEqual(windowMock.dataLayer.length, 2, 'initial config commands should be queued');
  assert.strictEqual(windowMock.__gtagInitialised, true, 'window flag should mark analytics initialised');

  const pointerListener = listeners.find((listener) => listener.event === 'pointerdown');
  assert.ok(pointerListener, 'pointerdown listener should be registered for deferred loading');

  assert.strictEqual(appendedScripts.length, 1, 'gtag script should load immediately');
  assert.ok(appendedScripts[0].async, 'gtag script should load asynchronously');
  assert.ok(appendedScripts[0].src.includes('googletagmanager.com/gtag/js'), 'gtag script should target Google endpoint');

  // Triggering the handler should not append duplicate scripts
  pointerListener.handler();
  assert.strictEqual(appendedScripts.length, 1, 'gtag script should only append once after interaction');

  pointerListener.handler();
  assert.strictEqual(appendedScripts.length, 1, 'gtag script should remain single on repeated triggers');

  const initialListenerCount = listeners.length;
  module.initializeAnalytics();
  assert.strictEqual(listeners.length, initialListenerCount, 'initialiseAnalytics should be idempotent');
  assert.strictEqual(windowMock.dataLayer.length, 2, 'initial config should not queue duplicates on reinitialisation');

  delete global.window;
  delete global.document;
}

async function runPreconfiguredSetupTest() {
  const listeners = [];
  const idleCallbacks = [];
  const timeouts = [];
  const appendedScripts = [];

  const existingScript = {
    dataset: {},
    listeners: {},
    addEventListener(event, handler) {
      this.listeners[event] = handler;
    }
  };

  const preconfiguredLayer = [];
  const gtagStub = function gtag() {
    preconfiguredLayer.push(arguments);
  };

  preconfiguredLayer.push(['js', new Date('2024-01-01T00:00:00Z')]);
  preconfiguredLayer.push(['config', 'G-H0YG3RTJVM', { send_page_view: true, transport_type: 'beacon' }]);

  const documentMock = {
    visibilityState: 'visible',
    head: {
      appendChild(element) {
        appendedScripts.push(element);
      }
    },
    createElement(tag) {
      if (tag !== 'script') {
        throw new Error('Unexpected element requested');
      }

      return {
        async: false,
        dataset: {},
        listeners: {},
        set src(value) {
          this._src = value;
        },
        get src() {
          return this._src;
        },
        set nonce(value) {
          this._nonce = value;
        },
        get nonce() {
          return this._nonce;
        },
        addEventListener(event, handler) {
          this.listeners[event] = handler;
        }
      };
    },
    querySelector() {
      return existingScript;
    }
  };

  const windowMock = {
    document: documentMock,
    dataLayer: preconfiguredLayer,
    gtag: gtagStub,
    requestIdleCallback(callback, options) {
      idleCallbacks.push({ callback, options });
      return idleCallbacks.length;
    },
    setTimeout(callback, delay) {
      timeouts.push({ callback, delay });
      return timeouts.length;
    },
    addEventListener(event, handler, options) {
      listeners.push({ event, handler, options });
    }
  };

  global.window = windowMock;
  global.document = documentMock;

  const module = await importAnalyticsModule('preconfigured');

  module.initializeAnalytics();

  assert.strictEqual(windowMock.gtag, gtagStub, 'existing gtag stub should be preserved');
  assert.strictEqual(windowMock.dataLayer.length, 2, 'preconfigured commands should remain without duplicates');
  assert.strictEqual(windowMock.__gtagInitialised, true, 'window flag should mark analytics initialised');

  const pointerListener = listeners.find((listener) => listener.event === 'pointerdown');
  assert.ok(pointerListener, 'pointerdown listener should be registered with preconfigured dataLayer');
  assert.ok(idleCallbacks.length > 0 || timeouts.length > 0, 'analytics should schedule deferred loader when preconfigured');

  assert.strictEqual(appendedScripts.length, 0, 'gtag script should reuse existing tag without appending');

  const initialLength = windowMock.dataLayer.length;
  module.initializeAnalytics();
  assert.strictEqual(windowMock.dataLayer.length, initialLength, 'reinitialisation should not queue extra commands');

  delete global.window;
  delete global.document;
}

(async () => {
  await runFreshSetupTest();
  await runPreconfiguredSetupTest();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
