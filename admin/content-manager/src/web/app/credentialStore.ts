let _credential: string | null = null;
let _fetchPromise: Promise<void> | null = null;

async function ensureCredential(): Promise<void> {
  if (_credential) return;
  if (_fetchPromise) {
    await _fetchPromise;
    return;
  }

  _fetchPromise = (async () => {
    try {
      const resp = await fetch('/api/v1/bootstrap');
      if (resp.ok) {
        const data = (await resp.json()) as { credential?: string };
        if (data.credential) {
          _credential = data.credential;
        }
      }
    } catch {
      // will be rejected by server on mutation
    } finally {
      _fetchPromise = null;
    }
  })();

  await _fetchPromise;
}

export function getCredentialValue(): string | null {
  return _credential;
}

export function resetCredential(): void {
  _credential = null;
}

export async function initCredential(): Promise<void> {
  await ensureCredential();
}

export async function fetchWithCredential(url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? 'GET';
  const isMutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (isMutation) {
    await ensureCredential();
    if (_credential) {
      headers['x-admin-credential'] = _credential;
    }
  }

  const response = await fetch(url, { ...init, headers });

  if (response.status === 401 && isMutation && _credential) {
    _credential = null;
    await ensureCredential();
    if (_credential) {
      headers['x-admin-credential'] = _credential;
      return fetch(url, { ...init, headers });
    }
  }

  return response;
}
