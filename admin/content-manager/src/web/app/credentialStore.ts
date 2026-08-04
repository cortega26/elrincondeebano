// The launch credential is supplied by the operator (ADMIN_CREDENTIAL env or
// the startup log, plan 071) and entered once in the UI via CredentialPrompt.
// It is never fetched from the server — bootstrap no longer serves it.
let _credential: string | null = null;

export function getCredentialValue(): string | null {
  return _credential;
}

export function setCredential(value: string): void {
  _credential = value.trim() || null;
}

export function resetCredential(): void {
  _credential = null;
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
