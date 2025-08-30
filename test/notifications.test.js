import test from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { showUpdateNotification, showServiceWorkerError, showConnectivityNotification } from '../assets/js/notifications.js';

function setupDom() {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/' });
  global.window = dom.window;
  global.document = dom.window.document;
  return dom;
}

test('notifications', async (t) => {
  await t.test('showUpdateNotification', () => {
    const dom = setupDom();
    const sw = { postMessage: () => {} };
    showUpdateNotification(sw);
    const toast = dom.window.document.querySelector('.notification-toast');
    assert.ok(toast, 'toast should exist');
    const primary = toast.querySelector('.primary-action');
    const secondary = toast.querySelector('.secondary-action');
    assert.strictEqual(primary.textContent, 'Actualizar ahora');
    assert.strictEqual(secondary.textContent, 'Después');
    primary.dispatchEvent(new dom.window.Event('click'));
    assert.ok(!dom.window.document.querySelector('.notification-toast'));
    showUpdateNotification(sw);
    const toast2 = dom.window.document.querySelector('.notification-toast');
    toast2.querySelector('.secondary-action').dispatchEvent(new dom.window.Event('click'));
    assert.ok(!dom.window.document.querySelector('.notification-toast'));
  });

  await t.test('showServiceWorkerError', () => {
    const dom = setupDom();
    showServiceWorkerError('Error');
    const toast = dom.window.document.querySelector('.notification-toast');
    assert.ok(toast);
    const primary = toast.querySelector('.primary-action');
    const secondary = toast.querySelector('.secondary-action');
    assert.strictEqual(primary.textContent, 'Reload');
    assert.strictEqual(secondary.textContent, 'Dismiss');
    primary.dispatchEvent(new dom.window.Event('click'));
    assert.ok(!dom.window.document.querySelector('.notification-toast'));
    showServiceWorkerError('Error');
    const toast2 = dom.window.document.querySelector('.notification-toast');
    toast2.querySelector('.secondary-action').dispatchEvent(new dom.window.Event('click'));
    assert.ok(!dom.window.document.querySelector('.notification-toast'));
  });

  await t.test('showConnectivityNotification', () => {
    const dom = setupDom();
    showConnectivityNotification('Offline');
    const toast = dom.window.document.querySelector('.notification-toast');
    assert.ok(toast);
    const primary = toast.querySelector('.primary-action');
    const secondary = toast.querySelector('.secondary-action');
    assert.strictEqual(primary.textContent, 'Retry');
    assert.strictEqual(secondary.textContent, 'Dismiss');
    primary.dispatchEvent(new dom.window.Event('click'));
    assert.ok(!dom.window.document.querySelector('.notification-toast'));
    showConnectivityNotification('Offline');
    const toast2 = dom.window.document.querySelector('.notification-toast');
    toast2.querySelector('.secondary-action').dispatchEvent(new dom.window.Event('click'));
    assert.ok(!dom.window.document.querySelector('.notification-toast'));
  });
});
