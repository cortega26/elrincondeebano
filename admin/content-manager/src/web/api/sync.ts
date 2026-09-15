// Plan 197: sync/conflicts/backups domain slice of ContentManagerClient.
// Pure functions over the shared ApiRequestFn core — no call-site churn:
// the facade keeps every signature, these just move.
import type { ApiRequestFn } from './requestCore.ts';

export interface BackupEntry {
  id: string;
  timestamp: string;
  files: Array<{ name: string; size: number }>;
  backup_class?: string;
  protected_reason?: string;
  cleanup_warning?: string;
}

export interface BackupsResponse {
  backups: { entries: BackupEntry[]; total: number; page: number };
}

export interface SyncStatusResponse {
  sync: {
    enabled: boolean;
    api_base: string | null;
    poll_interval: number;
    pull_interval: number;
    paused: boolean;
    token_configured: boolean;
    queue: { pending: number; error: number; total: number; synced?: number };
    next_attempt: string | null;
    last_push: { ok: boolean; error?: string } | null;
    last_pull: { ok: boolean; error?: string } | null;
  };
  capabilities: { push: string; pull: string };
}

export interface ConflictsResponse {
  conflicts: Array<{
    id: string;
    status: string;
    entity_type: string;
    entity_id: string;
    entity_name?: string;
    base_revision: number;
    local_snapshot: Record<string, unknown>;
    server_snapshot: Record<string, unknown>;
    fields: Array<{
      field: string;
      base_value: unknown;
      local_value: unknown;
      server_value: unknown;
      resolution: string;
      manual_value?: unknown;
      resolved_at?: string;
    }>;
    created_at: string;
    updated_at: string;
    retry_count: number;
    last_error?: string;
    resolution_audit: Array<{ timestamp: string; field: string; from: string; to: string }>;
  }>;
  summary: {
    unresolved: number;
    retrying: number;
    resolved: number;
    failed: number;
    total: number;
  };
}

export async function getBackups(
  request: ApiRequestFn,
  params?: { page?: number; limit?: number }
): Promise<BackupsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  return request<BackupsResponse>('/backup' + (qs ? `?${qs}` : ''));
}

export async function getSyncStatus(request: ApiRequestFn): Promise<SyncStatusResponse> {
  return request<SyncStatusResponse>('/sync/status');
}

export async function getConflicts(
  request: ApiRequestFn,
  params?: {
    status?: string;
    entity_type?: string;
  }
): Promise<ConflictsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.entity_type) searchParams.set('entity_type', params.entity_type);
  const qs = searchParams.toString();
  return request<ConflictsResponse>('/conflicts' + (qs ? `?${qs}` : ''));
}
