// Plan 197: products domain slice of ContentManagerClient.
// Pure functions over the shared ApiRequestFn core — no call-site churn:
// the facade keeps every signature, these just move.
import type { Product } from '../../shared/schemas/product.ts';
import type { ApiRequestFn } from './requestCore.ts';
import { buildFilterSearchParams } from './filterParams.ts';

export type ProductFilters = {
  q?: string;
  category?: string;
  archived?: boolean;
  out_of_stock?: boolean;
  min_price?: number;
  max_price?: number;
  discounted_only?: boolean;
  min_discount?: number;
  max_discount?: number;
};

export interface PaginatedResponse<T> {
  page: number;
  limit: number;
  total: number;
  items: T[];
}

export interface ProductResponse extends Product {
  discounted_price: number;
  discount_percentage: number;
}

export interface HistoryResponse {
  total_products: number;
  products_with_history: number;
  entries: Array<{
    product_name: string;
    product_id?: string;
    field: string;
    timestamp?: string;
    by?: string;
    rev?: number;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    change_set_id?: string;
    source_change_set_id?: string;
  }>;
  catalog_version?: string;
  catalog_last_updated?: string;
}

export interface ChangeSetResponse {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  product_ops: Array<Record<string, unknown>>;
  source_change_set_id?: string;
}

export type ProductMutation = {
  name?: string;
  description?: string;
  price?: number;
  discount?: number;
  stock?: boolean;
  category?: string;
  image_path?: string;
  image_avif_path?: string;
  is_archived?: boolean;
};

export interface ProductWriteResult {
  command_id: string;
  status: string;
  resulting_revision: number;
  changed_fields: string[];
  product: ProductResponse;
}

export async function getProducts(
  request: ApiRequestFn,
  params?: {
    page?: number;
    limit?: number;
    q?: string;
    category?: string;
    archived?: boolean;
    out_of_stock?: boolean;
    min_price?: number;
    max_price?: number;
    discounted_only?: boolean;
    min_discount?: number;
    max_discount?: number;
  }
): Promise<PaginatedResponse<ProductResponse>> {
  const qs = buildFilterSearchParams(params).toString();
  return request<PaginatedResponse<ProductResponse>>(`/products${qs ? `?${qs}` : ''}`);
}

export async function getProduct(request: ApiRequestFn, id: string): Promise<ProductResponse> {
  return request<ProductResponse>(`/products/${encodeURIComponent(id)}`);
}

export async function createProduct(
  request: ApiRequestFn,
  payload: {
    name: string;
    description?: string;
    price: number;
    discount?: number;
    stock?: boolean;
    category?: string;
    image_path?: string;
    image_avif_path?: string;
  }
): Promise<ProductWriteResult> {
  return request('/products', {
    method: 'POST',
    body: JSON.stringify({ command_id: crypto.randomUUID(), payload }),
  });
}

export async function deleteProduct(
  request: ApiRequestFn,
  id: string,
  rev: number
): Promise<{ status: string }> {
  return request<{ status: string }>(`/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify({ base_revision: rev }),
  });
}

export async function updateProduct(
  request: ApiRequestFn,
  id: string,
  baseRevision: number,
  changes: ProductMutation
): Promise<ProductWriteResult> {
  return request(`/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      command_id: crypto.randomUUID(),
      base_revision: baseRevision,
      payload: changes,
    }),
  });
}

export async function batchUpdateProducts(
  request: ApiRequestFn,
  updates: Array<{ id: string; rev: number; patch: ProductMutation }>
): Promise<{ command_id: string; status: string; resulting_revision: number; applied: number }> {
  return request<{
    command_id: string;
    status: string;
    resulting_revision: number;
    applied: number;
  }>('/products/batch-update', {
    method: 'POST',
    body: JSON.stringify({
      command_id: crypto.randomUUID(),
      updates,
    }),
  });
}

export async function reorderProducts(
  request: ApiRequestFn,
  orderedIds: string[]
): Promise<{
  command_id: string;
  status: string;
  resulting_revision: number;
  reordered: number;
}> {
  return request('/products/reorder', {
    method: 'POST',
    body: JSON.stringify({
      command_id: crypto.randomUUID(),
      ordered_ids: orderedIds,
    }),
  });
}

export interface BulkResult {
  command_id: string;
  status: string;
  resulting_revision: number;
  changed: number;
  // Plan 172 additive field: non-mutating no-ops revert + report here.
  skipped: number;
  changes: Array<{
    product_id: string;
    name: string;
    field: string;
    old_value: number | boolean | string;
    new_value: number | boolean | string;
  }>;
}

export async function bulkPreview(
  request: ApiRequestFn,
  action: string,
  value: number | boolean | string,
  productIds: string[],
  scope?: { scope: 'all'; filters?: ProductFilters }
): Promise<{
  command_id: string;
  status: string;
  action: string;
  changes: Array<{
    product_id: string;
    name: string;
    field: string;
    old_value: number | boolean | string;
    new_value: number | boolean | string;
  }>;
  total_changes: number;
}> {
  return request('/products/bulk/preview', {
    method: 'POST',
    body: JSON.stringify({
      command_id: crypto.randomUUID(),
      action,
      value,
      ...(scope ? { scope: scope.scope, filters: scope.filters } : { product_ids: productIds }),
    }),
  });
}

export async function bulkApply(
  request: ApiRequestFn,
  action: string,
  value: number | boolean | string,
  productIds: string[],
  scope?: { scope: 'all'; filters?: ProductFilters }
): Promise<BulkResult> {
  return request<BulkResult>('/products/bulk/apply', {
    method: 'POST',
    body: JSON.stringify({
      command_id: crypto.randomUUID(),
      action,
      value,
      ...(scope ? { scope: scope.scope, filters: scope.filters } : { product_ids: productIds }),
    }),
  });
}

export async function getHistory(request: ApiRequestFn): Promise<HistoryResponse> {
  return request<HistoryResponse>('/history');
}

export async function getChangeSets(
  request: ApiRequestFn
): Promise<{ items: ChangeSetResponse[] }> {
  return request<{ items: ChangeSetResponse[] }>('/change-sets');
}
