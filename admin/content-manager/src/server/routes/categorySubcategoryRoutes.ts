import type { Subcategory } from '../../shared/schemas/category.ts';
import { subcategorySchema } from '../../shared/schemas/category.ts';
import { requireWriteMode } from './helpers.ts';
import { runRegistryCommand } from './catalog-command.ts';
import { type CategoryRouteContext, readBaseRevision } from './categories-common.ts';

// Plan 198: subcategories slice of categoryRoutes (move-only split).
export async function registerCategorySubcategoryRoutes({
  app,
  repos,
  productService,
}: CategoryRouteContext): Promise<void> {
  app.post('/categories/:categoryId/subcategories', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const { categoryId } = request.params as { categoryId: string };
    const body = request.body as {
      id?: string;
      title?: string;
      product_key?: string;
      slug?: string;
      description?: string;
      order?: number;
      enabled?: boolean;
    };

    if (!body?.id || !body?.title || !body?.product_key || !body?.slug) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Missing id, title, product_key, or slug' },
      });
    }
    // Narrowed once for the closures below (narrowing does not cross into them).
    const { id: subId, title, product_key: productKey, slug } = body;
    const subDescription = body.description;
    const subOrder = body.order;
    const subEnabled = body.enabled;

    return runRegistryCommand({
      reply,
      load: () => repos.categories.load(),
      getBaseRevision: () => readBaseRevision(request.body),
      successStatus: 201,
      apply: (registry) => {
        const category = (registry.categories ?? []).find((c) => c.id === categoryId);
        if (!category) {
          return {
            ok: false,
            statusCode: 404,
            code: 'NOT_FOUND',
            message: `Category "${categoryId}" not found`,
          };
        }

        if (!category.subcategories) {
          category.subcategories = [];
        }

        if (category.subcategories.some((s) => s.id === subId)) {
          return {
            ok: false,
            statusCode: 409,
            code: 'CONFLICT',
            message: `Subcategory "${subId}" already exists`,
          };
        }

        const subcategory: Subcategory = {
          id: subId,
          title,
          product_key: productKey,
          slug,
          description: subDescription ?? '',
          order: subOrder ?? category.subcategories.length * 10,
          enabled: subEnabled ?? true,
        };

        const result = subcategorySchema.safeParse(subcategory);
        if (!result.success) {
          return {
            ok: false,
            statusCode: 400,
            code: 'BAD_REQUEST',
            message: result.error.issues.map((i) => i.message).join('; '),
          };
        }

        category.subcategories.push(result.data);
        category.subcategories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return { ok: true, data: result.data };
      },
      write: (freshRegistry, baseRevision) => repos.categories.write(freshRegistry, baseRevision),
      onSuccess: (_registry, data, writeRev) => ({
        ...(data as Record<string, unknown>),
        rev: writeRev,
        resulting_revision: writeRev,
      }),
    });
  });

  app.patch('/categories/:categoryId/subcategories/:subId', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const { categoryId, subId } = request.params as { categoryId: string; subId: string };
    const body = request.body as Record<string, unknown>;

    return runRegistryCommand({
      reply,
      load: () => repos.categories.load(),
      getBaseRevision: () => readBaseRevision(request.body),
      apply: (registry) => {
        const category = (registry.categories ?? []).find((c) => c.id === categoryId);
        if (!category) {
          return {
            ok: false,
            statusCode: 404,
            code: 'NOT_FOUND',
            message: `Category "${categoryId}" not found`,
          };
        }

        const subcategories = category.subcategories ?? [];
        const idx = subcategories.findIndex((s) => s.id === subId);
        if (idx === -1) {
          return {
            ok: false,
            statusCode: 404,
            code: 'NOT_FOUND',
            message: `Subcategory "${subId}" not found`,
          };
        }

        const updated = { ...subcategories[idx], ...body };
        const result = subcategorySchema.safeParse(updated);
        if (!result.success) {
          return {
            ok: false,
            statusCode: 400,
            code: 'BAD_REQUEST',
            message: result.error.issues.map((i) => i.message).join('; '),
          };
        }

        category.subcategories = subcategories.map((s) => (s.id === subId ? result.data : s));
        category.subcategories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return { ok: true, data: result.data };
      },
      write: (freshRegistry, baseRevision) => repos.categories.write(freshRegistry, baseRevision),
      onSuccess: (_registry, data, writeRev) => ({
        ...(data as Record<string, unknown>),
        rev: writeRev,
        resulting_revision: writeRev,
      }),
    });
  });

  app.delete('/categories/:categoryId/subcategories/:subId', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const { categoryId, subId } = request.params as { categoryId: string; subId: string };

    return runRegistryCommand({
      reply,
      load: () => repos.categories.load(),
      getBaseRevision: () => readBaseRevision(request.body),
      successStatus: 204,
      apply: (registry) => {
        const category = (registry.categories ?? []).find((c) => c.id === categoryId);
        if (!category) {
          return {
            ok: false,
            statusCode: 404,
            code: 'NOT_FOUND',
            message: `Category "${categoryId}" not found`,
          };
        }

        const subcategories = category.subcategories ?? [];
        const before = subcategories.length;
        category.subcategories = subcategories.filter((s) => s.id !== subId);

        if (category.subcategories.length === before) {
          return {
            ok: false,
            statusCode: 404,
            code: 'NOT_FOUND',
            message: `Subcategory "${subId}" not found`,
          };
        }
        return { ok: true };
      },
      write: (freshRegistry, baseRevision) => repos.categories.write(freshRegistry, baseRevision),
      onSuccess: () => undefined,
    });
  });

  app.post('/categories/:categoryId/subcategories/reorder', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const { categoryId } = request.params as { categoryId: string };
    const body = request.body as { ordered_ids?: string[] };
    const orderedIds = body?.ordered_ids;

    if (!orderedIds?.length) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Missing ordered_ids' },
      });
    }

    return runRegistryCommand({
      reply,
      load: () => repos.categories.load(),
      getBaseRevision: () => readBaseRevision(request.body),
      apply: (registry) => {
        const category = (registry.categories ?? []).find((c) => c.id === categoryId);
        if (!category) {
          return {
            ok: false,
            statusCode: 404,
            code: 'NOT_FOUND',
            message: `Category "${categoryId}" not found`,
          };
        }

        const subcategories = category.subcategories ?? [];
        for (let i = 0; i < orderedIds.length; i++) {
          const sub = subcategories.find((s) => s.id === orderedIds[i]);
          if (sub) {
            sub.order = i * 10;
          }
        }
        category.subcategories = subcategories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return { ok: true };
      },
      write: (freshRegistry, baseRevision) => repos.categories.write(freshRegistry, baseRevision),
      onSuccess: (_registry, _data, writeRev) => ({
        status: 'ok',
        reordered: orderedIds.length,
        rev: writeRev,
        resulting_revision: writeRev,
      }),
    });
  });
}
