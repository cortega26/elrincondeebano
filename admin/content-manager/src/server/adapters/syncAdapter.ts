import { z } from 'zod';

export const syncConfigSchema = z.object({
  enabled: z.boolean().default(false),
  api_base: z.string().url().optional(),
  api_token: z.string().optional(),
  poll_interval: z.number().int().positive().default(60),
  pull_interval: z.number().int().positive().default(300),
  timeout: z.number().int().positive().default(10),
});

export type SyncConfig = z.infer<typeof syncConfigSchema>;

// Python parity (sync.py): the remote contract is
//   PATCH {api_base}/api/products/:id  { base_rev, changeset_id, source, fields }
//     200 -> { product, rev, conflicts: [] }
//     409/412 -> { product, rev, conflicts: [{ field, base_value, local_value, server_value }] }
//   GET  {api_base}/api/products/changes?since_rev=N -> { changes: [...], to_rev }
export const remoteConflictSchema = z.object({
  field: z.string(),
  base_value: z.unknown(),
  local_value: z.unknown(),
  server_value: z.unknown(),
});
export type RemoteConflict = z.infer<typeof remoteConflictSchema>;

export const pushResponseSchema = z.object({
  product: z.record(z.string(), z.unknown()).optional(),
  rev: z.number().int().nonnegative().optional(),
  conflicts: z.array(remoteConflictSchema).default([]),
  last_updated: z.string().optional(),
  version: z.string().optional(),
});
export type PushResponse = z.infer<typeof pushResponseSchema>;

export const remoteChangeSchema = z.object({
  product_snapshot: z.record(z.string(), z.unknown()),
  rev: z.number().int().nonnegative().optional(),
  product_id: z.string().optional(),
  last_updated: z.string().optional(),
  version: z.string().optional(),
});
export type RemoteChange = z.infer<typeof remoteChangeSchema>;

export const pullResponseSchema = z.object({
  changes: z.array(remoteChangeSchema).default([]),
  to_rev: z.number().int().nonnegative().optional(),
});
export type PullResponse = z.infer<typeof pullResponseSchema>;

const MAX_RESPONSE_BYTES = 1024 * 1024;

export interface SyncTransportResult {
  ok: boolean;
  status: number;
  retryable: boolean;
  conflicts?: RemoteConflict[];
  body?: unknown;
  error?: string;
}

// URL policy (plan 064 step 1): HTTPS for remote hosts; HTTP is allowed only
// for loopback (localhost / 127.0.0.1 / ::1) so the local fake-server tests
// and offline dev setups work. Mirrors Python's http/https allowlist with a
// stricter remote rule.
export function isAllowedSyncUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') return true;
    if (parsed.protocol !== 'http:') return false;
    const host = parsed.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

function getToken(): string | undefined {
  return process.env.SYNC_API_TOKEN;
}

export class SyncAdapter {
  private config: SyncConfig;

  constructor(config: SyncConfig) {
    this.config = config;
  }

  get isConfigured(): boolean {
    return this.config.enabled && !!this.config.api_base && isAllowedSyncUrl(this.config.api_base);
  }

  getConfig(): SyncConfig {
    return { ...this.config };
  }

  setConfig(config: SyncConfig): void {
    this.config = config;
  }

  get apiBase(): string | undefined {
    return this.config.api_base;
  }

  // ── push ──────────────────────────────────────────────────────────────────

  async pushChange(entry: {
    product_id: string;
    base_rev: number;
    fields: Record<string, unknown>;
    changeset_id: string;
  }): Promise<SyncTransportResult> {
    if (!this.isConfigured || !this.config.api_base) {
      return { ok: false, status: 503, retryable: false, error: 'Sync not configured' };
    }
    const token = getToken();
    const productPath = encodeURIComponent(entry.product_id);
    const url = `${this.config.api_base}/api/products/${productPath}`;
    if (!isAllowedSyncUrl(url)) {
      return { ok: false, status: 400, retryable: false, error: 'Sync URL is not allowed' };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Correlation-Id': entry.changeset_id,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          base_rev: entry.base_rev,
          changeset_id: entry.changeset_id,
          source: 'offline',
          fields: entry.fields,
        }),
        redirect: 'manual',
        signal: AbortSignal.timeout(this.config.timeout * 1000),
      });

      // Reject any redirect outright (safe redirects policy).
      if (
        response.type === 'opaqueredirect' ||
        [301, 302, 303, 307, 308].includes(response.status)
      ) {
        return { ok: false, status: response.status, retryable: false, error: 'Redirect rejected' };
      }

      const text = await readBounded(response);
      if (text === null) {
        return { ok: false, status: response.status, retryable: true, error: 'Response too large' };
      }

      if (response.status === 200) {
        const parsed = parseJson(text);
        const validated = pushResponseSchema.safeParse(parsed);
        if (!validated.success) {
          return { ok: false, status: 502, retryable: true, error: 'Invalid push response schema' };
        }
        return { ok: true, status: 200, retryable: false, body: validated.data };
      }

      if (response.status === 409 || response.status === 412) {
        const parsed = parseJson(text);
        const validated = pushResponseSchema.safeParse(parsed);
        const conflicts = validated.success ? validated.data.conflicts : [];
        return {
          ok: false,
          status: response.status,
          retryable: false,
          conflicts: conflicts.length > 0 ? conflicts : undefined,
          body: validated.success ? validated.data : undefined,
          error: `Remote rejected the change (${response.status})`,
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          status: response.status,
          retryable: false,
          error: 'Authentication failed',
        };
      }
      if (response.status === 429) {
        return { ok: false, status: 429, retryable: true, error: 'Rate limited' };
      }
      if (response.status >= 500) {
        return {
          ok: false,
          status: response.status,
          retryable: true,
          error: `Server error (${response.status})`,
        };
      }
      return {
        ok: false,
        status: response.status,
        retryable: true,
        error: `Unexpected status ${response.status}`,
      };
    } catch (err) {
      const message =
        (err as Error).name === 'TimeoutError' ? 'Sync request timed out' : (err as Error).message;
      return { ok: false, status: 0, retryable: true, error: message };
    }
  }

  // ── pull ──────────────────────────────────────────────────────────────────

  async pullChanges(sinceRev: number): Promise<SyncTransportResult> {
    if (!this.isConfigured || !this.config.api_base) {
      return { ok: false, status: 503, retryable: false, error: 'Sync not configured' };
    }
    const token = getToken();
    const url = `${this.config.api_base}/api/products/changes?since_rev=${sinceRev}`;
    if (!isAllowedSyncUrl(url)) {
      return { ok: false, status: 400, retryable: false, error: 'Sync URL is not allowed' };
    }

    const headers: Record<string, string> = {
      'X-Correlation-Id': `pull-${Date.now()}`,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.config.timeout * 1000),
      });

      if (
        response.type === 'opaqueredirect' ||
        [301, 302, 303, 307, 308].includes(response.status)
      ) {
        return { ok: false, status: response.status, retryable: false, error: 'Redirect rejected' };
      }

      const text = await readBounded(response);
      if (text === null) {
        return { ok: false, status: response.status, retryable: true, error: 'Response too large' };
      }

      if (response.status === 200) {
        const validated = pullResponseSchema.safeParse(parseJson(text));
        if (!validated.success) {
          return { ok: false, status: 502, retryable: true, error: 'Invalid pull response schema' };
        }
        return { ok: true, status: 200, retryable: false, body: validated.data };
      }
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          status: response.status,
          retryable: false,
          error: 'Authentication failed',
        };
      }
      if (response.status === 429) {
        return { ok: false, status: 429, retryable: true, error: 'Rate limited' };
      }
      return {
        ok: false,
        status: response.status,
        retryable: true,
        error: `Server error (${response.status})`,
      };
    } catch (err) {
      const message =
        (err as Error).name === 'TimeoutError' ? 'Sync request timed out' : (err as Error).message;
      return { ok: false, status: 0, retryable: true, error: message };
    }
  }
}

async function readBounded(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) return null;
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
