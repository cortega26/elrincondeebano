const test = require('node:test');
const assert = require('node:assert');
const { createModuleLoader } = require('./helpers/module-loader');
const { setupDom, teardownDom, wait } = require('./helpers/dom-test-utils');

const loadModule = createModuleLoader(__dirname);

function setupServiceDialogDom() {
  setupDom(`<!DOCTYPE html><body>
    <button type="button" data-service-dialog-trigger>Cómo funciona</button>
    <dialog id="service-guide-dialog" aria-hidden="true">
      <button type="button" data-service-dialog-close>Cerrar</button>
    </dialog>
  </body>`);

  global.localStorage = window.localStorage;

  const dialog = document.getElementById('service-guide-dialog');
  dialog.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  dialog.close = function close() {
    this.removeAttribute('open');
    this.dispatchEvent(new window.Event('close'));
  };

  return dialog;
}

function cleanupServiceDialogDom() {
  delete global.localStorage;
  teardownDom();
}

test('initServiceOnboarding auto-opens once and persists the visit', async () => {
  const dialog = setupServiceDialogDom();
  const { initServiceOnboarding } = loadModule('../src/js/modules/service-onboarding.mjs');

  initServiceOnboarding({ delayMs: 0, storage: localStorage });
  await wait(10);

  assert.ok(dialog.hasAttribute('open'), 'dialog should open on the first visit');
  assert.strictEqual(dialog.getAttribute('aria-hidden'), 'false');
  assert.strictEqual(localStorage.getItem('ebano-service-guide-seen'), 'true');
  assert.ok(document.body.classList.contains('service-dialog-open'));

  cleanupServiceDialogDom();
});

test('initServiceOnboarding respects the persisted first-visit flag', async () => {
  const dialog = setupServiceDialogDom();
  localStorage.setItem('ebano-service-guide-seen', 'true');
  const { initServiceOnboarding } = loadModule('../src/js/modules/service-onboarding.mjs');

  initServiceOnboarding({ delayMs: 0, storage: localStorage });
  await wait(10);

  assert.ok(!dialog.hasAttribute('open'), 'dialog should stay closed after the first visit');
  assert.strictEqual(dialog.getAttribute('aria-hidden'), 'true');

  cleanupServiceDialogDom();
});

test('initServiceOnboarding opens from the trigger and closes from dialog controls', async () => {
  setupServiceDialogDom();
  const { initServiceOnboarding } = loadModule('../src/js/modules/service-onboarding.mjs');
  const controller = initServiceOnboarding({ autoShow: false, storage: localStorage });
  const trigger = document.querySelector('[data-service-dialog-trigger]');
  const closeButton = document.querySelector('[data-service-dialog-close]');

  trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.ok(controller.dialog.hasAttribute('open'), 'dialog should open from the trigger');
  assert.strictEqual(localStorage.getItem('ebano-service-guide-seen'), 'true');

  closeButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.ok(!controller.dialog.hasAttribute('open'), 'dialog should close from dialog controls');
  assert.strictEqual(controller.dialog.getAttribute('aria-hidden'), 'true');
  assert.ok(!document.body.classList.contains('service-dialog-open'));

  cleanupServiceDialogDom();
});
