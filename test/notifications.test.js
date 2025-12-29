const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const { setBaseGlobals } = require('./helpers/dom-globals');

(async () => {
  setBaseGlobals();
  const { showUpdateNotification, showServiceWorkerError, showConnectivityNotification } =
    await import('../src/js/modules/notifications.mjs');

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

  function getToastActions(primaryLabel, secondaryLabel) {
    const toast = document.querySelector('.notification-toast');
    assert.ok(toast, 'toast should exist');
    const primary = toast.querySelector('.primary-action');
    const secondary = toast.querySelector('.secondary-action');
    assert.strictEqual(primary.textContent, primaryLabel);
    assert.strictEqual(secondary.textContent, secondaryLabel);
    return { primary, secondary };
  }

  function assertToastCleared() {
    assert.ok(!document.querySelector('.notification-toast'));
  }

  function runNotificationFlow(dom, invoke, labels) {
    invoke();
    let actions = getToastActions(labels.primary, labels.secondary);
    actions.primary.dispatchEvent(new dom.window.Event('click'));
    assertToastCleared();
    invoke();
    actions = getToastActions(labels.primary, labels.secondary);
    actions.secondary.dispatchEvent(new dom.window.Event('click'));
    assertToastCleared();
  }

  test('notifications', async (t) => {
    await t.test('showUpdateNotification', () => {
      const dom = setupDom();
      const sw = { postMessage: () => {} };
      runNotificationFlow(dom, () => showUpdateNotification(sw), {
        primary: 'Actualizar ahora',
        secondary: 'Después',
      });
    });

    await t.test('showServiceWorkerError', () => {
      const dom = setupDom();
      runNotificationFlow(dom, () => showServiceWorkerError('Error'), {
        primary: 'Reload',
        secondary: 'Dismiss',
      });
    });

    await t.test('showConnectivityNotification', () => {
      const dom = setupDom();
      runNotificationFlow(dom, () => showConnectivityNotification('Offline'), {
        primary: 'Retry',
        secondary: 'Dismiss',
      });
    });
  });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
