// The launch credential is supplied by the operator (ADMIN_CREDENTIAL env or
// the startup log, plan 071) and entered once in the UI via CredentialPrompt.// It is never fetched from the server — bootstrap no longer serves it.
import { fetchCore } from '../api/requestCore.ts';
// Persisted to localStorage for single-operator localhost (plan 071 compliant)
// so the operator is prompted only once; clear via "Credencial ✓" button or 401.
// Loopback bypass (2026-08-29, plan 071 still loopback-only): no credential
// prompt when accessed from 127.0.0.1 / localhost / ::1 (single-operator PC).
// Plan 184 accepted risk (owner-confirmed 2026-09-14): localStorage (not
// session) persistence stands — a same-origin XSS could exfiltrate it, but
// the admin is loopback-only with no third-party script surface. After any
// suspected admin-origin XSS: rotate via the credential file channel and
// clear stored copies.
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

// Plan 197: thin shim over the single browser fetch core (requestCore.ts).
// Same call shape as before (absolute-path URL + raw Response), but the
// credential now comes from getCredentialValue() and 401 responses reset it
// — identical posture to ContentManagerClient.request().
export async function fetchWithCredential(url: string, init?: RequestInit): Promise<Response> {
  return fetchCore(url, init);
}
