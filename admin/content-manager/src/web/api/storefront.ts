// Plan 197: storefront domain slice of ContentManagerClient.
// Pure functions over the shared ApiRequestFn core — no call-site churn:
// the facade keeps every signature, these just move.
import type { StorefrontExperience, StorefrontBundle } from '../../shared/schemas/storefront.ts';
import type { ApiRequestFn } from './requestCore.ts';

export interface FeaturedResponse {
  featuredStaples: StorefrontExperience['home']['featuredStaples'];
  primaryCategories: string[];
  secondaryCategories: string[];
  trustBar: StorefrontExperience['trustBar'];
}

export interface BundlesResponse {
  bundles: StorefrontBundle[];
}

export async function updateFeatured(
  request: ApiRequestFn,
  featured: {
    featuredStaples: Array<Record<string, unknown>>;
    primaryCategories: string[];
    secondaryCategories: string[];
  }
): Promise<unknown> {
  return request('/storefront/featured', {
    method: 'PUT',
    body: JSON.stringify(featured),
  });
}

export async function updateBundles(
  request: ApiRequestFn,
  bundles: Array<Record<string, unknown>>
): Promise<unknown> {
  return request('/storefront/bundles', {
    method: 'PUT',
    body: JSON.stringify({ bundles }),
  });
}

export async function getBundles(request: ApiRequestFn): Promise<BundlesResponse> {
  return request<BundlesResponse>('/storefront/bundles');
}

export async function getFeatured(request: ApiRequestFn): Promise<FeaturedResponse> {
  return request<FeaturedResponse>('/storefront/featured');
}
