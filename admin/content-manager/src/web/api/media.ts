// Plan 197: media domain slice of ContentManagerClient.
// Pure functions over the shared ApiRequestFn core — no call-site churn:
// the facade keeps every signature, these just move.
//
// Plan 229: the workbench lifecycle (upload → intent → run/cancel/apply/
// discard → batch) lives here too — pages no longer hand-build /api/v1
// URLs. Request/response shapes come from the generated doc (plan 214
// pattern). Upload keeps the raw-Response pattern (caller sniffs res.ok
// and parses the body, same as exportCsv).
import type { ApiRequestFn } from './requestCore.ts';
import type { paths } from './__generated__/openapi.ts';

export async function getMedia(request: ApiRequestFn): Promise<{
  items: Array<{
    path: string;
    name: string;
    size: number;
    ext: string;
    status: 'active' | 'orphan' | 'generated' | 'staged' | 'missing';
    productName?: string;
  }>;
  summary: {
    total: number;
    active: number;
    orphans: number;
    generated: number;
    staged: number;
    missing: number;
  };
  intents: Array<{
    id: string;
    type: string;
    status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'applied';
    target_path?: string;
    progress: number;
    errors: string[];
    category_slug?: string;
  }>;
}> {
  return request('/media');
}

// ── Workbench lifecycle (plan 229) ─────────────────────────────────────────

export type MediaUploadRequest = NonNullable<
  paths['/api/v1/media/upload']['post']['requestBody']
>['content']['application/json'];
export type MediaIntentRequest = NonNullable<
  paths['/api/v1/media/intents']['post']['requestBody']
>['content']['application/json'];
export type MediaIntentType = MediaIntentRequest['type'];
export type MediaIntent =
  paths['/api/v1/media/intents']['post']['responses'][201]['content']['application/json'];
export type RunIntentResponse =
  paths['/api/v1/media/intents/{id}/run']['post']['responses'][200]['content']['application/json'];
export type CancelIntentResponse =
  paths['/api/v1/media/intents/{id}/cancel']['post']['responses'][200]['content']['application/json'];
export type ApplyIntentResponse =
  paths['/api/v1/media/intents/{id}/apply']['post']['responses'][200]['content']['application/json'];
export type DiscardIntentResponse =
  paths['/api/v1/media/intents/{id}']['delete']['responses'][200]['content']['application/json'];
export type BatchIntentsRequest = NonNullable<
  paths['/api/v1/media/intents/batch']['post']['requestBody']
>['content']['application/json'];
export type BatchIntentsResponse =
  paths['/api/v1/media/intents/batch']['post']['responses'][200]['content']['application/json'];

/** Raw Response: the page owns res.ok / error-envelope handling (base64 upload). */
export async function uploadMedia(
  request: ApiRequestFn,
  body: MediaUploadRequest
): Promise<Response> {
  return request<Response>(
    '/media/upload',
    { method: 'POST', body: JSON.stringify(body) },
    { rawResponse: true }
  );
}

export async function createIntent(
  request: ApiRequestFn,
  body: MediaIntentRequest
): Promise<MediaIntent> {
  return request<MediaIntent>('/media/intents', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function runIntent(request: ApiRequestFn, id: string): Promise<RunIntentResponse> {
  return request<RunIntentResponse>(`/media/intents/${encodeURIComponent(id)}/run`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function cancelIntent(
  request: ApiRequestFn,
  id: string
): Promise<CancelIntentResponse> {
  return request<CancelIntentResponse>(`/media/intents/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function applyIntent(request: ApiRequestFn, id: string): Promise<ApplyIntentResponse> {
  return request<ApplyIntentResponse>(`/media/intents/${encodeURIComponent(id)}/apply`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/** The old page sent DELETE to the bare intent URL (no /discard suffix). */
export async function discardIntent(
  request: ApiRequestFn,
  id: string
): Promise<DiscardIntentResponse> {
  return request<DiscardIntentResponse>(`/media/intents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
}

export async function batchIntents(
  request: ApiRequestFn,
  body: BatchIntentsRequest
): Promise<BatchIntentsResponse> {
  return request<BatchIntentsResponse>('/media/intents/batch', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
