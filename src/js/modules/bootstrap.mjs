let bootstrapInitialized = false;
const loaderOverrides = new Map();
let collapseModulePromise = null;
let dropdownModulePromise = null;
let offcanvasModulePromise = null;
let dropdownIdCounter = 0;
let expandedDropdownId = null;
const dropdownToggleRegistry = new Map();
let dropdownCleanupCallbacks = [];

function getModuleExport(module) {
  if (module && typeof module === 'object') {
    if (module.default) {
      return module.default;
    }
    const keys = Object.keys(module);
    if (keys.length === 1) {
      return module[keys[0]];
    }
  }
  return module;
}

function getOrCreateInstance(Component, element) {
  if (!Component || !element) {
    return null;
  }
  if (typeof Component.getOrCreateInstance === 'function') {
    return Component.getOrCreateInstance(element);
  }
  return new Component(element);
}

function resolveElement(target) {
  if (!target) {
    return null;
  }
  if (typeof target === 'string') {
    return document.querySelector(target);
  }
  return target;
}

function loadWithOverride(name, importer) {
  if (loaderOverrides.has(name)) {
    return loaderOverrides.get(name)();
  }
  return importer();
}

async function loadCollapse() {
  if (!collapseModulePromise) {
    collapseModulePromise = loadWithOverride('collapse', () => import('bootstrap/js/dist/collapse'));
  }
  const module = await collapseModulePromise;
  return getModuleExport(module);
}

async function loadDropdown() {
  if (!dropdownModulePromise) {
    dropdownModulePromise = loadWithOverride('dropdown', () => import('bootstrap/js/dist/dropdown'));
  }
  const module = await dropdownModulePromise;
  return getModuleExport(module);
}

async function loadOffcanvas() {
  if (!offcanvasModulePromise) {
    offcanvasModulePromise = loadWithOverride('offcanvas', () => import('bootstrap/js/dist/offcanvas'));
  }
  const module = await offcanvasModulePromise;
  return getModuleExport(module);
}

function setupCollapseToggles() {
  const toggles = document.querySelectorAll('[data-bs-toggle="collapse"][data-bs-target]');
  toggles.forEach((toggle) => {
    toggle.addEventListener('click', (event) => {
      if (shouldPreventNavigation(toggle)) {
        event.preventDefault();
      }
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      event.stopPropagation();
      void activateCollapse(toggle, event);
    });
  });
}

async function activateCollapse(toggle, event) {
  try {
    const targetSelector = toggle.getAttribute('data-bs-target');
    if (!targetSelector) {
      return;
    }
    const target = document.querySelector(targetSelector);
    if (!target) {
      return;
    }
    const Collapse = await loadCollapse();
    const instance = getOrCreateInstance(Collapse, target);
    instance?.toggle?.(event);
  } catch (error) {
    console.error('No se pudo inicializar el Collapse de Bootstrap', error);
  }
}

function cleanupDropdownListeners() {
  if (dropdownCleanupCallbacks.length === 0) {
    return;
  }
  dropdownCleanupCallbacks.forEach((cleanup) => {
    try {
      cleanup();
    } catch (error) {
      // Silenciamos errores de limpieza para evitar fugas de listeners en entornos sin DOM completo.
    }
  });
  dropdownCleanupCallbacks = [];
  dropdownToggleRegistry.clear();
  expandedDropdownId = null;
  dropdownIdCounter = 0;
}

/**
 * Ensures that every dropdown toggle has a stable identifier so we can manage
 * controlled expanded state.
 * @param {HTMLElement} toggle
 * @returns {string}
 */
function ensureDropdownId(toggle) {
  if (!toggle) {
    return '';
  }
  const datasetId = typeof toggle.dataset === 'object' ? toggle.dataset.dropdownId : undefined;
  const attributeId = typeof toggle.getAttribute === 'function' ? toggle.getAttribute('data-dropdown-id') : undefined;
  const existingId = datasetId || attributeId;
  if (existingId) {
    if (toggle.dataset) {
      toggle.dataset.dropdownId = existingId;
    }
    if (typeof toggle.setAttribute === 'function') {
      toggle.setAttribute('data-dropdown-id', existingId);
    }
    dropdownToggleRegistry.set(existingId, toggle);
    return existingId;
  }
  const elementId = typeof toggle.id === 'string' && toggle.id ? toggle.id : '';
  const baseId = elementId ? `id:${elementId}` : `auto:${++dropdownIdCounter}`;
  if (toggle.dataset) {
    toggle.dataset.dropdownId = baseId;
  }
  if (typeof toggle.setAttribute === 'function') {
    toggle.setAttribute('data-dropdown-id', baseId);
  }
  dropdownToggleRegistry.set(baseId, toggle);
  return baseId;
}

function trackDropdownLifecycle(toggle, id) {
  if (!toggle || !id) {
    return;
  }
  const onShown = () => {
    expandedDropdownId = id;
  };
  const onHidden = () => {
    if (expandedDropdownId === id) {
      expandedDropdownId = null;
    }
  };
  toggle.addEventListener('shown.bs.dropdown', onShown);
  toggle.addEventListener('hidden.bs.dropdown', onHidden);
  dropdownCleanupCallbacks.push(() => {
    toggle.removeEventListener('shown.bs.dropdown', onShown);
    toggle.removeEventListener('hidden.bs.dropdown', onHidden);
    if (dropdownToggleRegistry.get(id) === toggle) {
      dropdownToggleRegistry.delete(id);
    }
  });
}

function shouldPreventNavigation(toggle) {
  if (!toggle || toggle.tagName !== 'A') {
    return false;
  }
  const href = toggle.getAttribute('href');
  return !href || href === '#';
}

function setupDropdownToggles() {
  cleanupDropdownListeners();
  const toggles = document.querySelectorAll('[data-bs-toggle="dropdown"]');
  toggles.forEach((toggle) => {
    const dropdownId = ensureDropdownId(toggle);
    trackDropdownLifecycle(toggle, dropdownId);

    const handler = async (event) => {
      if (shouldPreventNavigation(toggle)) {
        event.preventDefault();
      }
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      if (typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
      try {
        await activateDropdown(toggle, dropdownId);
      } catch (error) {
        console.error('No se pudo inicializar el Dropdown de Bootstrap', error);
      }
    };

    toggle.addEventListener('click', handler);
    dropdownCleanupCallbacks.push(() => {
      toggle.removeEventListener('click', handler);
    });
  });
}

async function activateDropdown(toggle, dropdownId) {
  const Dropdown = await loadDropdown();
  const instance = getOrCreateInstance(Dropdown, toggle);
  if (!instance) {
    return;
  }

  if (expandedDropdownId && expandedDropdownId !== dropdownId) {
    const previousToggle = dropdownToggleRegistry.get(expandedDropdownId);
    if (previousToggle) {
      const previousInstance = getOrCreateInstance(Dropdown, previousToggle);
      if (typeof previousInstance?.hide === 'function') {
        previousInstance.hide();
      } else {
        previousInstance?.toggle?.();
      }
    }
  }

  if (expandedDropdownId === dropdownId) {
    if (typeof instance.hide === 'function') {
      instance.hide();
    } else {
      instance.toggle?.();
    }
    return;
  }

  if (typeof instance.show === 'function') {
    instance.show();
  } else {
    instance.toggle?.();
  }
}

export function initializeBootstrapUI() {
  if (bootstrapInitialized) {
    return;
  }
  bootstrapInitialized = true;
  if (typeof document === 'undefined') {
    return;
  }
  setupCollapseToggles();
  setupDropdownToggles();
}

export async function showOffcanvas(target) {
  if (typeof document === 'undefined') {
    throw new Error('Offcanvas no disponible en este entorno');
  }
  const element = resolveElement(target);
  if (!element) {
    throw new Error('No se encontró el elemento de Offcanvas');
  }
  const Offcanvas = await loadOffcanvas();
  const instance = getOrCreateInstance(Offcanvas, element);
  if (!instance || typeof instance.show !== 'function') {
    throw new Error('Instancia de Offcanvas inválida');
  }
  instance.show();
  return instance;
}

export function __setBootstrapLoaderOverride(name, loader) {
  loaderOverrides.set(name, loader);
  if (name === 'collapse') {
    collapseModulePromise = null;
  } else if (name === 'dropdown') {
    dropdownModulePromise = null;
  } else if (name === 'offcanvas') {
    offcanvasModulePromise = null;
  }
}

export function __resetBootstrapTestState() {
  loaderOverrides.clear();
  collapseModulePromise = null;
  dropdownModulePromise = null;
  offcanvasModulePromise = null;
  bootstrapInitialized = false;
  cleanupDropdownListeners();
}

export function __getDropdownStateSnapshot() {
  return {
    expandedDropdownId,
    registeredToggleCount: dropdownToggleRegistry.size,
  };
}
