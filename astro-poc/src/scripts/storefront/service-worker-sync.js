function canUseStorage(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    return false;
  }

  try {
    const probeKey = '__astro_poc_sw_sync_probe__';
    storage.setItem(probeKey, '1');
    storage.removeItem?.(probeKey);
    return true;
  } catch {
    return false;
  }
}

function getVersionStorageKey(runtimeContract) {
  return `${runtimeContract.runtimeId}:service-worker-cache-version`;
}

export function getStorefrontCacheVersion(runtimeContract) {
  return `${runtimeContract.runtimeId}:storage-v${runtimeContract.storageVersion}:cache-v${runtimeContract.cacheVersion}`;
}

export function sendServiceWorkerMessage(
  target,
  message,
  { channelFactory = () => new MessageChannel(), timeoutMs = 5000 } = {}
) {
  if (!target || typeof target.postMessage !== 'function') {
    return Promise.reject(new Error('Service worker target is unavailable.'));
  }

  return new Promise((resolve, reject) => {
    const channel = channelFactory();
    const timeoutId = globalThis.setTimeout(() => {
      channel.port1.onmessage = null;
      reject(new Error(`Service worker message timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    channel.port1.onmessage = (event) => {
      globalThis.clearTimeout(timeoutId);
      const payload = event?.data || {};

      if (payload?.error) {
        reject(new Error(payload.error));
        return;
      }

      resolve(payload?.data ?? payload);
    };

    target.postMessage(message, [channel.port2]);
  });
}

export async function syncStorefrontServiceWorkerVersion({
  registration,
  runtimeContract,
  storage = globalThis.localStorage,
  navigatorRef = globalThis.navigator,
  channelFactory,
  timeoutMs = 5000,
  log,
} = {}) {
  if (!runtimeContract) {
    return { available: false, invalidated: false, reason: 'missing-runtime-contract' };
  }

  if (!canUseStorage(storage)) {
    return { available: false, invalidated: false, reason: 'storage-unavailable' };
  }

  const targetVersion = getStorefrontCacheVersion(runtimeContract);
  const storageKey = getVersionStorageKey(runtimeContract);
  const currentVersion = storage.getItem(storageKey);

  if (currentVersion === targetVersion) {
    return { available: true, invalidated: false, version: targetVersion };
  }

  if (currentVersion === null) {
    storage.setItem(storageKey, targetVersion);
    return {
      available: true,
      invalidated: false,
      version: targetVersion,
      reason: 'first-seen-version',
    };
  }

  const messageTarget =
    registration?.active ||
    registration?.waiting ||
    navigatorRef?.serviceWorker?.controller ||
    null;

  if (!messageTarget) {
    return {
      available: true,
      invalidated: false,
      version: targetVersion,
      reason: 'no-service-worker-target',
    };
  }

  await sendServiceWorkerMessage(
    messageTarget,
    { type: 'INVALIDATE_ALL_CACHES' },
    { channelFactory, timeoutMs }
  );

  if (registration?.waiting && typeof registration.waiting.postMessage === 'function') {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  storage.setItem(storageKey, targetVersion);

  if (typeof log === 'function') {
    log('info', 'service_worker_cache_version_synced', {
      version: targetVersion,
      invalidated: true,
    });
  }

  return { available: true, invalidated: true, version: targetVersion };
}
