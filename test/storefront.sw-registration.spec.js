/* eslint-disable max-lines-per-function -- suite-level describe block (plan 218) */
import { describe, expect, it } from 'vitest';
import { shouldRegisterServiceWorker } from '../astro-poc/src/scripts/storefront/sw-registration.js';

function createStorage(entries = {}) {
  return {
    getItem: (key) => (key in entries ? entries[key] : null),
  };
}

function createLocation({ hostname = 'www.elrincondeebano.com', search = '' } = {}) {
  return { hostname, search };
}

describe('shouldRegisterServiceWorker (plan 218 kill-switch and loopback gate)', () => {
  describe('kill-switch', () => {
    it('skips registration when ebano-sw-disabled is "true"', () => {
      expect(
        shouldRegisterServiceWorker({
          storage: createStorage({ 'ebano-sw-disabled': 'true' }),
          location: createLocation(),
        })
      ).toBe(false);
    });

    it('registers when the kill-switch key is absent or not "true"', () => {
      expect(
        shouldRegisterServiceWorker({
          storage: createStorage(),
          location: createLocation(),
        })
      ).toBe(true);
      expect(
        shouldRegisterServiceWorker({
          storage: createStorage({ 'ebano-sw-disabled': 'false' }),
          location: createLocation(),
        })
      ).toBe(true);
    });

    it('lets the kill-switch win over loopback opt-ins', () => {
      expect(
        shouldRegisterServiceWorker({
          storage: createStorage({
            'ebano-sw-disabled': 'true',
            'ebano-sw-enable-local': 'true',
          }),
          location: createLocation({ hostname: 'localhost', search: '?sw=on' }),
        })
      ).toBe(false);
    });
  });

  describe('loopback hostnames', () => {
    const loopbackHosts = ['localhost', '127.0.0.1', '::1', '[::1]'];

    it('skips registration on loopback without an opt-in', () => {
      for (const hostname of loopbackHosts) {
        expect(
          shouldRegisterServiceWorker({
            storage: createStorage(),
            location: createLocation({ hostname }),
          }),
          `${hostname} must not register without opt-in`
        ).toBe(false);
      }
    });

    it('registers on loopback with the localStorage opt-in', () => {
      for (const hostname of loopbackHosts) {
        expect(
          shouldRegisterServiceWorker({
            storage: createStorage({ 'ebano-sw-enable-local': 'true' }),
            location: createLocation({ hostname }),
          }),
          `${hostname} must register with ebano-sw-enable-local`
        ).toBe(true);
      }
    });

    it('registers on loopback with ?sw=on even among other parameters', () => {
      for (const hostname of loopbackHosts) {
        expect(
          shouldRegisterServiceWorker({
            storage: createStorage(),
            location: createLocation({ hostname, search: '?a=1&sw=on' }),
          }),
          `${hostname} must register with ?a=1&sw=on`
        ).toBe(true);
      }
    });

    it('ignores query strings that only resemble the opt-in', () => {
      for (const search of ['?nosw=on', '?sw=off', '?a=1&sw=off', '?set=on&sw=off']) {
        expect(
          shouldRegisterServiceWorker({
            storage: createStorage(),
            location: createLocation({ hostname: 'localhost', search }),
          }),
          `${search} must not enable the SW`
        ).toBe(false);
      }
    });

    it('matches the opt-in query case-insensitively (legacy predicate)', () => {
      expect(
        shouldRegisterServiceWorker({
          storage: createStorage(),
          location: createLocation({ hostname: 'localhost', search: '?SW=ON' }),
        })
      ).toBe(true);
    });
  });

  describe('non-loopback and degraded inputs', () => {
    it('registers on public hostnames without any opt-in', () => {
      expect(
        shouldRegisterServiceWorker({
          storage: createStorage(),
          location: createLocation({ hostname: 'www.elrincondeebano.com' }),
        })
      ).toBe(true);
    });

    it('keeps registering when storage reads throw (kill-switch unknown)', () => {
      const throwingStorage = {
        getItem: () => {
          throw new Error('storage blocked');
        },
      };
      expect(() =>
        shouldRegisterServiceWorker({
          storage: throwingStorage,
          location: createLocation(),
        })
      ).not.toThrow();
      expect(
        shouldRegisterServiceWorker({
          storage: throwingStorage,
          location: createLocation(),
        })
      ).toBe(true);
    });

    it('skips loopback registration when storage reads throw and no query opt-in exists', () => {
      expect(
        shouldRegisterServiceWorker({
          storage: {
            getItem: () => {
              throw new Error('storage blocked');
            },
          },
          location: createLocation({ hostname: 'localhost' }),
        })
      ).toBe(false);
    });

    it('treats missing storage, missing location and missing arguments as non-loopback', () => {
      expect(shouldRegisterServiceWorker()).toBe(true);
      expect(shouldRegisterServiceWorker({ location: createLocation() })).toBe(true);
      expect(
        shouldRegisterServiceWorker({
          storage: createStorage(),
          location: undefined,
        })
      ).toBe(true);
    });

    it('does not throw when location access throws', () => {
      const throwingLocation = {};
      Object.defineProperty(throwingLocation, 'hostname', {
        get: () => {
          throw new Error('location blocked');
        },
      });
      expect(() =>
        shouldRegisterServiceWorker({
          storage: createStorage(),
          location: throwingLocation,
        })
      ).not.toThrow();
      expect(
        shouldRegisterServiceWorker({
          storage: createStorage(),
          location: throwingLocation,
        })
      ).toBe(true);
    });
  });
});
