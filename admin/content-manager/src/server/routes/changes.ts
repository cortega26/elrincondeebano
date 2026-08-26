// Shim: original `changes.ts` split into three modules (plan 158).
// Re-export for backwards compatibility — new code should import from
// changeSetRoutes.ts / importRoutes.ts / historyRoutes.ts directly.
export { changeSetRoutes } from './changeSetRoutes.ts';
export { importRoutes } from './importRoutes.ts';
export { historyRoutes } from './historyRoutes.ts';

import type { FastifyInstance } from 'fastify';
import type { Repositories } from './helpers.ts';
import { ChangeSetRepository } from '../repositories/changeSetRepository.ts';
import type { ProductService } from '../../domain/products/productService.ts';
import { changeSetRoutes } from './changeSetRoutes.ts';
import { importRoutes } from './importRoutes.ts';
import { historyRoutes } from './historyRoutes.ts';

/** @deprecated Use changeSetRoutes / importRoutes / historyRoutes directly. */
export async function changesRoutes(
  app: FastifyInstance,
  repos: Repositories,
  changeSets: ChangeSetRepository,
  repoRoot: string,
  productService: ProductService
): Promise<void> {
  await changeSetRoutes(app, repos, changeSets, repoRoot, productService);
  await importRoutes(app, repos, changeSets, repoRoot, productService);
  await historyRoutes(app, repos, changeSets, repoRoot, productService);
}
