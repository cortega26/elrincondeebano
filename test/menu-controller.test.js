const test = require('node:test');
const assert = require('node:assert');
const { createModuleLoader } = require('./helpers/module-loader');
const {
  setupDom,
  teardownDom,
  wait,
  dispatchPointerDown,
} = require('./helpers/dom-test-utils');

const loadModule = createModuleLoader(__dirname);

async function withMenuController(markup, run) {
  setupDom(markup);
  const module = loadModule('../src/js/modules/menu-controller.mjs');
  module.setupUnifiedMenuController();
  try {
    await run();
  } finally {
    module.__resetMenuControllerForTest();
    teardownDom();
  }
}

test('menu controller opens on pointerdown and closes on outside interaction', async () => {
  await withMenuController(
    `<!DOCTYPE html><body>
    <div id="navbar-container">
      <div class="dropdown">
        <a id="firstToggle" class="dropdown-toggle" href="#" data-bs-toggle="dropdown" aria-expanded="false">Primero</a>
        <ul class="dropdown-menu" id="firstMenu"></ul>
      </div>
    </div>
  </body>`,
    async () => {
      const firstToggle = document.getElementById('firstToggle');
      dispatchPointerDown(firstToggle);
      await wait(25);

      assert.strictEqual(firstToggle.getAttribute('aria-expanded'), 'true');
      assert.ok(document.getElementById('firstMenu').classList.contains('show'));

      dispatchPointerDown(document.body);
      await wait(0);

      assert.strictEqual(firstToggle.getAttribute('aria-expanded'), 'false');
      assert.ok(!document.getElementById('firstMenu').classList.contains('show'));
    }
  );
});

test('menu controller closes previous dropdown when opening a new one', async () => {
  await withMenuController(
    `<!DOCTYPE html><body>
    <div id="navbar-container">
      <div class="dropdown">
        <a id="firstToggle" class="dropdown-toggle" href="#" data-bs-toggle="dropdown" aria-expanded="false">Primero</a>
        <ul class="dropdown-menu" id="firstMenu"></ul>
      </div>
      <div class="dropdown">
        <a id="secondToggle" class="dropdown-toggle" href="#" data-bs-toggle="dropdown" aria-expanded="false">Segundo</a>
        <ul class="dropdown-menu" id="secondMenu"></ul>
      </div>
    </div>
  </body>`,
    async () => {
      const firstToggle = document.getElementById('firstToggle');
      const secondToggle = document.getElementById('secondToggle');

      dispatchPointerDown(firstToggle);
      await wait(25);
      assert.strictEqual(firstToggle.getAttribute('aria-expanded'), 'true');
      assert.ok(document.getElementById('firstMenu').classList.contains('show'));

      dispatchPointerDown(secondToggle);
      await wait(25);

      assert.strictEqual(firstToggle.getAttribute('aria-expanded'), 'false');
      assert.ok(!document.getElementById('firstMenu').classList.contains('show'));
      assert.strictEqual(secondToggle.getAttribute('aria-expanded'), 'true');
      assert.ok(document.getElementById('secondMenu').classList.contains('show'));
    }
  );
});
