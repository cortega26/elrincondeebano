// The launch credential is supplied by the operator (ADMIN_CREDENTIAL env or
// the startup log, plan 071) and entered once in the UI via CredentialPrompt.
// It is never fetched from the server — bootstrap no longer serves it.
// Persisted to localStorage for single-operator localhost (plan 071 compliant)
// so the operator is prompted only once; clear via "Credencial ✓" button or 401.
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

let _credential: string | null = null;

try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) _credential = stored;
  }
} catch {
  // localStorage may throw in some contexts (e.g. privacy mode) — ignore.
}

export function getCredentialValue(): string | null {
  if (_credential === null) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) _credential = stored;
      }
    } catch {
      // ignore
    }
  }
  return _credential;
}

export function setCredential(value: string): void {
  _credential = value.trim() || null;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (_credential) window.localStorage.setItem(STORAGE_KEY, _credential);
      else window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function resetCredential(): void {
  _credential = null;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export async function fetchWithCredential(url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? 'GET';
  const isMutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (isMutation && _credential) {
    headers['x-admin-credential'] = _credential;
  }

  return fetch(url, { ...init, headers });
}
