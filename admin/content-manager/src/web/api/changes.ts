// Plan 229: change-set / history / backup domain slice of the
// ContentManagerClient — the history page's mutations, typed from the
// generated OpenAPI doc (plan 214 pattern) instead of hand-built URLs.
import type { ApiRequestFn } from './requestCore.ts';
import type { paths } from './__generated__/openapi.ts';

export type ChangeSet =
  paths['/api/v1/change-sets/{id}']['get']['responses'][200]['content']['application/json'];
export type ChangeSetPatch = NonNullable<
  paths['/api/v1/change-sets/{id}']['patch']['requestBody']
>['content']['application/json'];
export type ApplyChangeSetResponse =
  paths['/api/v1/change-sets/{id}/apply']['post']['responses'][200]['content']['application/json'];
export type DiscardChangeSetResponse =
  paths['/api/v1/change-sets/{id}/discard']['post']['responses'][200]['content']['application/json'];
export type UndoChangeSetResponse =
  paths['/api/v1/change-sets/{id}/undo']['post']['responses'][200]['content']['application/json'];
export type RedoChangeSetResponse =
  paths['/api/v1/change-sets/{id}/redo']['post']['responses'][200]['content']['application/json'];
export type RevertHistoryResponse =
  paths['/api/v1/history/{productId}/revert']['post']['responses'][200]['content']['application/json'];
export type PrunePreviewResponse =
  paths['/api/v1/backup/prune-preview']['post']['responses'][200]['content']['application/json'];
export type PruneBackupsResponse =
  paths['/api/v1/backup/prune']['post']['responses'][200]['content']['application/json'];
export type RestoreBackupResponse =
  paths['/api/v1/backup/{id}/restore']['post']['responses'][200]['content']['application/json'];

export async function getChangeSet(request: ApiRequestFn, id: string): Promise<ChangeSet> {
  return request<ChangeSet>(`/change-sets/${encodeURIComponent(id)}`);
}

/** Explicit status transitions via PATCH (validate flow: validating → validated). */
export async function updateChangeSet(
  request: ApiRequestFn,
  id: string,
  patch: ChangeSetPatch
): Promise<ChangeSet> {
  return request<ChangeSet>(`/change-sets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function applyChangeSet(
  request: ApiRequestFn,
  id: string
): Promise<ApplyChangeSetResponse> {
  return request<ApplyChangeSetResponse>(`/change-sets/${encodeURIComponent(id)}/apply`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function discardChangeSet(
  request: ApiRequestFn,
  id: string
): Promise<DiscardChangeSetResponse> {
  return request<DiscardChangeSetResponse>(`/change-sets/${encodeURIComponent(id)}/discard`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function undoChangeSet(
  request: ApiRequestFn,
  id: string
): Promise<UndoChangeSetResponse> {
  return request<UndoChangeSetResponse>(`/change-sets/${encodeURIComponent(id)}/undo`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function redoChangeSet(
  request: ApiRequestFn,
  id: string
): Promise<RedoChangeSetResponse> {
  return request<RedoChangeSetResponse>(`/change-sets/${encodeURIComponent(id)}/redo`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function revertHistory(
  request: ApiRequestFn,
  productId: string,
  toRev: number
): Promise<RevertHistoryResponse> {
  return request<RevertHistoryResponse>(`/history/${encodeURIComponent(productId)}/revert`, {
    method: 'POST',
    body: JSON.stringify({ to_rev: toRev }),
  });
}

// No body, mirroring the page's old wire (and the doc's requestBody: never).
// Pre-existing quirk, preserved not fixed (plan 229): fetchCore defaults the
// Content-Type to JSON and Fastify 400s an empty JSON body — same for POST
// /git/pull. The history page stays silent on that non-ok response.
export async function prunePreview(request: ApiRequestFn): Promise<PrunePreviewResponse> {
  return request<PrunePreviewResponse>('/backup/prune-preview', { method: 'POST' });
}

export async function pruneBackups(
  request: ApiRequestFn,
  ids: string[]
): Promise<PruneBackupsResponse> {
  return request<PruneBackupsResponse>('/backup/prune', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

export async function restoreBackup(
  request: ApiRequestFn,
  id: string
): Promise<RestoreBackupResponse> {
  return request<RestoreBackupResponse>(`/backup/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
