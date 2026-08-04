import type { FastifyInstance } from 'fastify';
import type { Repositories } from './catalog.ts';

export async function storefrontMutRoutes(
  app: FastifyInstance,
  repos: Repositories
): Promise<void> {
  app.get('/storefront/bundles', async () => {
    return { bundles: repos.storefront.getBundles() };
  });

  app.get('/storefront/featured', async () => {
    const experience = repos.storefront.load();
    return {
      featuredStaples: experience.home.featuredStaples,
      primaryCategories: experience.home.primaryCategories,
      secondaryCategories: experience.home.secondaryCategories,
      trustBar: experience.trustBar,
    };
  });

  app.put('/storefront/bundles', async (request, reply) => {
    try {
      const body = request.body as { bundles?: Array<Record<string, unknown>> };
      if (!body?.bundles || !Array.isArray(body.bundles)) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Expected { bundles: [...] }' },
        });
      }

      const existing = repos.storefront.load();
      existing.bundles = body.bundles as typeof existing.bundles;

      const wrote = repos.storefront.write(existing);
      if (!wrote.ok) {
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: wrote.error } });
      }

      return { status: 'ok', bundle_count: body.bundles.length };
    } catch (err) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: (err as Error).message },
      });
    }
  });

  app.put('/storefront/featured', async (request, reply) => {
    try {
      const body = request.body as {
        featuredStaples?: Array<{ category: string; name: string }>;
        primaryCategories?: string[];
        secondaryCategories?: string[];
      };

      const existing = repos.storefront.load();

      if (body.featuredStaples) {
        existing.home.featuredStaples = body.featuredStaples;
      }
      if (body.primaryCategories) {
        existing.home.primaryCategories = body.primaryCategories;
      }
      if (body.secondaryCategories) {
        existing.home.secondaryCategories = body.secondaryCategories;
      }

      const wrote = repos.storefront.write(existing);
      if (!wrote.ok) {
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: wrote.error } });
      }

      return { status: 'ok' };
    } catch (err) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: (err as Error).message },
      });
    }
  });
}
