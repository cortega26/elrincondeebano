const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

(async () => {
  global.window = { addEventListener() {}, navigator: {} };
  global.document = { addEventListener() {}, getElementById: () => null };
  const {
    showUpdateNotification,
    showServiceWorkerError,
    showConnectivityNotification,
  } = await import('../src/js/modules/notifications.mjs');

  function setupDom() {
    const dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/' });
    dom.window.setTimeout = () => ({ unref() {} });
    global.setTimeout = dom.window.setTimeout;
    delete dom.window.navigator.serviceWorker;
    dom.window.document.addEventListener = () => {};
    dom.window.location.reload = () => {};
    global.window = dom.window;
    global.document = dom.window.document;
    return dom;
  }

  test('notifications', async (t) => {
    await t.test('showUpdateNotification', () => {
      const dom = setupDom();
      const sw = { postMessage: () => {} };
      showUpdateNotification(sw);
      const toast = document.querySelector('.notification-toast');
      assert.ok(toast, 'toast should exist');
      const primary = toast.querySelector('.primary-action');
      const secondary = toast.querySelector('.secondary-action');
      assert.strictEqual(primary.textContent, 'Actualizar ahora');
      assert.strictEqual(secondary.textContent, 'Después');
      primary.dispatchEvent(new dom.window.Event('click'));
      assert.ok(!document.querySelector('.notification-toast'));
      showUpdateNotification(sw);
      const toast2 = document.querySelector('.notification-toast');
      toast2.querySelector('.secondary-action').dispatchEvent(new dom.window.Event('click'));
      assert.ok(!document.querySelector('.notification-toast'));
    });

    await t.test('showServiceWorkerError', () => {
      const dom = setupDom();
      showServiceWorkerError('Error');
      const toast = document.querySelector('.notification-toast');
      assert.ok(toast, 'toast should exist');
      const primary = toast.querySelector('.primary-action');
      const secondary = toast.querySelector('.secondary-action');
      assert.strictEqual(primary.textContent, 'Reload');
      assert.strictEqual(secondary.textContent, 'Dismiss');
      primary.dispatchEvent(new dom.window.Event('click'));
      assert.ok(!document.querySelector('.notification-toast'));
      showServiceWorkerError('Error');
      const toast2 = document.querySelector('.notification-toast');
      toast2.querySelector('.secondary-action').dispatchEvent(new dom.window.Event('click'));
      assert.ok(!document.querySelector('.notification-toast'));
    });

    await t.test('showConnectivityNotification', () => {
      const dom = setupDom();
      showConnectivityNotification('Offline');
      const toast = document.querySelector('.notification-toast');
      assert.ok(toast, 'toast should exist');
      const primary = toast.querySelector('.primary-action');
      const secondary = toast.querySelector('.secondary-action');
      assert.strictEqual(primary.textContent, 'Retry');
      assert.strictEqual(secondary.textContent, 'Dismiss');
      primary.dispatchEvent(new dom.window.Event('click'));
      assert.ok(!document.querySelector('.notification-toast'));
      showConnectivityNotification('Offline');
      const toast2 = document.querySelector('.notification-toast');
      toast2.querySelector('.secondary-action').dispatchEvent(new dom.window.Event('click'));
      assert.ok(!document.querySelector('.notification-toast'));
    });
  });
})().catch(err => {
  console.error(err);
  process.exit(1);
});
