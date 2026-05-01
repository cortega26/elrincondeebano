import { describe, expect, it, vi } from 'vitest';
import {
  getStorefrontCacheVersion,
  sendServiceWorkerMessage,
  syncStorefrontServiceWorkerVersion,
} from '../astro-poc/src/scripts/storefront/service-worker-sync.js';
import { STOREFRONT_RUNTIME_CONTRACT } from '../astro-poc/src/scripts/storefront/storage-contract.js';

function createMemoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));

  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

describe('service worker storefront sync', () => {
  it('derives a cache version token from the runtime contract', () => {
    expect(getStorefrontCacheVersion(STOREFRONT_RUNTIME_CONTRACT)).toBe(
      'astro-poc-storefront:storage-v1:cache-v2'
    );
  });

  it('sends a message through a MessageChannel and resolves the worker response', async () => {
    const target = {
      postMessage: vi.fn((message, ports) => {
        expect(message).toEqual({ type: 'PING' });
        ports[0].postMessage({ success: true, data: { ok: true } });
      }),
    };

    const response = await sendServiceWorkerMessage(target, { type: 'PING' });

    expect(response).toEqual({ ok: true });
    expect(target.postMessage).toHaveBeenCalledTimes(1);
  });

  it('invalidates caches exactly once when the runtime cache version changes', async () => {
    const versionKey = 'astro-poc-storefront:service-worker-cache-version';
    const storage = createMemoryStorage({
      [versionKey]: 'astro-poc-storefront:storage-v1:cache-v1',
    });
    const activeWorker = {
      postMessage: vi.fn((message, ports) => {
        expect(message).toEqual({ type: 'INVALIDATE_ALL_CACHES' });
        ports[0].postMessage({
          success: true,
          data: { status: 'all_caches_invalidated' },
        });
      }),
    };
    const waitingWorker = {
      postMessage: vi.fn(),
    };

    const result = await syncStorefrontServiceWorkerVersion({
      registration: {
        active: activeWorker,
        waiting: waitingWorker,
      },
      runtimeContract: STOREFRONT_RUNTIME_CONTRACT,
      storage,
    });

    expect(result).toMatchObject({
      available: true,
      invalidated: true,
      version: 'astro-poc-storefront:storage-v1:cache-v2',
    });
    expect(storage.getItem(versionKey)).toBe('astro-poc-storefront:storage-v1:cache-v2');
    expect(activeWorker.postMessage).toHaveBeenCalledTimes(1);
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('records the first seen version without invalidating caches', async () => {
    const storage = createMemoryStorage();
    const activeWorker = {
      postMessage: vi.fn(),
    };

    const result = await syncStorefrontServiceWorkerVersion({
      registration: { active: activeWorker },
      runtimeContract: STOREFRONT_RUNTIME_CONTRACT,
      storage,
    });

    expect(result).toMatchObject({
      available: true,
      invalidated: false,
      reason: 'first-seen-version',
    });
    expect(activeWorker.postMessage).not.toHaveBeenCalled();
  });
});
