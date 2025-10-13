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
  const wrapper = new Function('exports', code + '\nreturn exports;');
  return wrapper(exports);
}

test('initializeBootstrapUI lazy-loads collapse and dropdown handlers', async () => {
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <button id="navToggle" data-bs-toggle="collapse" data-bs-target="#navbarNav"></button>
    <div id="navbarNav" class="collapse navbar-collapse"></div>
    <div class="dropdown">
      <a id="menuDropdown" href="#" data-bs-toggle="dropdown" aria-expanded="false">Menú</a>
      <ul class="dropdown-menu"></ul>
    </div>
  </body>`, { url: 'http://localhost' });
  global.window = dom.window;
  global.document = dom.window.document;

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

  class DropdownStub {
    constructor(toggle) {
      this.toggleElement = toggle;
      this.menu = toggle.nextElementSibling;
    }
    _applyState(isOpen) {
      const currentlyOpen = this.toggleElement.classList.contains('show');
      if (currentlyOpen === isOpen) {
        return;
      }
      this.toggleElement.classList.toggle('show', isOpen);
      this.toggleElement.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (this.menu) {
        this.menu.classList.toggle('show', isOpen);
      }
      const parent = this.toggleElement.closest('.dropdown');
      if (parent) {
        parent.classList.toggle('show', isOpen);
      }
      const eventName = isOpen ? 'shown.bs.dropdown' : 'hidden.bs.dropdown';
      this.toggleElement.dispatchEvent(new dom.window.Event(eventName, { bubbles: true }));
    }
    toggle() {
      const isOpen = !this.toggleElement.classList.contains('show');
      this._applyState(isOpen);
    }
    show() {
      this._applyState(true);
    }
    hide() {
      this._applyState(false);
    }
    static getOrCreateInstance(toggle) {
      if (!this.instances) {
        this.instances = new WeakMap();
      }
      if (!this.instances.has(toggle)) {
        this.instances.set(toggle, new DropdownStub(toggle));
      }
      return this.instances.get(toggle);
    }
  }

  let collapseLoaded = 0;
  module.__setBootstrapLoaderOverride('collapse', async () => {
    collapseLoaded += 1;
    return { default: CollapseStub };
  });

  let dropdownLoaded = 0;
  module.__setBootstrapLoaderOverride('dropdown', async () => {
    dropdownLoaded += 1;
    return { default: DropdownStub };
  });

  module.initializeBootstrapUI();

  assert.strictEqual(collapseLoaded, 0);
  assert.strictEqual(dropdownLoaded, 0);
  assert.deepStrictEqual(module.__getDropdownStateSnapshot(), {
    expandedDropdownId: null,
    registeredToggleCount: 1,
  });

  const toggleButton = document.getElementById('navToggle');
  toggleButton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.strictEqual(collapseLoaded, 1);
  assert.ok(document.getElementById('navbarNav').classList.contains('show'));

  const dropdownToggle = document.getElementById('menuDropdown');
  dropdownToggle.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.strictEqual(dropdownLoaded, 1);
  assert.strictEqual(dropdownToggle.getAttribute('aria-expanded'), 'true');
  assert.ok(dropdownToggle.nextElementSibling.classList.contains('show'));
  assert.deepStrictEqual(module.__getDropdownStateSnapshot(), {
    expandedDropdownId: 'id:menuDropdown',
    registeredToggleCount: 1,
  });

  dropdownToggle.dispatchEvent(new dom.window.Event('hidden.bs.dropdown', { bubbles: true }));
  assert.deepStrictEqual(module.__getDropdownStateSnapshot(), {
    expandedDropdownId: null,
    registeredToggleCount: 1,
  });

  module.__resetBootstrapTestState();
  delete global.window;
  delete global.document;
});

test('dropdown controller closes previous toggle when opening a new one', async () => {
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <div class="dropdown">
      <a id="firstDropdown" href="#" data-bs-toggle="dropdown" aria-expanded="false">Primero</a>
      <ul class="dropdown-menu" id="firstMenu"></ul>
    </div>
    <div class="dropdown">
      <a id="secondDropdown" href="#" data-bs-toggle="dropdown" aria-expanded="false">Segundo</a>
      <ul class="dropdown-menu" id="secondMenu"></ul>
    </div>
  </body>`, { url: 'http://localhost' });
  global.window = dom.window;
  global.document = dom.window.document;

  const module = loadModule('../src/js/modules/bootstrap.mjs');

  class DropdownStub {
    constructor(toggle) {
      this.toggleElement = toggle;
      this.menu = toggle.nextElementSibling;
    }
    _applyState(isOpen) {
      const alreadyOpen = this.toggleElement.classList.contains('show');
      if (alreadyOpen === isOpen) {
        return;
      }
      this.toggleElement.classList.toggle('show', isOpen);
      this.toggleElement.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (this.menu) {
        this.menu.classList.toggle('show', isOpen);
      }
      const parent = this.toggleElement.closest('.dropdown');
      if (parent) {
        parent.classList.toggle('show', isOpen);
      }
      const eventName = isOpen ? 'shown.bs.dropdown' : 'hidden.bs.dropdown';
      this.toggleElement.dispatchEvent(new dom.window.Event(eventName, { bubbles: true }));
    }
    show() {
      this._applyState(true);
    }
    hide() {
      this._applyState(false);
    }
    static getOrCreateInstance(toggle) {
      if (!this.instances) {
        this.instances = new WeakMap();
      }
      if (!this.instances.has(toggle)) {
        this.instances.set(toggle, new DropdownStub(toggle));
      }
      return this.instances.get(toggle);
    }
  }

  module.__setBootstrapLoaderOverride('dropdown', async () => ({ default: DropdownStub }));
  module.initializeBootstrapUI();

  const firstToggle = document.getElementById('firstDropdown');
  const secondToggle = document.getElementById('secondDropdown');
  firstToggle.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  await new Promise((resolve) => setImmediate(resolve));

  let snapshot = module.__getDropdownStateSnapshot();
  assert.strictEqual(snapshot.expandedDropdownId, 'id:firstDropdown');
  assert.strictEqual(snapshot.registeredToggleCount, 2);
  assert.ok(firstToggle.classList.contains('show'));
  assert.ok(document.getElementById('firstMenu').classList.contains('show'));

  secondToggle.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  await new Promise((resolve) => setImmediate(resolve));

  snapshot = module.__getDropdownStateSnapshot();
  assert.strictEqual(snapshot.expandedDropdownId, 'id:secondDropdown');
  assert.ok(!firstToggle.classList.contains('show'));
  assert.ok(!document.getElementById('firstMenu').classList.contains('show'));
  assert.ok(secondToggle.classList.contains('show'));
  assert.ok(document.getElementById('secondMenu').classList.contains('show'));

  module.__resetBootstrapTestState();
  delete global.window;
  delete global.document;
});

test('showOffcanvas loads module on demand and displays panel', async () => {
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <div id="cartOffcanvas" class="offcanvas"></div>
  </body>`, { url: 'http://localhost' });
  global.window = dom.window;
  global.document = dom.window.document;

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
});
