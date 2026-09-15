import type { FastifyInstance } from 'fastify';
import { ProductService } from '../../domain/products/productService.ts';
import type { CategoryService } from '../../domain/categories/categoryService.ts';
import type { Repositories } from './helpers.ts';
import { ensureCategoryOgAssets } from '../services/categoryOgLifecycle.ts';

// Plan 198: shared context + helpers for the category route slices
// (categoryCrudRoutes / categoryNavGroupRoutes / categorySubcategoryRoutes).
// Mirrors the changes-common.ts pattern: no barrel, import directly.
export interface CategoryRouteContext {
  app: FastifyInstance;
  repos: Repositories;
  productService: ProductService;
  categoryService: CategoryService;
  repoRoot: string;
}

export function readBaseRevision(body: unknown): number {
  return ((body ?? {}) as { base_revision?: number }).base_revision ?? 0;
}

// Plan 096: automatic OG regeneration on category writes — fire and
// forget; failures land in a failed media intent (visible in the
// workbench) and never block the category operation.
export function scheduleCategoryOg(
  repoRoot: string,
  slug: string | undefined,
  operation: 'generate' | 'delete'
): void {
  if (!slug) return;
  void ensureCategoryOgAssets(repoRoot, slug, operation);
}
