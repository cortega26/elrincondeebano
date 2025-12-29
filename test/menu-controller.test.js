const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');

function loadModule(relPath) {
  const filePath = path.join(__dirname, relPath);
  let code = fs.readFileSync(filePath, 'utf8');
  code = code.replace(/export\s+(async\s+)?function\s+(\w+)/g, 'exports.$2 = $1function $2');
  code = code.replace(/export\s+\{([^}]+)\};?/g, (_, names) => {
    return names
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => `exports.${name} = ${name};`)
      .join('\n');
  });
  const exports = {};
  const wrapper = new Function('exports', 'loadModule', code + '\nreturn exports;');
  return wrapper(exports, loadModule);
}

function setupDom(markup) {
  const dom = new JSDOM(markup, { url: 'http://localhost' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  return dom;
}

function teardownDom() {
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pointerDown(target) {
  target.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
}

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
      pointerDown(firstToggle);
      await wait(25);

      assert.strictEqual(firstToggle.getAttribute('aria-expanded'), 'true');
      assert.ok(document.getElementById('firstMenu').classList.contains('show'));

      pointerDown(document.body);
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

      pointerDown(firstToggle);
      await wait(25);
      assert.strictEqual(firstToggle.getAttribute('aria-expanded'), 'true');
      assert.ok(document.getElementById('firstMenu').classList.contains('show'));

      pointerDown(secondToggle);
      await wait(25);

      assert.strictEqual(firstToggle.getAttribute('aria-expanded'), 'false');
      assert.ok(!document.getElementById('firstMenu').classList.contains('show'));
      assert.strictEqual(secondToggle.getAttribute('aria-expanded'), 'true');
      assert.ok(document.getElementById('secondMenu').classList.contains('show'));
    }
  );
});
