export const STOREFRONT_STORAGE_KEYS = Object.freeze({
  cart: 'astro-poc-cart',
  profile: 'astro-poc-profile',
  lastOrder: 'astro-poc-last-order',
  recentOrders: 'astro-poc-recent-orders',
  productSignals: 'astro-poc-product-signals',
  preferredPayment: 'astro-poc-preferred-payment',
  substitutionPreference: 'astro-poc-substitution-preference',
  orderLastSentAt: 'astro-poc-order-last-sent-at',
  recoveryDismissed: 'astro-poc-recovery-dismissed',
});

export const STOREFRONT_STORAGE_ALIASES: Record<StorefrontStorageSlot, string[]> = Object.freeze({
  cart: ['cart'],
  profile: [],
  lastOrder: [],
  recentOrders: [],
  productSignals: [],
  preferredPayment: [],
  substitutionPreference: [],
  orderLastSentAt: [],
  recoveryDismissed: [],
});

export const STOREFRONT_RUNTIME_CONTRACT = Object.freeze({
  runtimeId: 'astro-poc-storefront',
  runtimeEntry: 'astro-poc/src/scripts/storefront.js',
  storageVersion: 1,
  cacheVersion: 2,
  storageKeys: STOREFRONT_STORAGE_KEYS,
  legacyAliases: STOREFRONT_STORAGE_ALIASES,
});

export type StorefrontStorageSlot = keyof typeof STOREFRONT_STORAGE_KEYS;

function getDefaultStorage(): Storage | null {
  return globalThis?.localStorage ?? null;
}

function canUseStorage(storage: Storage | null): storage is Storage {
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

function safeParseJson<T>(rawValue: unknown, fallback: T): T {
  if (typeof rawValue !== 'string' || rawValue.length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

function getKeysForSlot(slot: StorefrontStorageSlot): string[] {
  const canonicalKey = STOREFRONT_STORAGE_KEYS[slot];
  if (!canonicalKey) {
    throw new Error(`Unknown storefront storage slot: ${String(slot)}`);
  }

  return [canonicalKey, ...(STOREFRONT_STORAGE_ALIASES[slot] || [])];
}

interface ReadOptions {
  storage?: Storage | null;
}

export function readStorefrontSlot<T>(
  slot: StorefrontStorageSlot,
  fallback: T,
  { storage = getDefaultStorage() }: ReadOptions = {}
): T {
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

interface WriteOptions {
  storage?: Storage | null;
}

export function writeStorefrontSlot(
  slot: StorefrontStorageSlot,
  value: unknown,
  { storage = getDefaultStorage() }: WriteOptions = {}
): boolean {
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

interface MigrationEntry {
  slot: string;
  from: string;
  to: string;
}

interface MigrationResult {
  available: boolean;
  migrated: MigrationEntry[];
}

interface MigrateOptions {
  storage?: Storage | null;
  log?: ((level: string, message: string, meta?: Record<string, unknown>) => void) | null;
}

export function migrateLegacyStorefrontState({
  storage = getDefaultStorage(),
  log,
}: MigrateOptions = {}): MigrationResult {
  if (!canUseStorage(storage)) {
    return { available: false, migrated: [] };
  }

  const migrated: MigrationEntry[] = [];

  for (const [slot, aliases] of Object.entries(STOREFRONT_STORAGE_ALIASES)) {
    const canonicalKey = STOREFRONT_STORAGE_KEYS[slot as StorefrontStorageSlot];
    if (!canonicalKey || storage.getItem(canonicalKey) !== null) {
      continue;
    }

    for (const aliasKey of aliases) {
      const rawValue = storage.getItem(aliasKey);
      if (rawValue === null) {
        continue;
      }

      const parsedValue = safeParseJson<unknown>(rawValue, Symbol.for('invalid-json'));
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

interface StorefrontStorage {
  contract: typeof STOREFRONT_RUNTIME_CONTRACT;
  isAvailable(): boolean;
  loadJson<T>(slot: StorefrontStorageSlot, fallback: T): T;
  saveJson(slot: StorefrontStorageSlot, value: unknown): boolean;
  migrateLegacyState(): MigrationResult;
}

interface CreateStorageOptions {
  storage?: Storage | null;
  log?: ((level: string, message: string, meta?: Record<string, unknown>) => void) | null;
}

export function createStorefrontStorage(options: CreateStorageOptions = {}): StorefrontStorage {
  const { storage = getDefaultStorage(), log } = options;

  return {
    contract: STOREFRONT_RUNTIME_CONTRACT,
    isAvailable() {
      return canUseStorage(storage);
    },
    loadJson<T>(slot: StorefrontStorageSlot, fallback: T): T {
      return readStorefrontSlot(slot, fallback, { storage });
    },
    saveJson(slot: StorefrontStorageSlot, value: unknown) {
      return writeStorefrontSlot(slot, value, { storage });
    },
    migrateLegacyState() {
      return migrateLegacyStorefrontState({ storage, log });
    },
  };
}
