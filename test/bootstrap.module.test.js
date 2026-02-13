const test = require('node:test');
const assert = require('node:assert');
const { createModuleLoader } = require('./helpers/module-loader');
const {
  ensureFileGlobal,
  setupDom,
  teardownDom,
  wait,
  waitImmediate,
  dispatchPointerDown,
  dispatchClick,
} = require('./helpers/dom-test-utils');

ensureFileGlobal();

const loadModule = createModuleLoader(__dirname, {
  transform: (code) =>
    code
      .replace(
        /import\s+\{([^}]+)\}\s+from\s+['"]\.\/menu-controller\.mjs['"];?/,
        (_match, names) => {
          const identifiers = names
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean)
            .join(', ');
          return `const { ${identifiers} } = loadModule('../src/js/modules/menu-controller.mjs');`;
        }
      )
      .replace(
        /import\s+\{([^}]+)\}\s+from\s+['"]\.\.\/utils\/logger\.mts['"];?/,
        (_match, names) => {
          const identifiers = names
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean)
            .join(', ');
          return `const { ${identifiers} } = { log: () => {} };`;
        }
      ),
});

function createBootstrapComponentStub(methodName, action) {
  return class BootstrapStub {
    constructor(element) {
      this.element = element;
    }
    [methodName]() {
      action(this.element);
    }
    static getOrCreateInstance(element) {
      if (!this.instances) {
        this.instances = new WeakMap();
      }
      if (!this.instances.has(element)) {
        this.instances.set(element, new BootstrapStub(element));
      }
      return this.instances.get(element);
    }
  };
}

async function withBootstrapDom(markup, run) {
  setupDom(markup, { url: 'http://localhost' });
  const module = loadModule('../src/js/modules/bootstrap.mjs');
  try {
    await run(module);
  } finally {
    module.__resetBootstrapTestState();
    teardownDom();
  }
}

test('initializeBootstrapUI wires collapse toggles and menu controller', async () => {
  await withBootstrapDom(
    `<!DOCTYPE html><body>
    <button id="navToggle" data-bs-toggle="collapse" data-bs-target="#navbarNav"></button>
    <div id="navbarNav" class="collapse navbar-collapse"></div>
    <div id="navbar-container">
      <div class="dropdown">
        <a id="menuDropdown" class="dropdown-toggle" href="#" data-bs-toggle="dropdown" aria-expanded="false">Menú</a>
        <ul class="dropdown-menu" id="menuDropdownMenu"></ul>
      </div>
    </div>
  </body>`,
    async (module) => {
      const CollapseStub = createBootstrapComponentStub('toggle', (element) => {
        element.classList.toggle('show');
      });
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
      dispatchClick(toggleButton);
      await waitImmediate();

      assert.strictEqual(collapseLoaded, 1);
      assert.ok(document.getElementById('navbarNav').classList.contains('show'));

      const dropdownToggle = document.getElementById('menuDropdown');
      dispatchPointerDown(dropdownToggle);
      await wait(25);

      assert.strictEqual(dropdownToggle.getAttribute('aria-expanded'), 'true');
      assert.ok(document.getElementById('menuDropdownMenu').classList.contains('show'));
      const afterOpen = module.__getDropdownStateSnapshot();
      assert.strictEqual(afterOpen.controllers[0].expandedId, 'id:menuDropdown');

      dispatchPointerDown(dropdownToggle);
      await wait(25);
      assert.strictEqual(dropdownToggle.getAttribute('aria-expanded'), 'false');
      assert.ok(!document.getElementById('menuDropdownMenu').classList.contains('show'));
    }
  );
});

test('initializeBootstrapUI falls back when collapse module fails to load', async () => {
  await withBootstrapDom(
    `<!DOCTYPE html><body>
    <button id="navToggle" data-bs-toggle="collapse" data-bs-target="#navbarNav" class="collapsed" aria-expanded="false"></button>
    <div id="navbarNav" class="collapse navbar-collapse"></div>
  </body>`,
    async (module) => {
      module.__setBootstrapLoaderOverride('collapse', async () => {
        throw new Error('Network error');
      });

      module.initializeBootstrapUI();

      const toggleButton = document.getElementById('navToggle');
      dispatchClick(toggleButton);
      await waitImmediate();

      assert.strictEqual(toggleButton.getAttribute('aria-expanded'), 'true');
      assert.ok(toggleButton.classList.contains('collapsed') === false);
      assert.ok(document.getElementById('navbarNav').classList.contains('show'));

      dispatchClick(toggleButton);
      await waitImmediate();

      assert.strictEqual(toggleButton.getAttribute('aria-expanded'), 'false');
      assert.ok(toggleButton.classList.contains('collapsed'));
      assert.ok(!document.getElementById('navbarNav').classList.contains('show'));
    }
  );
});

test('showOffcanvas loads module on demand and displays panel', async () => {
  await withBootstrapDom(
    `<!DOCTYPE html><body>
    <div id="cartOffcanvas" class="offcanvas"></div>
  </body>`,
    async (module) => {
      const OffcanvasStub = createBootstrapComponentStub('show', (element) => {
        element.classList.add('show');
      });
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
      assert.strictEqual(
        offcanvasLoaded,
        1,
        'offcanvas loader should be cached after first call'
      );
    }
  );
});
