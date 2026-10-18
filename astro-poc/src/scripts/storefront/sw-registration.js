// Plan 218: registration gate restored from the retired legacy surface
// (src/js/modules/service-worker-manager.mjs, plan 155) and re-anchored to
// the ADR 0006 "Operational affordances" contract:
// - `localStorage['ebano-sw-disabled'] === 'true'` is the operational
//   kill-switch.
// - Loopback hostnames register only with an explicit opt-in:
//   `localStorage['ebano-sw-enable-local'] === 'true'` or `?sw=on`.
// Both flags are read through injections so the predicate stays pure and
// unit-testable; unreadable storage must never throw.

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const QUERY_ENABLE_PATTERN = /(?:^|[?&])sw=on(?:&|$)/i;

function readStorageValue(storage, key) {
  if (!storage || typeof storage.getItem !== 'function') {
    return null;
  }

  try {
    return storage.getItem(key);
  } catch {
    // Unreadable storage means "flag unknown"; callers keep today's behavior.
    return null;
  }
}

function readLocation(location) {
  try {
    return {
      hostname: typeof location?.hostname === 'string' ? location.hostname : '',
      search: typeof location?.search === 'string' ? location.search : '',
    };
  } catch {
    return { hostname: '', search: '' };
  }
}

export function shouldRegisterServiceWorker({ storage = null, location = null } = {}) {
  if (readStorageValue(storage, 'ebano-sw-disabled') === 'true') {
    return false;
  }

  const { hostname, search } = readLocation(location);
  if (!LOOPBACK_HOSTS.has(hostname)) {
    return true;
  }

  return (
    readStorageValue(storage, 'ebano-sw-enable-local') === 'true' ||
    QUERY_ENABLE_PATTERN.test(search)
  );
}
