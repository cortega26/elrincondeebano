import type { FastifyInstance } from 'fastify';
import type { Repositories } from './catalog.ts';
import { validateStorefrontCuration } from '../../domain/storefront/storefrontValidation.ts';
import { HttpError, sanitizeUserMessage } from '../../shared/errors/AppError.ts';
import { storefrontBundleSchema, productReferenceSchema } from '../../shared/schemas/storefront.ts';
import { z } from 'zod';

// Plan 092: zod at the boundary (the repo-wide winning pattern) — shape
// validation before the invariant walker, which stays as the second layer.
const bundlesWriteSchema = z.object({
  bundles: z.array(storefrontBundleSchema),
});
const featuredWriteSchema = z.object({
  featuredStaples: z.array(productReferenceSchema).optional(),
  primaryCategories: z.array(z.string()).optional(),
  secondaryCategories: z.array(z.string()).optional(),
});

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
      const parsed = bundlesWriteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues.map((i) => i.message).join('; '),
          },
        });
      }
      const body = parsed.data;

      const existing = repos.storefront.load();
      existing.bundles = body.bundles;

      // Plan 066 step 1: strict invariants + product reference checks.
      const catalog = repos.products.loadCatalog();
      const validated = validateStorefrontCuration(existing, catalog.products);
      if (!validated.ok) {
        return reply.status(422).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: validated.issues.map((i) => i.message).join('; '),
            details: validated.issues,
          },
        });
      }

      const wrote = repos.storefront.write(existing);
      if (!wrote.ok) {
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: wrote.error } });
      }

      return { status: 'ok', bundle_count: body.bundles.length };
    } catch (err) {
      throw new HttpError(400, 'BAD_REQUEST', sanitizeUserMessage((err as Error).message));
    }
  });

  app.put('/storefront/featured', async (request, reply) => {
    try {
      const parsed = featuredWriteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues.map((i) => i.message).join('; '),
          },
        });
      }
      const body = parsed.data;

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

      // Featured staples reference real products (plan 066 step 1/4).
      const catalog = repos.products.loadCatalog();
      const validated = validateStorefrontCuration(existing, catalog.products);
      if (!validated.ok) {
        return reply.status(422).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: validated.issues.map((i) => i.message).join('; '),
            details: validated.issues,
          },
        });
      }

      const wrote = repos.storefront.write(existing);
      if (!wrote.ok) {
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: wrote.error } });
      }

      return { status: 'ok' };
    } catch (err) {
      throw new HttpError(400, 'BAD_REQUEST', sanitizeUserMessage((err as Error).message));
    }
  });
}
