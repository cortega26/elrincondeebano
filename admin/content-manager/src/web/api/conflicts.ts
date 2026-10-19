// Plan 229: conflict-resolution domain slice of the ContentManagerClient —
// resolve/retry typed from the generated OpenAPI doc (plan 214 pattern).
import type { ApiRequestFn } from './requestCore.ts';
import type { paths } from './__generated__/openapi.ts';

export type ConflictResolveRequest = NonNullable<
  paths['/api/v1/conflicts/{id}/resolve']['post']['requestBody']
>['content']['application/json'];
export type ConflictResolveResponse =
  paths['/api/v1/conflicts/{id}/resolve']['post']['responses'][200]['content']['application/json'];
export type ConflictRetryResponse =
  paths['/api/v1/conflicts/{id}/retry']['post']['responses'][200]['content']['application/json'];

export async function resolveConflict(
  request: ApiRequestFn,
  id: string,
  payload: ConflictResolveRequest
): Promise<ConflictResolveResponse> {
  return request<ConflictResolveResponse>(`/conflicts/${encodeURIComponent(id)}/resolve`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function retryConflict(
  request: ApiRequestFn,
  id: string
): Promise<ConflictRetryResponse> {
  return request<ConflictRetryResponse>(`/conflicts/${encodeURIComponent(id)}/retry`, {
    method: 'POST',
  });
}
