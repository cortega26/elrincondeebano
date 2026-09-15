// ContentManagerClient — public facade. Method bodies live in the domain
// modules next to this file (products, categories, storefront, media,
// importExport, publications, system, sync); every call below is a one-line
// delegation over the single ApiRequestFn core (requestCore.ts).
//
// Plan 197 maintenance rule: new API methods go in their domain module +
// use the core. New fetch wrappers are banned (point at plan 197).
import type { ProductCatalog } from '../../shared/schemas/product.ts';
import type {
  ImportPreviewResponse,
  ImportApplyResponse,
  ImportResolution,
  CsvExportQuery,
} from '../../shared/schemas/importExport.ts';
import { fetchCore, requestJson, type ApiRequestFn } from './requestCore.ts';
import * as productsApi from './products.ts';
import * as categoriesApi from './categories.ts';
import * as storefrontApi from './storefront.ts';
import * as mediaApi from './media.ts';
import * as importExportApi from './importExport.ts';
import * as publicationsApi from './publications.ts';
import * as systemApi from './system.ts';
import * as syncApi from './sync.ts';

// Re-exported so existing `from './client.ts'` / `'@web/api/client.ts'`
// imports keep working unchanged after the split.
export { ApiRequestError, type ApiError } from './requestCore.ts';
export type {
  ProductFilters,
  PaginatedResponse,
  ProductResponse,
  HistoryResponse,
  ChangeSetResponse,
  ProductMutation,
  ProductWriteResult,
  BulkResult,
} from './products.ts';
export type { CategoryResponse } from './categories.ts';
export type { FeaturedResponse, BundlesResponse } from './storefront.ts';
export type {
  GitStatusResponse,
  PublicationPreviewResponse,
  JobResponse,
  PreviewBuildTrigger,
} from './publications.ts';
export type { DiagnosticsReport } from './system.ts';
export type {
  BackupEntry,
  BackupsResponse,
  SyncStatusResponse,
  ConflictsResponse,
} from './sync.ts';

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

export class ContentManagerClient {
  private readonly baseUrl: string;
  private readonly invoke: ApiRequestFn;

  constructor(baseUrl?: string) {
    // Derive the API base from the page origin when running in the browser so
    // the UI works on any port (e.g. the isolated e2e server); keep the
    // historical default for non-browser contexts.
    this.baseUrl = (
      baseUrl ??
      (typeof window !== 'undefined' ? window.location.origin : undefined) ??
      'http://127.0.0.1:3000'
    ).replace(/\/$/, '');
    this.invoke = <T>(path: string, init?: RequestInit, opts?: { rawResponse?: boolean }) =>
      this.request<T>(path, init, opts);
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
    opts?: { rawResponse?: boolean }
  ): Promise<T> {
    // Thin shim over the single browser core (requestCore.ts) — no fetch,
    // credential or envelope logic lives here.
    const url = `${this.baseUrl}/api/v1${path}`;
    if (opts?.rawResponse) {
      return (await fetchCore(url, init)) as unknown as T;
    }
    return requestJson<T>(url, init);
  }

  // ── products ──────────────────────────────────────────────────────────

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
  }): Promise<productsApi.PaginatedResponse<productsApi.ProductResponse>> {
    return productsApi.getProducts(this.invoke, params);
  }

  async getProduct(id: string): Promise<productsApi.ProductResponse> {
    return productsApi.getProduct(this.invoke, id);
  }

  async getCategories(): Promise<categoriesApi.CategoryResponse> {
    return categoriesApi.getCategories(this.invoke);
  }

  // Plan 127 F2.1: batch category ops for undo/redo (one registry write).
  async batchUpdateCategories(
    ops: Array<{ type: 'upsert' | 'delete'; category?: Record<string, unknown> }>,
    baseRevision: number
  ): Promise<{ command_id: string; status: string; applied: number }> {
    return categoriesApi.batchUpdateCategories(this.invoke, ops, baseRevision);
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
    return categoriesApi.createCategory(this.invoke, data, baseRevision);
  }

  async updateCategory(
    id: string,
    changes: Record<string, unknown>,
    baseRevision: number
  ): Promise<unknown> {
    return categoriesApi.updateCategory(this.invoke, id, changes, baseRevision);
  }

  async deleteCategory(id: string, baseRevision: number, reassignTo?: string): Promise<void> {
    await categoriesApi.deleteCategory(this.invoke, id, baseRevision, reassignTo);
  }

  async updateNavGroup(
    id: string,
    baseRevision: number,
    changes: { display_name?: { default?: string }; active?: boolean; sort_order?: number }
  ): Promise<Record<string, unknown>> {
    return categoriesApi.updateNavGroup(this.invoke, id, baseRevision, changes);
  }

  async createNavGroup(
    data: {
      id: string;
      display_name?: { default?: string };
      sort_order?: number;
    },
    baseRevision: number
  ): Promise<unknown> {
    return categoriesApi.createNavGroup(this.invoke, data, baseRevision);
  }

  async deleteNavGroup(id: string, baseRevision: number): Promise<void> {
    await categoriesApi.deleteNavGroup(this.invoke, id, baseRevision);
  }

  async createSubcategory(
    categoryId: string,
    data: { id: string; title: string; product_key: string; slug: string },
    baseRevision: number
  ): Promise<unknown> {
    return categoriesApi.createSubcategory(this.invoke, categoryId, data, baseRevision);
  }

  async updateSubcategory(
    categoryId: string,
    subId: string,
    changes: Record<string, unknown>,
    baseRevision: number
  ): Promise<unknown> {
    return categoriesApi.updateSubcategory(this.invoke, categoryId, subId, changes, baseRevision);
  }

  async deleteSubcategory(categoryId: string, subId: string, baseRevision: number): Promise<void> {
    await categoriesApi.deleteSubcategory(this.invoke, categoryId, subId, baseRevision);
  }

  async updateFeatured(featured: {
    featuredStaples: Array<Record<string, unknown>>;
    primaryCategories: string[];
    secondaryCategories: string[];
  }): Promise<unknown> {
    return storefrontApi.updateFeatured(this.invoke, featured);
  }

  async updateBundles(bundles: Array<Record<string, unknown>>): Promise<unknown> {
    return storefrontApi.updateBundles(this.invoke, bundles);
  }

  async getMedia(): Promise<Awaited<ReturnType<typeof mediaApi.getMedia>>> {
    return mediaApi.getMedia(this.invoke);
  }

  async getBundles(): Promise<storefrontApi.BundlesResponse> {
    return storefrontApi.getBundles(this.invoke);
  }

  async getFeatured(): Promise<storefrontApi.FeaturedResponse> {
    return storefrontApi.getFeatured(this.invoke);
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
  }): Promise<productsApi.ProductWriteResult> {
    return productsApi.createProduct(this.invoke, payload);
  }

  async deleteProduct(id: string, rev: number): Promise<{ status: string }> {
    return productsApi.deleteProduct(this.invoke, id, rev);
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
  ): Promise<productsApi.ProductWriteResult> {
    return productsApi.updateProduct(this.invoke, id, baseRevision, changes);
  }

  async getGitStatus(): Promise<publicationsApi.GitStatusResponse> {
    return publicationsApi.getGitStatus(this.invoke);
  }

  async gitPull(): Promise<{ job_id: string; status: string }> {
    return publicationsApi.gitPull(this.invoke);
  }

  // ── Lossless catalog interchange (plan 060) ────────────────────────────────

  async importPreview(payload: unknown): Promise<ImportPreviewResponse> {
    return importExportApi.importPreview(this.invoke, payload);
  }

  async importApply(
    previewId: string,
    resolutions: ImportResolution[]
  ): Promise<ImportApplyResponse> {
    return importExportApi.importApply(this.invoke, previewId, resolutions);
  }

  async exportJson(): Promise<ProductCatalog> {
    return importExportApi.exportJson(this.invoke);
  }

  async exportCsv(query: CsvExportQuery = {}): Promise<Response> {
    return importExportApi.exportCsv(this.invoke, query);
  }

  async previewPublication(): Promise<publicationsApi.PublicationPreviewResponse> {
    return publicationsApi.previewPublication(this.invoke);
  }

  async publish(
    commitMessage?: string,
    push?: boolean,
    publishAt?: string
  ): Promise<{ job_id: string; status: string }> {
    return publicationsApi.publish(this.invoke, commitMessage, push, publishAt);
  }

  async getJob(id: string): Promise<publicationsApi.JobResponse> {
    return publicationsApi.getJob(this.invoke, id);
  }

  async listJobs(): Promise<{ jobs: publicationsApi.JobResponse[] }> {
    return publicationsApi.listJobs(this.invoke);
  }

  async cancelJob(id: string): Promise<publicationsApi.JobResponse> {
    return publicationsApi.cancelJob(this.invoke, id);
  }

  async triggerPreviewBuild(): Promise<publicationsApi.PreviewBuildTrigger> {
    return publicationsApi.triggerPreviewBuild(this.invoke);
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
    return productsApi.batchUpdateProducts(this.invoke, updates);
  }

  async reorderProducts(orderedIds: string[]): Promise<{
    command_id: string;
    status: string;
    resulting_revision: number;
    reordered: number;
  }> {
    return productsApi.reorderProducts(this.invoke, orderedIds);
  }

  async bulkPreview(
    action: string,
    value: number | boolean | string,
    productIds: string[],
    scope?: { scope: 'all'; filters?: productsApi.ProductFilters }
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
    return productsApi.bulkPreview(this.invoke, action, value, productIds, scope);
  }

  async bulkApply(
    action: string,
    value: number | boolean | string,
    productIds: string[],
    scope?: { scope: 'all'; filters?: productsApi.ProductFilters }
  ): Promise<productsApi.BulkResult> {
    return productsApi.bulkApply(this.invoke, action, value, productIds, scope);
  }

  async getDiagnostics(): Promise<systemApi.DiagnosticsReport> {
    return systemApi.getDiagnostics(this.invoke);
  }

  async getHistory(): Promise<productsApi.HistoryResponse> {
    return productsApi.getHistory(this.invoke);
  }

  async getChangeSets(): Promise<{ items: productsApi.ChangeSetResponse[] }> {
    return productsApi.getChangeSets(this.invoke);
  }

  async getBackups(params?: { page?: number; limit?: number }): Promise<syncApi.BackupsResponse> {
    return syncApi.getBackups(this.invoke, params);
  }

  async getSyncStatus(): Promise<syncApi.SyncStatusResponse> {
    return syncApi.getSyncStatus(this.invoke);
  }

  async getConflicts(params?: {
    status?: string;
    entity_type?: string;
  }): Promise<syncApi.ConflictsResponse> {
    return syncApi.getConflicts(this.invoke, params);
  }
}
