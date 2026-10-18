// @vitest-environment jsdom
// Plan 223: remote-mode credential scoping. Loopback keeps localStorage; a
// non-loopback origin (remote mode) is session-scoped, must never touch
// localStorage, and degrades to in-memory only when sessionStorage is
// unavailable or throws.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'ebano-credential';

const originalDescriptors = {
  location: Object.getOwnPropertyDescriptor(globalThis, 'location'),
  localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
  sessionStorage: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'),
};

function setHostname(hostname: string): void {
  Object.defineProperty(globalThis, 'location', {
    value: { hostname },
    writable: true,
    configurable: true,
  });
}

async function loadStore(): Promise<typeof import('../../src/web/app/credentialStore.ts')> {
  vi.resetModules();
  return import('../../src/web/app/credentialStore.ts');
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.resetModules();
  for (const [key, descriptor] of Object.entries(originalDescriptors)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
  }
});

describe('credentialStore storage scope (plan 223)', () => {
  it('non-loopback writes sessionStorage and never localStorage', async () => {
    setHostname('admin.elrincondeebano.com');
    const store = await loadStore();

    store.setCredential('remote-secret');

    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe('remote-secret');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(store.getCredentialValue()).toBe('remote-secret');
  });

  it('non-loopback reads back a sessionStorage credential after reload', async () => {
    setHostname('admin.elrincondeebano.com');
    window.sessionStorage.setItem(STORAGE_KEY, 'seeded-remote');
    const store = await loadStore();

    expect(store.getCredentialValue()).toBe('seeded-remote');
  });

  it('loopback writes localStorage and not sessionStorage', async () => {
    setHostname('localhost');
    const store = await loadStore();

    store.setCredential('local-secret');

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('local-secret');
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('loopback reads back a localStorage credential after reload', async () => {
    setHostname('127.0.0.1');
    window.localStorage.setItem(STORAGE_KEY, 'seeded-local');
    const store = await loadStore();

    expect(store.getCredentialValue()).toBe('seeded-local');
  });

  it('resetCredential clears the sessionStorage credential in remote mode', async () => {
    setHostname('admin.elrincondeebano.com');
    const store = await loadStore();
    store.setCredential('remote-secret');

    store.resetCredential();

    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(store.getCredentialValue()).toBeNull();
  });

  it('resetCredential clears the localStorage credential on loopback', async () => {
    setHostname('localhost');
    const store = await loadStore();
    store.setCredential('local-secret');

    store.resetCredential();

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(store.getCredentialValue()).toBeNull();
  });
});

describe('credentialStore unavailable storage (plan 223)', () => {
  it('non-loopback with throwing sessionStorage stays in-memory, never localStorage', async () => {
    setHostname('admin.elrincondeebano.com');
    Object.defineProperty(globalThis, 'sessionStorage', {
      get() {
        throw new Error('storage denied');
      },
      configurable: true,
    });
    window.localStorage.clear();
    const store = await loadStore();

    expect(() => store.setCredential('in-memory')).not.toThrow();
    expect(store.getCredentialValue()).toBe('in-memory');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    expect(() => store.resetCredential()).not.toThrow();
    expect(store.getCredentialValue()).toBeNull();
  });

  it('loopback with throwing localStorage stays in-memory and does not throw', async () => {
    setHostname('localhost');
    Object.defineProperty(globalThis, 'localStorage', {
      get() {
        throw new Error('storage denied');
      },
      configurable: true,
    });
    const store = await loadStore();

    expect(() => store.setCredential('in-memory')).not.toThrow();
    expect(store.getCredentialValue()).toBe('in-memory');

    expect(() => store.resetCredential()).not.toThrow();
    expect(store.getCredentialValue()).toBeNull();
  });
});
