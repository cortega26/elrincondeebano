import type { Product } from '../../shared/schemas/product.ts';
import type { CategoryRegistry } from '../../shared/schemas/category.ts';
import type { StorefrontExperience, StorefrontBundle } from '../../shared/schemas/storefront.ts';
import { getCredentialValue } from '../app/credentialStore.ts';

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

  constructor(baseUrl = 'http://127.0.0.1:3000') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
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
      throw new Error(
        (body as ApiError).error?.message ?? `HTTP ${response.status}: ${response.statusText}`
      );
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
  }): Promise<PaginatedResponse<ProductResponse>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.q) searchParams.set('q', params.q);
    if (params?.category) searchParams.set('category', params.category);
    if (params?.archived !== undefined) searchParams.set('archived', String(params.archived));
    if (params?.out_of_stock !== undefined)
      searchParams.set('out_of_stock', String(params.out_of_stock));

    const qs = searchParams.toString();
    return this.request<PaginatedResponse<ProductResponse>>(`/products${qs ? `?${qs}` : ''}`);
  }

  async getProduct(id: string): Promise<ProductResponse> {
    return this.request<ProductResponse>(`/products/${encodeURIComponent(id)}`);
  }

  async getCategories(): Promise<CategoryResponse> {
    return this.request<CategoryResponse>('/categories');
  }

  async createCategory(data: {
    id: string;
    key: string;
    slug: string;
    display_name?: { default?: string };
    nav_group?: string;
    sort_order?: number;
  }): Promise<unknown> {
    return this.request('/categories', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateCategory(id: string, changes: Record<string, unknown>): Promise<unknown> {
    return this.request(`/categories/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    });
  }

  async deleteCategory(id: string): Promise<void> {
    await this.request(`/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async reorderCategories(orderedIds: string[]): Promise<unknown> {
    return this.request('/categories/reorder', {
      method: 'POST',
      body: JSON.stringify({ ordered_ids: orderedIds }),
    });
  }

  async createNavGroup(data: {
    id: string;
    display_name?: { default?: string };
    sort_order?: number;
  }): Promise<unknown> {
    return this.request('/nav-groups', { method: 'POST', body: JSON.stringify(data) });
  }

  async deleteNavGroup(id: string): Promise<void> {
    await this.request(`/nav-groups/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async createSubcategory(
    categoryId: string,
    data: { id: string; title: string; product_key: string; slug: string }
  ): Promise<unknown> {
    return this.request(`/categories/${encodeURIComponent(categoryId)}/subcategories`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSubcategory(
    categoryId: string,
    subId: string,
    changes: Record<string, unknown>
  ): Promise<unknown> {
    return this.request(
      `/categories/${encodeURIComponent(categoryId)}/subcategories/${encodeURIComponent(subId)}`,
      { method: 'PATCH', body: JSON.stringify(changes) }
    );
  }

  async deleteSubcategory(categoryId: string, subId: string): Promise<void> {
    await this.request(
      `/categories/${encodeURIComponent(categoryId)}/subcategories/${encodeURIComponent(subId)}`,
      { method: 'DELETE' }
    );
  }

  async reorderSubcategories(categoryId: string, orderedIds: string[]): Promise<unknown> {
    return this.request(`/categories/${encodeURIComponent(categoryId)}/subcategories/reorder`, {
      method: 'POST',
      body: JSON.stringify({ ordered_ids: orderedIds }),
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
    productIds: string[]
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
        product_ids: productIds,
      }),
    });
  }

  async bulkApply(
    action: string,
    value: number | boolean | string,
    productIds: string[]
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
        product_ids: productIds,
      }),
    });
  }
}
