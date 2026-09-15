// Plan 197: import/export domain slice of ContentManagerClient.
// Pure functions over the shared ApiRequestFn core — no call-site churn:
// the facade keeps every signature, these just move.
//
// exportCsv goes through the unified core (raw Response return) instead of
// a bare fetch: same bytes on the wire, but 401 responses now reset the
// credential like every other client path (the stale-credential bug was
// exclusive to CSV export because it bypassed request()).
import type { ProductCatalog } from '../../shared/schemas/product.ts';
import type {
  ImportPreviewResponse,
  ImportApplyResponse,
  ImportResolution,
  CsvExportQuery,
} from '../../shared/schemas/importExport.ts';
import type { ApiRequestFn } from './requestCore.ts';
import { buildFilterSearchParams } from './filterParams.ts';

// ── Lossless catalog interchange (plan 060) ────────────────────────────────

export async function importPreview(
  request: ApiRequestFn,
  payload: unknown
): Promise<ImportPreviewResponse> {
  return request<ImportPreviewResponse>('/import/preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function importApply(
  request: ApiRequestFn,
  previewId: string,
  resolutions: ImportResolution[]
): Promise<ImportApplyResponse> {
  return request<ImportApplyResponse>('/import/apply', {
    method: 'POST',
    body: JSON.stringify({ preview_id: previewId, resolutions }),
  });
}

export async function exportJson(request: ApiRequestFn): Promise<ProductCatalog> {
  return request<ProductCatalog>('/export');
}

export async function exportCsv(
  request: ApiRequestFn,
  query: CsvExportQuery = {}
): Promise<Response> {
  const qs = buildFilterSearchParams(query).toString();
  return request<Response>(`/export.csv${qs ? `?${qs}` : ''}`, undefined, { rawResponse: true });
}
