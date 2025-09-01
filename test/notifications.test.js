const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '../src/js/script.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

function setupDom() {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', {
    url: 'http://localhost/',
    runScripts: 'outside-only',
  });
  // Prevent long-running timers and service worker registration from blocking tests
  dom.window.setTimeout = () => ({ unref() {} });
  delete dom.window.navigator.serviceWorker;
  dom.window.document.addEventListener = () => {};
  vm.runInContext(scriptContent, dom.getInternalVMContext());
  return dom;
}

test('notifications', async (t) => {
  await t.test('showUpdateNotification', () => {
    const dom = setupDom();
    const { window } = dom;
    const sw = { postMessage: () => {} };
    window.showUpdateNotification(sw);
    const toast = window.document.querySelector('.notification-toast');
    assert.ok(toast, 'toast should exist');
    const primary = toast.querySelector('.primary-action');
    const secondary = toast.querySelector('.secondary-action');
    assert.strictEqual(primary.textContent, 'Actualizar ahora');
    assert.strictEqual(secondary.textContent, 'Después');
    // primary click removes toast
    primary.dispatchEvent(new window.Event('click'));
    assert.ok(!window.document.querySelector('.notification-toast'));
    // secondary click removes toast
    window.showUpdateNotification(sw);
    const toast2 = window.document.querySelector('.notification-toast');
    toast2.querySelector('.secondary-action').dispatchEvent(new window.Event('click'));
    assert.ok(!window.document.querySelector('.notification-toast'));
  });

  await t.test('showServiceWorkerError', () => {
    const dom = setupDom();
    const { window } = dom;
    window.showServiceWorkerError('Error');
    const toast = window.document.querySelector('.notification-toast');
    assert.ok(toast, 'toast should exist');
    const primary = toast.querySelector('.primary-action');
    const secondary = toast.querySelector('.secondary-action');
    assert.strictEqual(primary.textContent, 'Reload');
    assert.strictEqual(secondary.textContent, 'Dismiss');
    primary.dispatchEvent(new window.Event('click'));
    assert.ok(!window.document.querySelector('.notification-toast'));
    window.showServiceWorkerError('Error');
    const toast2 = window.document.querySelector('.notification-toast');
    toast2.querySelector('.secondary-action').dispatchEvent(new window.Event('click'));
    assert.ok(!window.document.querySelector('.notification-toast'));
  });

  await t.test('showConnectivityNotification', () => {
    const dom = setupDom();
    const { window } = dom;
    window.showConnectivityNotification('Offline');
    const toast = window.document.querySelector('.notification-toast');
    assert.ok(toast, 'toast should exist');
    const primary = toast.querySelector('.primary-action');
    const secondary = toast.querySelector('.secondary-action');
    assert.strictEqual(primary.textContent, 'Retry');
    assert.strictEqual(secondary.textContent, 'Dismiss');
    primary.dispatchEvent(new window.Event('click'));
    assert.ok(!window.document.querySelector('.notification-toast'));
    window.showConnectivityNotification('Offline');
    const toast2 = window.document.querySelector('.notification-toast');
    toast2.querySelector('.secondary-action').dispatchEvent(new window.Event('click'));
    assert.ok(!window.document.querySelector('.notification-toast'));
  });
});
