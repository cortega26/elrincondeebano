import type { FastifyInstance } from 'fastify';
import { ProductService } from '../../domain/products/productService.ts';
import type { CategoryService } from '../../domain/categories/categoryService.ts';
import type { Repositories } from './helpers.ts';
import { registerCategoryCrudRoutes } from './categoryCrudRoutes.ts';
import { registerCategoryNavGroupRoutes } from './categoryNavGroupRoutes.ts';
import { registerCategorySubcategoryRoutes } from './categorySubcategoryRoutes.ts';

// Plan 198: thin registrar — the category/nav-group/subcategory slices live
// in categoryCrudRoutes / categoryNavGroupRoutes / categorySubcategoryRoutes
// (move-only split). app.ts registration is unchanged.
export async function categoryRoutes(
  app: FastifyInstance,
  repos: Repositories,
  productService: ProductService,
  categoryService: CategoryService,
  repoRoot: string
): Promise<void> {
  const ctx = { app, repos, productService, categoryService, repoRoot };
  await registerCategoryCrudRoutes(ctx);
  await registerCategoryNavGroupRoutes(ctx);
  await registerCategorySubcategoryRoutes(ctx);
}
