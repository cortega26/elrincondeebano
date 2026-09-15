// Plan 197: categories/nav domain slice of ContentManagerClient.
// Pure functions over the shared ApiRequestFn core — no call-site churn:
// the facade keeps every signature, these just move.
import type { CategoryRegistry } from '../../shared/schemas/category.ts';
import type { ApiRequestFn } from './requestCore.ts';

export interface CategoryResponse {
  rev: number;
  nav_groups: CategoryRegistry['nav_groups'];
  categories: CategoryRegistry['categories'];
}

export async function getCategories(request: ApiRequestFn): Promise<CategoryResponse> {
  return request<CategoryResponse>('/categories');
}

// Plan 127 F2.1: batch category ops for undo/redo (one registry write).
export async function batchUpdateCategories(
  request: ApiRequestFn,
  ops: Array<{ type: 'upsert' | 'delete'; category?: Record<string, unknown> }>,
  baseRevision: number
): Promise<{ command_id: string; status: string; applied: number }> {
  return request<{ command_id: string; status: string; applied: number }>(
    '/categories/batch-update',
    {
      method: 'POST',
      body: JSON.stringify({
        command_id: crypto.randomUUID(),
        base_revision: baseRevision,
        ops,
      }),
    }
  );
}

export async function createCategory(
  request: ApiRequestFn,
  data: {
    id: string;
    key: string;
    slug: string;
    display_name?: { default?: string };
    nav_group?: string;
    sort_order?: number;
  },
  baseRevision: number
): Promise<unknown> {
  return request('/categories', {
    method: 'POST',
    body: JSON.stringify({ ...data, base_revision: baseRevision }),
  });
}

export async function updateCategory(
  request: ApiRequestFn,
  id: string,
  changes: Record<string, unknown>,
  baseRevision: number
): Promise<unknown> {
  return request(`/categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...changes, base_revision: baseRevision }),
  });
}

export async function deleteCategory(
  request: ApiRequestFn,
  id: string,
  baseRevision: number,
  reassignTo?: string
): Promise<void> {
  await request(`/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify({
      base_revision: baseRevision,
      ...(reassignTo ? { reassign_to: reassignTo } : {}),
    }),
  });
}

export async function updateNavGroup(
  request: ApiRequestFn,
  id: string,
  baseRevision: number,
  changes: { display_name?: { default?: string }; active?: boolean; sort_order?: number }
): Promise<Record<string, unknown>> {
  return request(`/nav-groups/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...changes, base_revision: baseRevision }),
  });
}

export async function createNavGroup(
  request: ApiRequestFn,
  data: {
    id: string;
    display_name?: { default?: string };
    sort_order?: number;
  },
  baseRevision: number
): Promise<unknown> {
  return request('/nav-groups', {
    method: 'POST',
    body: JSON.stringify({ ...data, base_revision: baseRevision }),
  });
}

export async function deleteNavGroup(
  request: ApiRequestFn,
  id: string,
  baseRevision: number
): Promise<void> {
  await request(`/nav-groups/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify({ base_revision: baseRevision }),
  });
}

export async function createSubcategory(
  request: ApiRequestFn,
  categoryId: string,
  data: { id: string; title: string; product_key: string; slug: string },
  baseRevision: number
): Promise<unknown> {
  return request(`/categories/${encodeURIComponent(categoryId)}/subcategories`, {
    method: 'POST',
    body: JSON.stringify({ ...data, base_revision: baseRevision }),
  });
}

export async function updateSubcategory(
  request: ApiRequestFn,
  categoryId: string,
  subId: string,
  changes: Record<string, unknown>,
  baseRevision: number
): Promise<unknown> {
  return request(
    `/categories/${encodeURIComponent(categoryId)}/subcategories/${encodeURIComponent(subId)}`,
    { method: 'PATCH', body: JSON.stringify({ ...changes, base_revision: baseRevision }) }
  );
}

export async function deleteSubcategory(
  request: ApiRequestFn,
  categoryId: string,
  subId: string,
  baseRevision: number
): Promise<void> {
  await request(
    `/categories/${encodeURIComponent(categoryId)}/subcategories/${encodeURIComponent(subId)}`,
    { method: 'DELETE', body: JSON.stringify({ base_revision: baseRevision }) }
  );
}
