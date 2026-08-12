import type { Product, ProductCatalog } from '../../shared/schemas/product.ts';
import type { CategoryRegistry } from '../../shared/schemas/category.ts';
import type { StorefrontExperience, StorefrontBundle } from '../../shared/schemas/storefront.ts';
import type {
  ImportPreviewResponse,
  ImportApplyResponse,
  ImportResolution,
  CsvExportQuery,
} from '../../shared/schemas/importExport.ts';
import { getCredentialValue } from '../app/credentialStore.ts';

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

export interface BootstrapResponse {
  capabilities: {
    products: boolean;
    categories: boolean;
    storefront: boolean;
    media: boolean;
    changes: boolean;
    publication: boolean;
    sync: boolean;
  };
  revision: {
    products: number;
    last_updated: string;
  };
  counts: {
    products: number;
    categories: number;
    nav_groups: number;
    bundles: number;
  };
}

export interface ProductResponse extends Product {
  discounted_price: number;
  discount_percentage: number;
}

export interface CategoryResponse {
  rev: number;
  nav_groups: CategoryRegistry['nav_groups'];
  categories: CategoryRegistry['categories'];
}

export interface FeaturedResponse {
  featuredStaples: StorefrontExperience['home']['featuredStaples'];
  primaryCategories: string[];
  secondaryCategories: string[];
  trustBar: StorefrontExperience['trustBar'];
}

export interface BundlesResponse {
  bundles: StorefrontBundle[];
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; code: string; message: string }>;
  };
}

export class ApiRequestError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

export interface GitStatusResponse {
  branch: string;
  dirty: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
  hasConflicts: boolean;
}

export interface PublicationPreviewResponse {
  preflight: {
    ok: boolean;
    checks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; message: string }>;
    errors: string[];
    warnings: string[];
    validations?: {
      products: { ok: boolean; errors: string[] };
      categories: { ok: boolean; errors: string[] };
      storefront: { ok: boolean; errors: string[] };
    };
  };
  git: GitStatusResponse;
}

export interface JobResponse {
  id: string;
  type: string;
  status: string;
  progress: number;
  started_at?: string;
  completed_at?: string;
  result?: unknown;
  error?: string;
}

export class ContentManagerClient {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    // Derive the API base from the page origin when running in the browser so
    // the UI works on any port (e.g. the isolated e2e server); keep the
    // historical default for non-browser contexts.
    this.baseUrl = (
      baseUrl ??
      (typeof window !== 'undefined' ? window.location.origin : undefined) ??
      'http://127.0.0.1:3000'
    ).replace(/\/$/, '');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const method = init?.method ?? 'GET';
    const isMutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    };

    if (isMutation) {
      // The credential is operator-supplied (plan 071); a 401 means it is
      // missing/wrong and the CredentialPrompt must be shown.
      const credential = getCredentialValue();
      if (credential) {
        headers['x-admin-credential'] = credential;
      }
    }

    const url = `${this.baseUrl}/api/v1${path}`;
    const response = await fetch(url, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new ApiRequestError(
        (body as ApiError).error?.message ?? `HTTP ${response.status}: ${response.statusText}`,
        response.status
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async bootstrap(): Promise<BootstrapResponse> {
    return this.request<BootstrapResponse>('/bootstrap');
  }

  async getProducts(params?: {
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
  }): Promise<PaginatedResponse<ProductResponse>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.q) searchParams.set('q', params.q);
    if (params?.category) searchParams.set('category', params.category);
    if (params?.archived !== undefined) searchParams.set('archived', String(params.archived));
    if (params?.out_of_stock !== undefined)
      searchParams.set('out_of_stock', String(params.out_of_stock));
    if (params?.min_price !== undefined) searchParams.set('min_price', String(params.min_price));
    if (params?.max_price !== undefined) searchParams.set('max_price', String(params.max_price));
    if (params?.discounted_only !== undefined)
      searchParams.set('discounted_only', String(params.discounted_only));
    if (params?.min_discount !== undefined)
      searchParams.set('min_discount', String(params.min_discount));
    if (params?.max_discount !== undefined)
      searchParams.set('max_discount', String(params.max_discount));

    const qs = searchParams.toString();
    return this.request<PaginatedResponse<ProductResponse>>(`/products${qs ? `?${qs}` : ''}`);
  }

  async getProduct(id: string): Promise<ProductResponse> {
    return this.request<ProductResponse>(`/products/${encodeURIComponent(id)}`);
  }

  async getCategories(): Promise<CategoryResponse> {
    return this.request<CategoryResponse>('/categories');
  }

  async createCategory(
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
    return this.request('/categories', {
      method: 'POST',
      body: JSON.stringify({ ...data, base_revision: baseRevision }),
    });
  }

  async updateCategory(
    id: string,
    changes: Record<string, unknown>,
    baseRevision: number
  ): Promise<unknown> {
    return this.request(`/categories/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...changes, base_revision: baseRevision }),
    });
  }

  async deleteCategory(id: string, baseRevision: number, reassignTo?: string): Promise<void> {
    await this.request(`/categories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: JSON.stringify({
        base_revision: baseRevision,
        ...(reassignTo ? { reassign_to: reassignTo } : {}),
      }),
    });
  }

  async reorderCategories(orderedIds: string[], baseRevision: number): Promise<unknown> {
    return this.request('/categories/reorder', {
      method: 'POST',
      body: JSON.stringify({ ordered_ids: orderedIds, base_revision: baseRevision }),
    });
  }

  async updateNavGroup(
    id: string,
    baseRevision: number,
    changes: { display_name?: { default?: string }; active?: boolean; sort_order?: number }
  ): Promise<Record<string, unknown>> {
    return this.request(`/nav-groups/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...changes, base_revision: baseRevision }),
    });
  }

  async createNavGroup(
    data: {
      id: string;
      display_name?: { default?: string };
      sort_order?: number;
    },
    baseRevision: number
  ): Promise<unknown> {
    return this.request('/nav-groups', {
      method: 'POST',
      body: JSON.stringify({ ...data, base_revision: baseRevision }),
    });
  }

  async deleteNavGroup(id: string, baseRevision: number): Promise<void> {
    await this.request(`/nav-groups/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ base_revision: baseRevision }),
    });
  }

  async createSubcategory(
    categoryId: string,
    data: { id: string; title: string; product_key: string; slug: string },
    baseRevision: number
  ): Promise<unknown> {
    return this.request(`/categories/${encodeURIComponent(categoryId)}/subcategories`, {
      method: 'POST',
      body: JSON.stringify({ ...data, base_revision: baseRevision }),
    });
  }

  async updateSubcategory(
    categoryId: string,
    subId: string,
    changes: Record<string, unknown>,
    baseRevision: number
  ): Promise<unknown> {
    return this.request(
      `/categories/${encodeURIComponent(categoryId)}/subcategories/${encodeURIComponent(subId)}`,
      { method: 'PATCH', body: JSON.stringify({ ...changes, base_revision: baseRevision }) }
    );
  }

  async deleteSubcategory(categoryId: string, subId: string, baseRevision: number): Promise<void> {
    await this.request(
      `/categories/${encodeURIComponent(categoryId)}/subcategories/${encodeURIComponent(subId)}`,
      { method: 'DELETE', body: JSON.stringify({ base_revision: baseRevision }) }
    );
  }

  async reorderSubcategories(
    categoryId: string,
    orderedIds: string[],
    baseRevision: number
  ): Promise<unknown> {
    return this.request(`/categories/${encodeURIComponent(categoryId)}/subcategories/reorder`, {
      method: 'POST',
      body: JSON.stringify({ ordered_ids: orderedIds, base_revision: baseRevision }),
    });
  }

  async updateBundles(bundles: Array<Record<string, unknown>>): Promise<unknown> {
    return this.request('/storefront/bundles', {
      method: 'PUT',
      body: JSON.stringify({ bundles }),
    });
  }

  async getMedia(): Promise<{
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
  }> {
    return this.request('/media');
  }

  async getBundles(): Promise<BundlesResponse> {
    return this.request<BundlesResponse>('/storefront/bundles');
  }

  async getFeatured(): Promise<FeaturedResponse> {
    return this.request<FeaturedResponse>('/storefront/featured');
  }

  async createProduct(payload: {
    name: string;
    description?: string;
    price: number;
    discount?: number;
    stock?: boolean;
    category?: string;
    image_path?: string;
    image_avif_path?: string;
  }): Promise<{
    command_id: string;
    status: string;
    resulting_revision: number;
    changed_fields: string[];
    product: ProductResponse;
  }> {
    return this.request('/products', {
      method: 'POST',
      body: JSON.stringify({ command_id: crypto.randomUUID(), payload }),
    });
  }

  async deleteProduct(id: string, rev: number): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ base_revision: rev }),
    });
  }

  async updateProduct(
    id: string,
    baseRevision: number,
    changes: {
      name?: string;
      description?: string;
      price?: number;
      discount?: number;
      stock?: boolean;
      category?: string;
      image_path?: string;
      image_avif_path?: string;
      is_archived?: boolean;
    }
  ): Promise<{
    command_id: string;
    status: string;
    resulting_revision: number;
    changed_fields: string[];
    product: ProductResponse;
  }> {
    return this.request(`/products/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        command_id: crypto.randomUUID(),
        base_revision: baseRevision,
        payload: changes,
      }),
    });
  }

  async getGitStatus(): Promise<GitStatusResponse> {
    return this.request<GitStatusResponse>('/git/status');
  }

  async gitPull(): Promise<{ job_id: string; status: string }> {
    return this.request<{ job_id: string; status: string }>('/git/pull', { method: 'POST' });
  }

  // ── Lossless catalog interchange (plan 060) ────────────────────────────────

  async importPreview(payload: unknown): Promise<ImportPreviewResponse> {
    return this.request<ImportPreviewResponse>('/import/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async importApply(
    previewId: string,
    resolutions: ImportResolution[]
  ): Promise<ImportApplyResponse> {
    return this.request<ImportApplyResponse>('/import/apply', {
      method: 'POST',
      body: JSON.stringify({ preview_id: previewId, resolutions }),
    });
  }

  async exportJson(): Promise<ProductCatalog> {
    return this.request<ProductCatalog>('/export');
  }

  async exportCsv(query: CsvExportQuery = {}): Promise<Response> {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.category) params.set('category', query.category);
    if (query.archived) params.set('archived', query.archived);
    if (query.out_of_stock) params.set('out_of_stock', query.out_of_stock);
    if (query.discounted_only) params.set('discounted_only', query.discounted_only);
    if (query.min_discount) params.set('min_discount', query.min_discount);
    if (query.max_discount) params.set('max_discount', query.max_discount);
    const qs = params.toString();
    return fetch(`${this.baseUrl}/api/v1/export.csv${qs ? `?${qs}` : ''}`);
  }

  async previewPublication(): Promise<PublicationPreviewResponse> {
    return this.request<PublicationPreviewResponse>('/publications/preview', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async publish(
    commitMessage?: string,
    push?: boolean
  ): Promise<{ job_id: string; status: string }> {
    return this.request<{ job_id: string; status: string }>('/publications', {
      method: 'POST',
      body: JSON.stringify({ commitMessage, push }),
    });
  }

  async getJob(id: string): Promise<JobResponse> {
    return this.request<JobResponse>(`/jobs/${encodeURIComponent(id)}`);
  }

  async cancelJob(id: string): Promise<JobResponse> {
    return this.request<JobResponse>(`/jobs/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
    });
  }

  async batchUpdateProducts(
    updates: Array<{
      id: string;
      rev: number;
      patch: {
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
    }>
  ): Promise<{ command_id: string; status: string; resulting_revision: number; applied: number }> {
    return this.request<{
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

  async reorderProducts(orderedIds: string[]): Promise<{
    command_id: string;
    status: string;
    resulting_revision: number;
    reordered: number;
  }> {
    return this.request('/products/reorder', {
      method: 'POST',
      body: JSON.stringify({
        command_id: crypto.randomUUID(),
        ordered_ids: orderedIds,
      }),
    });
  }

  async bulkPreview(
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
    return this.request('/products/bulk/preview', {
      method: 'POST',
      body: JSON.stringify({
        command_id: crypto.randomUUID(),
        action,
        value,
        ...(scope ? { scope: scope.scope, filters: scope.filters } : { product_ids: productIds }),
      }),
    });
  }

  async bulkApply(
    action: string,
    value: number | boolean | string,
    productIds: string[],
    scope?: { scope: 'all'; filters?: ProductFilters }
  ): Promise<{
    command_id: string;
    status: string;
    resulting_revision: number;
    changed: number;
    changes: Array<{
      product_id: string;
      name: string;
      field: string;
      old_value: number | boolean | string;
      new_value: number | boolean | string;
    }>;
  }> {
    return this.request('/products/bulk/apply', {
      method: 'POST',
      body: JSON.stringify({
        command_id: crypto.randomUUID(),
        action,
        value,
        ...(scope ? { scope: scope.scope, filters: scope.filters } : { product_ids: productIds }),
      }),
    });
  }
}
