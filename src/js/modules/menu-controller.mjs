const controllerRegistry = new WeakMap();
const controllerContainers = new Set();
const activeControllers = new Set();

const raf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
  ? window.requestAnimationFrame.bind(window)
  : (cb) => setTimeout(cb, 16);

const caf = typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function'
  ? window.cancelAnimationFrame.bind(window)
  : (id) => clearTimeout(id);

function composedPath(event) {
  if (typeof event.composedPath === 'function') {
    return event.composedPath();
  }
  const path = [];
  let current = event.target;
  while (current) {
    path.push(current);
    current = current.parentNode;
  }
  if (typeof window !== 'undefined') {
    path.push(window);
  }
  path.push(document);
  return path;
}

function ensureId(baseElement, prefix, index) {
  if (!baseElement) {
    return `${prefix}-${index}`;
  }
  if (typeof baseElement.id === 'string' && baseElement.id.trim().length > 0) {
    return `id:${baseElement.id}`;
  }
  const datasetId = baseElement.dataset?.dropdownId;
  if (datasetId) {
    return datasetId;
  }
  const generated = `${prefix}:${index}`;
  if (baseElement.dataset) {
    baseElement.dataset.dropdownId = generated;
  }
  return generated;
}

function setExpanded(entry, isExpanded) {
  const { toggle, menu, dropdownNode } = entry;
  toggle.classList.toggle('show', isExpanded);
  toggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
  if (menu) {
    menu.classList.toggle('show', isExpanded);
  }
  if (dropdownNode) {
    dropdownNode.classList.toggle('show', isExpanded);
  }
}

function closeAll(state) {
  state.expandedId = null;
  state.toggles.forEach((entry) => {
    setExpanded(entry, false);
  });
}

function ensureOutsideListener(state) {
  if (state.outsideListenerInstalled) {
    return;
  }
  state.outsideListenerInstalled = true;
  let listenerAttached = false;
  const attach = () => {
    document.addEventListener('pointerdown', state.onPointerDownOutside, true);
    listenerAttached = true;
  };
  state.outsideListenerCleanup = () => {
    if (state.installTimer !== null) {
      clearTimeout(state.installTimer);
      state.installTimer = null;
    }
    if (listenerAttached) {
      document.removeEventListener('pointerdown', state.onPointerDownOutside, true);
      listenerAttached = false;
    }
    state.outsideListenerInstalled = false;
  };
  state.installTimer = setTimeout(() => {
    state.installTimer = null;
    attach();
  }, 0);
}

function handleTogglePointerDown(event, state, entry) {
  if (event.button !== undefined && event.button !== 0) {
    return;
  }
  if (state.preventNavigation && entry.toggle.tagName === 'A') {
    event.preventDefault();
  }
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === 'function') {
    event.stopImmediatePropagation();
  }

  state.justOpened = true;
  if (state.justOpenedFrame !== null) {
    caf(state.justOpenedFrame);
  }
  state.justOpenedFrame = raf(() => {
    state.justOpened = false;
    state.justOpenedFrame = null;
  });

  ensureOutsideListener(state);

  if (state.expandedId === entry.id) {
    closeAll(state);
    return;
  }

  closeAll(state);
  setExpanded(entry, true);
  state.expandedId = entry.id;
}

function handleToggleKeyDown(event, state, entry) {
  const key = event.key;
  if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
    event.preventDefault();
    handleTogglePointerDown(event, state, entry);
  } else if (key === 'Escape') {
    closeAll(state);
    entry.toggle.focus();
  }
}

function createEntry(toggle, index) {
  const dropdownNode = toggle.closest('.dropdown');
  const menu = dropdownNode?.querySelector('.dropdown-menu');
  const id = ensureId(toggle, 'auto', index);
  const entry = { toggle, menu, dropdownNode, id };
  if (menu && !menu.id) {
    menu.id = `${id}-menu`;
  }
  if (menu) {
    toggle.setAttribute('aria-controls', menu.id);
  }
  return entry;
}

function createController(nav) {
  const state = {
    container: nav,
    toggles: [],
    expandedId: null,
    justOpened: false,
    justOpenedFrame: null,
    outsideListenerInstalled: false,
    outsideListenerCleanup: null,
    installTimer: null,
    onPointerDownOutside: null,
    preventNavigation: true,
  };

  state.onPointerDownOutside = (event) => {
    if (state.justOpened) {
      return;
    }
    const path = composedPath(event);
    if (path.includes(state.container)) {
      return;
    }
    closeAll(state);
  };

  const toggles = Array.from(nav.querySelectorAll('.dropdown-toggle'));
  toggles.forEach((toggle, index) => {
    if (toggle.dataset.menuControllerBound === '1') {
      return;
    }
    toggle.dataset.menuControllerBound = '1';
    const entry = createEntry(toggle, index);
    state.toggles.push(entry);

    const pointerHandler = (event) => handleTogglePointerDown(event, state, entry);
    const keyHandler = (event) => handleToggleKeyDown(event, state, entry);
    toggle.addEventListener('pointerdown', pointerHandler);
    toggle.addEventListener('keydown', keyHandler);
    entry.cleanup = () => {
      toggle.removeEventListener('pointerdown', pointerHandler);
      toggle.removeEventListener('keydown', keyHandler);
      delete toggle.dataset.menuControllerBound;
    };
  });

  controllerRegistry.set(nav, state);
  controllerContainers.add(nav);
  activeControllers.add(state);
  if (state.toggles.length === 0) {
    destroyController(state);
    return null;
  }
  return state;
}

function destroyController(state) {
  if (!state) {
    return;
  }
  state.toggles.forEach((entry) => {
    setExpanded(entry, false);
    entry.cleanup?.();
  });
  state.toggles = [];
  closeAll(state);
  if (state.outsideListenerCleanup) {
    state.outsideListenerCleanup();
    state.outsideListenerCleanup = null;
  }
  if (state.justOpenedFrame !== null) {
    caf(state.justOpenedFrame);
    state.justOpenedFrame = null;
  }
  if (state.container) {
    controllerRegistry.delete(state.container);
    controllerContainers.delete(state.container);
  }
  activeControllers.delete(state);
}

export function setupUnifiedMenuController({ container } = {}) {
  if (typeof document === 'undefined') {
    return;
  }
  let navContainers;
  if (container) {
    navContainers = [container];
  } else {
    const preferred = Array.from(document.querySelectorAll('#navbar-container'));
    navContainers = preferred.length > 0 ? preferred : Array.from(document.querySelectorAll('.navbar, nav'));
  }

  navContainers.forEach((nav) => {
    if (!(nav instanceof HTMLElement)) {
      return;
    }
    const toggles = nav.querySelectorAll('.dropdown-toggle');
    if (toggles.length === 0) {
      return;
    }
    const existing = controllerRegistry.get(nav);
    if (existing) {
      return;
    }
    const controller = createController(nav);
    if (!controller) {
      controllerRegistry.delete(nav);
      controllerContainers.delete(nav);
    }
  });
}

export function __resetMenuControllerForTest() {
  Array.from(controllerContainers).forEach((nav) => {
    const state = controllerRegistry.get(nav);
    destroyController(state);
  });
  activeControllers.clear();
}

export function __getMenuControllerSnapshot() {
  const controllers = Array.from(activeControllers).map((state) => ({
    containerId: state.container.id || null,
    expandedId: state.expandedId,
    toggleCount: state.toggles.length,
  }));
  return {
    controllerCount: controllers.length,
    controllers,
  };
}
