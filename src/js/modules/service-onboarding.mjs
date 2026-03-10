const DEFAULT_STORAGE_KEY = 'ebano-service-guide-seen';
const DEFAULT_DELAY_MS = 450;
const DIALOG_OPEN_CLASS = 'service-dialog-open';

function canUseStorage(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    return false;
  }

  try {
    const probeKey = '__ebano_service_guide_probe__';
    storage.setItem(probeKey, '1');
    storage.removeItem?.(probeKey);
    return true;
  } catch {
    return false;
  }
}

function markDialogState(dialog, isOpen) {
  dialog.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  document.body.classList.toggle(DIALOG_OPEN_CLASS, isOpen);
}

export function openServiceDialog(dialog) {
  if (!dialog) {
    return false;
  }

  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) {
      dialog.showModal();
    }
  } else {
    dialog.setAttribute('open', '');
  }

  markDialogState(dialog, true);
  return true;
}

export function closeServiceDialog(dialog) {
  if (!dialog) {
    return false;
  }

  if (typeof dialog.close === 'function' && dialog.open) {
    dialog.close();
  } else {
    dialog.removeAttribute('open');
  }

  markDialogState(dialog, false);
  return true;
}

export function initServiceOnboarding(options = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return null;
  }

  const dialogSelector = options.dialogSelector || '#service-guide-dialog';
  const triggerSelector = options.triggerSelector || '[data-service-dialog-trigger]';
  const closeSelector = options.closeSelector || '[data-service-dialog-close]';
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
  const storage = options.storage || window.localStorage;
  const autoShow = options.autoShow !== false;
  const dialog = document.querySelector(dialogSelector);

  if (!dialog) {
    return null;
  }

  const supportsStorage = canUseStorage(storage);
  const hasSeenDialog = () => supportsStorage && storage.getItem(storageKey) === 'true';
  const rememberDialog = () => {
    if (!supportsStorage) {
      return;
    }
    storage.setItem(storageKey, 'true');
  };

  let autoShowTimer = null;

  const openDialog = () => {
    if (autoShowTimer !== null) {
      window.clearTimeout(autoShowTimer);
      autoShowTimer = null;
    }
    const opened = openServiceDialog(dialog);
    if (opened) {
      rememberDialog();
    }
    return opened;
  };

  const closeDialog = () => closeServiceDialog(dialog);

  document.querySelectorAll(triggerSelector).forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      openDialog();
    });
  });

  dialog.querySelectorAll(closeSelector).forEach((control) => {
    control.addEventListener('click', () => {
      closeDialog();
    });
  });

  dialog.addEventListener('close', () => {
    markDialogState(dialog, false);
  });

  dialog.addEventListener('cancel', () => {
    markDialogState(dialog, false);
  });

  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) {
      return;
    }
    closeDialog();
  });

  if (autoShow && !hasSeenDialog()) {
    autoShowTimer = window.setTimeout(() => {
      autoShowTimer = null;
      openDialog();
    }, delayMs);
  }

  return {
    dialog,
    openDialog,
    closeDialog,
  };
}
