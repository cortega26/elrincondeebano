import type { FastifyInstance } from 'fastify';
import type { Repositories } from './helpers.ts';

// Bootstrap is a public (unauthenticated) informational endpoint: capabilities,
// revision and counts only. The launch credential is deliberately NOT served
// here — the operator supplies it via ADMIN_CREDENTIAL or the startup log.
export async function bootstrapRoute(app: FastifyInstance, repos: Repositories): Promise<void> {
  app.get('/bootstrap', async () => {
    const productRev = repos.products.getRevision();
    const categories = repos.categories.getCategories();
    const navGroups = repos.categories.getNavGroups();
    const bundles = repos.storefront.getBundles();

    return {
      capabilities: {
        products: true,
        categories: true,
        storefront: true,
        media: false,
        changes: false,
        publication: false,
        sync: false,
      },
      revision: {
        products: productRev.rev,
        last_updated: productRev.last_updated,
      },
      counts: {
        products: repos.products.getAll(1, 1).total,
        categories: categories.length,
        nav_groups: navGroups.length,
        bundles: bundles.length,
      },
    };
  });
}
