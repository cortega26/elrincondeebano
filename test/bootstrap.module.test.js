const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');

function loadModule(relPath) {
  const filePath = path.join(__dirname, relPath);
  let code = fs.readFileSync(filePath, 'utf8');
  code = code.replace(
    /import\s+\{([^}]+)\}\s+from\s+['"]\.\/menu-controller\.mjs['"];?/,
    (_, names) => {
      const identifiers = names
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
        .join(', ');
      return `const { ${identifiers} } = loadModule('../src/js/modules/menu-controller.mjs');`;
    },
  );
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

test('initializeBootstrapUI wires collapse toggles and menu controller', async () => {
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <button id="navToggle" data-bs-toggle="collapse" data-bs-target="#navbarNav"></button>
    <div id="navbarNav" class="collapse navbar-collapse"></div>
    <div id="navbar-container">
      <div class="dropdown">
        <a id="menuDropdown" class="dropdown-toggle" href="#" data-bs-toggle="dropdown" aria-expanded="false">Menú</a>
        <ul class="dropdown-menu" id="menuDropdownMenu"></ul>
      </div>
    </div>
  </body>`, { url: 'http://localhost' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;

  const module = loadModule('../src/js/modules/bootstrap.mjs');

  class CollapseStub {
    constructor(element) {
      this.element = element;
    }
    toggle() {
      this.element.classList.toggle('show');
    }
    static getOrCreateInstance(element) {
      if (!this.instances) {
        this.instances = new WeakMap();
      }
      if (!this.instances.has(element)) {
        this.instances.set(element, new CollapseStub(element));
      }
      return this.instances.get(element);
    }
  }

  let collapseLoaded = 0;
  module.__setBootstrapLoaderOverride('collapse', async () => {
    collapseLoaded += 1;
    return { default: CollapseStub };
  });

  module.initializeBootstrapUI();

  assert.strictEqual(collapseLoaded, 0);
  const initialSnapshot = module.__getDropdownStateSnapshot();
  assert.strictEqual(initialSnapshot.controllerCount, 1);
  assert.strictEqual(initialSnapshot.controllers[0].toggleCount, 1);
  assert.strictEqual(initialSnapshot.controllers[0].expandedId, null);

  const toggleButton = document.getElementById('navToggle');
  toggleButton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.strictEqual(collapseLoaded, 1);
  assert.ok(document.getElementById('navbarNav').classList.contains('show'));

  const dropdownToggle = document.getElementById('menuDropdown');
  dropdownToggle.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.strictEqual(dropdownToggle.getAttribute('aria-expanded'), 'true');
  assert.ok(document.getElementById('menuDropdownMenu').classList.contains('show'));
  const afterOpen = module.__getDropdownStateSnapshot();
  assert.strictEqual(afterOpen.controllers[0].expandedId, 'id:menuDropdown');

  dropdownToggle.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.strictEqual(dropdownToggle.getAttribute('aria-expanded'), 'false');
  assert.ok(!document.getElementById('menuDropdownMenu').classList.contains('show'));

  module.__resetBootstrapTestState();
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
});

test('showOffcanvas loads module on demand and displays panel', async () => {
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <div id="cartOffcanvas" class="offcanvas"></div>
  </body>`, { url: 'http://localhost' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;

  const module = loadModule('../src/js/modules/bootstrap.mjs');

  class OffcanvasStub {
    constructor(element) {
      this.element = element;
    }
    show() {
      this.element.classList.add('show');
    }
    static getOrCreateInstance(element) {
      if (!this.instances) {
        this.instances = new WeakMap();
      }
      if (!this.instances.has(element)) {
        this.instances.set(element, new OffcanvasStub(element));
      }
      return this.instances.get(element);
    }
  }

  let offcanvasLoaded = 0;
  module.__setBootstrapLoaderOverride('offcanvas', async () => {
    offcanvasLoaded += 1;
    return { default: OffcanvasStub };
  });

  const result = await module.showOffcanvas('#cartOffcanvas');
  assert.strictEqual(offcanvasLoaded, 1);
  assert.ok(document.getElementById('cartOffcanvas').classList.contains('show'));
  assert.ok(result instanceof OffcanvasStub);

  await module.showOffcanvas('#cartOffcanvas');
  assert.strictEqual(offcanvasLoaded, 1, 'offcanvas loader should be cached after first call');

  module.__resetBootstrapTestState();
  delete global.window;
  delete global.document;
  delete global.HTMLElement;
});
