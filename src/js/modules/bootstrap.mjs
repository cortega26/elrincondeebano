import {
  setupUnifiedMenuController,
  __getMenuControllerSnapshot,
  __resetMenuControllerForTest,
} from './menu-controller.mjs';

let bootstrapInitialized = false;
const loaderOverrides = new Map();
let collapseModulePromise = null;
let offcanvasModulePromise = null;

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

function shouldPreventNavigation(toggle) {
  if (!toggle || toggle.tagName !== 'A') {
    return false;
  }
  const href = toggle.getAttribute('href');
  return !href || href === '#';
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
  setupUnifiedMenuController();
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
  } else if (name === 'offcanvas') {
    offcanvasModulePromise = null;
  }
}

export function __resetBootstrapTestState() {
  loaderOverrides.clear();
  collapseModulePromise = null;
  offcanvasModulePromise = null;
  bootstrapInitialized = false;
  __resetMenuControllerForTest();
}

export function __getDropdownStateSnapshot() {
  return __getMenuControllerSnapshot();
}
