const assert = require('assert');

(async () => {
  const originalSetInterval = global.setInterval;
  const originalSetTimeout = global.setTimeout;
  global.setInterval = () => 0;
  global.setTimeout = () => 0;

  const windowListeners = new Map();
  const documentListeners = new Map();
  const bodyChildren = new Set();

  const documentMock = {
    _readyState: 'complete',
    get readyState() {
      return this._readyState;
    },
    set readyState(value) {
      this._readyState = value;
    },
    addEventListener(event, handler) {
      documentListeners.set(event, handler);
    },
    querySelector(selector) {
      if (selector === '.notification-toast') {
        for (const child of bodyChildren) {
          if (child.className === 'notification-toast') {
            return child;
          }
        }
      }
      return null;
    },
    getElementById() {
      return null;
    },
    createElement() {
      const element = {
        className: '',
        attributes: {},
        style: {},
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        innerHTML: '',
        querySelector() {
          return {
            addEventListener: () => {},
            remove: () => {}
          };
        },
        remove() {
          bodyChildren.delete(element);
        },
        classList: {
          toggle: () => {}
        }
      };
      return element;
    },
    body: {
      appendChild(element) {
        bodyChildren.add(element);
      },
      contains(element) {
        return bodyChildren.has(element);
      }
    }
  };

  const windowMock = {
    addEventListener(event, handler) {
      if (!windowListeners.has(event)) {
        windowListeners.set(event, new Set());
      }
      windowListeners.get(event).add(handler);
    },
    removeEventListener(event, handler) {
      const handlers = windowListeners.get(event);
      if (!handlers) {
        return;
      }
      handlers.delete(handler);
      if (handlers.size === 0) {
        windowListeners.delete(event);
      }
    },
    location: {
      reload: () => {}
    },
    document: documentMock
  };

  const storage = {};
  global.localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
    },
    setItem(key, value) {
      storage[key] = String(value);
    }
  };

  let registerCalls = 0;
  const registrationMock = {
    scope: '/',
    addEventListener: () => {},
    installing: {
      addEventListener: () => {},
      state: 'installed',
      postMessage: () => {}
    },
    active: {
      postMessage: () => {}
    },
    update: async () => {}
  };

  const serviceWorkerMock = {
    register: async () => {
      registerCalls += 1;
      return registrationMock;
    },
    addEventListener: () => {},
    controller: {}
  };

  global.fetch = async () => ({
    ok: true,
    json: async () => ({ version: '1' })
  });

  global.window = windowMock;
  global.document = documentMock;
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      serviceWorker: serviceWorkerMock,
      onLine: true
    },
    configurable: true,
    writable: true
  });

  windowMock.navigator = global.navigator;

  const module = await import('../src/js/script.mjs');
  await new Promise(resolve => setImmediate(resolve));

  assert.strictEqual(registerCalls, 1, 'service worker should register immediately when document is complete');
  assert.strictEqual(windowListeners.has('load'), false, 'load listener should be removed after registration');

  module.__resetServiceWorkerRegistrationForTest();
  document.readyState = 'complete';

  module.__registerServiceWorkerForTest();
  await new Promise(resolve => setImmediate(resolve));

  assert.strictEqual(registerCalls, 2, 'service worker should register after reset');
  assert.strictEqual(windowListeners.has('load'), false, 'load listener should be cleaned up after reset registration');

  module.__registerServiceWorkerForTest();
  await new Promise(resolve => setImmediate(resolve));

  assert.strictEqual(registerCalls, 2, 'registerServiceWorker should not run multiple times without reset');
  assert.strictEqual(windowListeners.has('load'), false, 'load listener should not be reattached on repeated calls');

  global.setInterval = originalSetInterval;
  global.setTimeout = originalSetTimeout;

  console.log('registerServiceWorker tests passed');
})();
