export const STOREFRONT_STORAGE_KEYS = Object.freeze({
  cart: 'astro-poc-cart',
  profile: 'astro-poc-profile',
  lastOrder: 'astro-poc-last-order',
  recentOrders: 'astro-poc-recent-orders',
  productSignals: 'astro-poc-product-signals',
  preferredPayment: 'astro-poc-preferred-payment',
  substitutionPreference: 'astro-poc-substitution-preference',
});

export const STOREFRONT_STORAGE_ALIASES = Object.freeze({
  cart: ['cart'],
});

export const STOREFRONT_RUNTIME_CONTRACT = Object.freeze({
  runtimeId: 'astro-poc-storefront',
  runtimeEntry: 'astro-poc/src/scripts/storefront.js',
  storageVersion: 1,
  storageKeys: STOREFRONT_STORAGE_KEYS,
  legacyAliases: STOREFRONT_STORAGE_ALIASES,
});

function getDefaultStorage() {
  return globalThis?.localStorage ?? null;
}

function canUseStorage(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    return false;
  }

  try {
    const probeKey = '__astro_poc_storage_probe__';
    storage.setItem(probeKey, '1');
    storage.removeItem?.(probeKey);
    return true;
  } catch {
    return false;
  }
}

function safeParseJson(rawValue, fallback) {
  if (typeof rawValue !== 'string' || rawValue.length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    return fallback;
  }
}

function getKeysForSlot(slot) {
  const canonicalKey = STOREFRONT_STORAGE_KEYS[slot];
  if (!canonicalKey) {
    throw new Error(`Unknown storefront storage slot: ${slot}`);
  }

  return [canonicalKey, ...(STOREFRONT_STORAGE_ALIASES[slot] || [])];
}

export function readStorefrontSlot(slot, fallback, { storage = getDefaultStorage() } = {}) {
  if (!canUseStorage(storage)) {
    return fallback;
  }

  const keys = getKeysForSlot(slot);
  for (const key of keys) {
    const rawValue = storage.getItem(key);
    if (rawValue === null) {
      continue;
    }
    return safeParseJson(rawValue, fallback);
  }

  return fallback;
}

export function writeStorefrontSlot(slot, value, { storage = getDefaultStorage() } = {}) {
  if (!canUseStorage(storage)) {
    return false;
  }

  try {
    storage.setItem(STOREFRONT_STORAGE_KEYS[slot], JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function migrateLegacyStorefrontState({ storage = getDefaultStorage(), log } = {}) {
  if (!canUseStorage(storage)) {
    return { available: false, migrated: [] };
  }

  const migrated = [];

  for (const [slot, aliases] of Object.entries(STOREFRONT_STORAGE_ALIASES)) {
    const canonicalKey = STOREFRONT_STORAGE_KEYS[slot];
    if (!canonicalKey || storage.getItem(canonicalKey) !== null) {
      continue;
    }

    for (const aliasKey of aliases) {
      const rawValue = storage.getItem(aliasKey);
      if (rawValue === null) {
        continue;
      }

      const parsedValue = safeParseJson(rawValue, Symbol.for('invalid-json'));
      if (parsedValue === Symbol.for('invalid-json')) {
        continue;
      }

      try {
        storage.setItem(canonicalKey, rawValue);
        migrated.push({ slot, from: aliasKey, to: canonicalKey });
        break;
      } catch {
        break;
      }
    }
  }

  if (migrated.length > 0 && typeof log === 'function') {
    log('info', 'storefront_storage_migrated', {
      contract: STOREFRONT_RUNTIME_CONTRACT.runtimeId,
      migrated,
    });
  }

  return { available: true, migrated };
}

export function createStorefrontStorage(options = {}) {
  const { storage = getDefaultStorage(), log } = options;

  return {
    contract: STOREFRONT_RUNTIME_CONTRACT,
    isAvailable() {
      return canUseStorage(storage);
    },
    loadJson(slot, fallback) {
      return readStorefrontSlot(slot, fallback, { storage });
    },
    saveJson(slot, value) {
      return writeStorefrontSlot(slot, value, { storage });
    },
    migrateLegacyState() {
      return migrateLegacyStorefrontState({ storage, log });
    },
  };
}
