// The launch credential is supplied by the operator (ADMIN_CREDENTIAL env or
// the generated credential file, plan 125) and entered once in the UI via
// CredentialPrompt. It is never fetched from the server — bootstrap no longer
// serves it.
import { fetchCore } from '../api/requestCore.ts';
// Persisted (plan 071) so the operator is prompted only once; clear via the
// "Credencial ✓" button or on 401. Plan 223 re-scope of plan 184:
// localStorage is for the loopback single-operator PC; any non-loopback
// origin (remote mode) keeps the credential for the browser session only.
// Loopback bypass (2026-08-29, plan 071 still loopback-only): no credential
// prompt when accessed from 127.0.0.1 / localhost / ::1 (single-operator PC).
const STORAGE_KEY = 'ebano-credential';

export function isLoopbackHostname(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
}

export function isLoopback(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return isLoopbackHostname(window.location.hostname);
  } catch {
    return false;
  }
}

type CredentialStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Plan 223: loopback keeps localStorage; any non-loopback origin is
// session-scoped. If sessionStorage is unavailable (or throws on access),
// fall back to in-memory only — never localStorage off-loopback.
function activeStorage(): CredentialStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return (isLoopback() ? window.localStorage : window.sessionStorage) ?? null;
  } catch {
    return null;
  }
}

let _credential: string | null = null;

try {
  const stored = activeStorage()?.getItem(STORAGE_KEY);
  if (stored) _credential = stored;
} catch {
  // Storage may throw in some contexts (e.g. privacy mode) — ignore.
}

export function getCredentialValue(): string | null {
  if (_credential === null) {
    try {
      const stored = activeStorage()?.getItem(STORAGE_KEY);
      if (stored) _credential = stored;
    } catch {
      // ignore
    }
  }
  return _credential;
}

export function setCredential(value: string): void {
  _credential = value.trim() || null;
  try {
    const storage = activeStorage();
    if (storage) {
      if (_credential) storage.setItem(STORAGE_KEY, _credential);
      else storage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function resetCredential(): void {
  _credential = null;
  try {
    activeStorage()?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// Plan 197: thin shim over the single browser fetch core (requestCore.ts).
// Same call shape as before (absolute-path URL + raw Response), but the
// credential now comes from getCredentialValue() and 401 responses reset it
// — identical posture to ContentManagerClient.request().
export async function fetchWithCredential(url: string, init?: RequestInit): Promise<Response> {
  return fetchCore(url, init);
}
