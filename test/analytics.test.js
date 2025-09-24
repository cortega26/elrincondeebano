const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

let importCounter = 0;

async function loadAnalyticsModule() {
  importCounter += 1;
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/js/modules/analytics.mjs'));
  return import(`${moduleUrl.href}?v=${importCounter}`);
}

function createEnvironment({ preconfigured = false } = {}) {
  const listeners = [];
  const idleCallbacks = [];
  const timeouts = [];
  const appendedScripts = [];
  const existingScript = {
    dataset: { loaded: 'true' },
    addEventListener() {}
  };

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
      return preconfigured ? existingScript : null;
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

  if (preconfigured) {
    windowMock.dataLayer = [
      ['js', new Date()],
      ['config', 'G-H0YG3RTJVM', { send_page_view: true }]
    ];
    windowMock.gtag = function gtag() {
      windowMock.dataLayer.push(Array.from(arguments));
    };
    windowMock.__gtagInitialised = false;
  }

  return {
    listeners,
    idleCallbacks,
    timeouts,
    appendedScripts,
    documentMock,
    windowMock
  };
}

async function runInitialisationFromScratch() {
  const env = createEnvironment();
  global.window = env.windowMock;
  global.document = env.documentMock;

  const module = await loadAnalyticsModule();

  module.initializeAnalytics();

  assert.ok(env.idleCallbacks.length > 0 || env.timeouts.length > 0, 'analytics should schedule a deferred loader');
  assert.ok(Array.isArray(env.windowMock.dataLayer), 'dataLayer should be initialised as an array');
  assert.strictEqual(typeof env.windowMock.gtag, 'function', 'gtag stub should be defined');
  assert.strictEqual(env.windowMock.dataLayer.length, 2, 'initial config commands should be queued');
  assert.strictEqual(env.windowMock.__gtagInitialised, true, 'window flag should mark analytics initialised');

  const pointerListener = env.listeners.find((listener) => listener.event === 'pointerdown');
  assert.ok(pointerListener, 'pointerdown listener should be registered for deferred loading');

  assert.strictEqual(env.appendedScripts.length, 1, 'gtag script should load immediately');
  assert.ok(env.appendedScripts[0].async, 'gtag script should load asynchronously');
  assert.ok(env.appendedScripts[0].src.includes('googletagmanager.com/gtag/js'), 'gtag script should target Google endpoint');

  pointerListener.handler();
  assert.strictEqual(env.appendedScripts.length, 1, 'gtag script should only append once after interaction');

  pointerListener.handler();
  assert.strictEqual(env.appendedScripts.length, 1, 'gtag script should remain single on repeated triggers');

  const initialListenerCount = env.listeners.length;
  module.initializeAnalytics();
  assert.strictEqual(env.listeners.length, initialListenerCount, 'initialiseAnalytics should be idempotent');
  assert.strictEqual(env.windowMock.dataLayer.length, 2, 'initial config should not queue duplicates on reinitialisation');

  delete global.window;
  delete global.document;
}

async function runRespectsPreconfiguredSnippet() {
  const env = createEnvironment({ preconfigured: true });
  global.window = env.windowMock;
  global.document = env.documentMock;

  const module = await loadAnalyticsModule();

  module.initializeAnalytics();

  assert.strictEqual(env.windowMock.__gtagInitialised, true, 'existing config should mark analytics initialised');
  assert.strictEqual(env.windowMock.dataLayer.length, 2, 'existing dataLayer entries should remain unchanged');
  assert.strictEqual(env.appendedScripts.length, 0, 'existing script should prevent duplicate loader injection');

  delete global.window;
  delete global.document;
}

(async () => {
  await runInitialisationFromScratch();
  await runRespectsPreconfiguredSnippet();
})();
