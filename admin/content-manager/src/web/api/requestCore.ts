// Plan 197: the single browser fetch core.
//
// Every admin-UI HTTP path goes through here — ContentManagerClient.request()
// and fetchWithCredential() are thin shims over fetchCore/requestJson, so
// credential injection (plan 071) and 401-reset are audited in exactly one
// place (the plan-057 posture follows automatically).
//
// Maintenance rule: new API methods go in their domain module under
// src/web/api/ and use this core. New fetch wrappers are banned — point at
// this plan.
import { getCredentialValue, resetCredential } from '../app/credentialStore.ts';

export class ApiRequestError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; code: string; message: string }>;
  };
}

const MUTATION_METHODS: ReadonlySet<string> = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Raw-Response core: credential injection for mutations + fetch + 401 reset.
 * Returns the Response untouched so binary/download paths (CSV export,
 * media upload callers) keep their streaming shape.
 */
export async function fetchCore(url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? 'GET';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (MUTATION_METHODS.has(method)) {
    // The credential is operator-supplied (plan 071); a 401 means it is
    // missing/wrong and the CredentialPrompt must be shown.
    const credential = getCredentialValue();
    if (credential) {
      headers['x-admin-credential'] = credential;
    }
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    try {
      resetCredential();
    } catch {
      // ignore
    }
  }

  return response;
}

/**
 * JSON-envelope core: fetchCore + error mapping + empty-body handling.
 * This is the one request() implementation repo-wide (browser side).
 */
export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetchCore(url, init);

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Partial<ApiError>;
    throw new ApiRequestError(
      body.error?.message ?? `HTTP ${response.status}: ${response.statusText}`,
      response.status
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/**
 * The invocation shape every domain module in src/web/api/ receives.
 * `rawResponse` returns the untouched Response (binary/download paths);
 * the default parses the JSON envelope (and throws ApiRequestError).
 */
export type ApiRequestFn = <T>(
  path: string,
  init?: RequestInit,
  opts?: { rawResponse?: boolean }
) => Promise<T>;
