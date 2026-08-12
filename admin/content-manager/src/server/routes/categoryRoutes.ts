import type { FastifyInstance } from 'fastify';
import { ProductService } from '../../domain/products/productService.ts';
import type { CategoryService } from '../../domain/categories/categoryService.ts';
import type { CreateCategoryInput } from '../../domain/categories/categoryService.ts';
import type { Subcategory } from '../../shared/schemas/category.ts';
import { subcategorySchema, navGroupRecordSchema } from '../../shared/schemas/category.ts';
import { ensureCategoryOgAssets } from '../services/categoryOgLifecycle.ts';
import { requireWriteMode, type Repositories } from './helpers.ts';
export async function categoryRoutes(
  app: FastifyInstance,
  repos: Repositories,
  productService: ProductService,
  categoryService: CategoryService,
  repoRoot: string
): Promise<void> {
  // Plan 096: automatic OG regeneration on category writes — fire and
  // forget; failures land in a failed media intent (visible in the
  // workbench) and never block the category operation.
  function scheduleCategoryOg(slug: string | undefined, operation: 'generate' | 'delete'): void {
    if (!slug) return;
    void ensureCategoryOgAssets(repoRoot, slug, operation);
  }

  function readBaseRevision(body: unknown): number {
    return ((body ?? {}) as { base_revision?: number }).base_revision ?? 0;
  }

  app.get('/categories', async () => {
    const registry = repos.categories.load();
    return {
      rev: registry.rev,
      nav_groups: registry.nav_groups ?? [],
      categories: registry.categories ?? [],
    };
  });

  app.get('/categories/:key', async (request, reply) => {
    const { key } = request.params as { key: string };
    const category = repos.categories.getByKey(key);
    if (!category) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Category "${key}" not found` },
      });
    }
    return category;
  });

  app.post('/categories', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const registry = repos.categories.load();
    const body = request.body as CreateCategoryInput;

    if (!body?.id || !body?.key || !body?.slug) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Missing id, key, or slug' },
      });
    }

    const result = categoryService.create(registry, body);
    if (!result.ok) {
      return reply.status(409).send({ error: { code: 'CONFLICT', message: result.error } });
    }

    const wrote = await repos.categories.write(registry, readBaseRevision(request.body));
    if (!wrote.ok) {
      return reply.status(wrote.statusCode).send({
        error: {
          code: wrote.statusCode === 409 ? 'CONFLICT' : 'INTERNAL_ERROR',
          message: wrote.error,
        },
      });
    }

    scheduleCategoryOg(result.category?.slug || result.category?.key, 'generate');
    return reply.status(201).send({ ...result.category, rev: wrote.rev });
  });

  app.patch('/categories/:id', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const { id } = request.params as { id: string };
    const registry = repos.categories.load();
    const result = categoryService.edit(registry, id, request.body ?? {});

    if (!result.ok) {
      // Plan 094: typed code from the service — never string-match messages.
      const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'CONFLICT' ? 409 : 422;
      return reply.status(status).send({
        error: { code: result.code ?? 'VALIDATION_ERROR', message: result.error },
      });
    }

    const wrote = await repos.categories.write(registry, readBaseRevision(request.body));
    if (!wrote.ok) {
      return reply.status(wrote.statusCode).send({
        error: {
          code: wrote.statusCode === 409 ? 'CONFLICT' : 'INTERNAL_ERROR',
          message: wrote.error,
        },
      });
    }

    scheduleCategoryOg(result.category?.slug || result.category?.key, 'generate');
    return { ...result.category, rev: wrote.rev };
  });

  app.delete('/categories/:id', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const { id } = request.params as { id: string };
    const body = request.body as { reassign_to?: string } | undefined;
    const registry = repos.categories.load();
    const catalog = repos.products.loadCatalog();

    // Plan 096: full-catalog usage scan (no 200 cap) — products referencing
    // the category are either reassigned first or block the delete.
    const usage = catalog.products.filter((p) => p.category === id);

    if (body?.reassign_to && body.reassign_to !== id) {
      if (!registry.categories?.some((c) => c.id === body.reassign_to)) {
        return reply.status(422).send({
          error: {
            code: 'REASSIGN_TARGET_NOT_FOUND',
            message: `Categoría destino "${body.reassign_to}" no existe`,
          },
        });
      }
      const now = new Date().toISOString();
      for (const product of usage) {
        product.category = body.reassign_to;
        product.rev += 1;
        product.field_last_modified.category = {
          ts: now,
          by: 'category-reassign',
          rev: product.rev,
          base_rev: product.rev - 1,
          changeset_id: null,
        };
      }
      if (usage.length > 0) {
        const baseRev = catalog.rev;
        catalog.rev += 1;
        catalog.last_updated = now;
        const wrote = await repos.products.writeCatalog(
          catalog,
          `reassign-${id}-${body.reassign_to}`,
          baseRev
        );
        if (!wrote.ok) {
          return reply.status(wrote.statusCode).send({
            error: { code: 'CONFLICT', message: wrote.error },
          });
        }
      }
    } else if (usage.length > 0) {
      return reply.status(409).send({
        error: {
          code: 'CATEGORY_IN_USE',
          message: `La categoría está en uso por ${usage.length} productos. Reasigna o borra primero.`,
        },
      });
    }

    const result = categoryService.remove(registry, id, 0);
    if (!result.ok) {
      // Plan 094: typed code from the service.
      return reply.status(result.code === 'NOT_FOUND' ? 404 : 409).send({
        error: { code: result.code ?? 'CONFLICT', message: result.error },
      });
    }

    const wrote = await repos.categories.write(registry, readBaseRevision(request.body));
    if (!wrote.ok) {
      return reply.status(wrote.statusCode).send({
        error: {
          code: wrote.statusCode === 409 ? 'CONFLICT' : 'INTERNAL_ERROR',
          message: wrote.error,
        },
      });
    }

    scheduleCategoryOg(id, 'delete');
    return reply.status(200).send({ status: 'deleted', reassigned: usage.length });
  });

  app.post('/categories/reorder', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const body = request.body as { ordered_ids?: string[] };
    if (!body?.ordered_ids?.length) {
      return reply
        .status(400)
        .send({ error: { code: 'BAD_REQUEST', message: 'Missing ordered_ids' } });
    }

    const registry = repos.categories.load();
    categoryService.reorder(registry, body.ordered_ids);

    const wrote = await repos.categories.write(registry, readBaseRevision(body));
    if (!wrote.ok) {
      return reply.status(wrote.statusCode).send({
        error: {
          code: wrote.statusCode === 409 ? 'CONFLICT' : 'INTERNAL_ERROR',
          message: wrote.error,
        },
      });
    }

    return { status: 'ok', reordered: body.ordered_ids.length, rev: wrote.rev };
  });

  app.post('/nav-groups', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const parsed = navGroupRecordSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const registry = repos.categories.load();
    const result = categoryService.addNavGroup(registry, parsed.data);
    if (!result.ok) {
      return reply.status(409).send({ error: { code: 'CONFLICT', message: result.error } });
    }

    const wrote = await repos.categories.write(registry, readBaseRevision(request.body));
    if (!wrote.ok) {
      return reply.status(wrote.statusCode).send({
        error: {
          code: wrote.statusCode === 409 ? 'CONFLICT' : 'INTERNAL_ERROR',
          message: wrote.error,
        },
      });
    }

    return reply.status(201).send({ ...result.group, rev: wrote.rev });
  });

  // Plan 096: edit nav-group fields (label, order, enabled) without
  // recreating it.
  app.patch('/nav-groups/:id', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const { id } = request.params as { id: string };
    const registry = repos.categories.load();
    const group = (registry.nav_groups ?? []).find((g) => g.id === id);
    if (!group) {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: `Nav group "${id}" not found` } });
    }

    const body = request.body as Record<string, unknown>;
    const allowed: Array<'display_name' | 'active' | 'sort_order'> = [
      'display_name',
      'active',
      'sort_order',
    ];
    const envelopeFields = new Set(['base_revision', 'command_id']);
    const unknown = Object.keys(body).filter(
      (k) => !allowed.includes(k as never) && !envelopeFields.has(k)
    );
    if (unknown.length > 0) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: `Unsupported field(s): ${unknown.join(', ')}` },
      });
    }
    if (body.display_name !== undefined) {
      group.display_name = body.display_name as { default?: string };
    }
    if (body.active !== undefined) group.active = body.active as boolean;
    if (body.sort_order !== undefined) group.sort_order = body.sort_order as number;

    const wrote = await repos.categories.write(registry, readBaseRevision(request.body));
    if (!wrote.ok) {
      return reply.status(wrote.statusCode).send({
        error: {
          code: wrote.statusCode === 409 ? 'CONFLICT' : 'INTERNAL_ERROR',
          message: wrote.error,
        },
      });
    }
    return { ...group, rev: wrote.rev };
  });

  app.delete('/nav-groups/:id', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const { id } = request.params as { id: string };
    const registry = repos.categories.load();
    const result = categoryService.removeNavGroup(registry, id);

    if (!result.ok) {
      // Plan 094: typed code from the service.
      return reply.status(result.code === 'NOT_FOUND' ? 404 : 409).send({
        error: { code: result.code ?? 'CONFLICT', message: result.error },
      });
    }

    const wrote = await repos.categories.write(registry, readBaseRevision(request.body));
    if (!wrote.ok) {
      return reply.status(wrote.statusCode).send({
        error: {
          code: wrote.statusCode === 409 ? 'CONFLICT' : 'INTERNAL_ERROR',
          message: wrote.error,
        },
      });
    }

    return reply.status(204).send();
  });

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

    const registry = repos.categories.load();
    const category = (registry.categories ?? []).find((c) => c.id === categoryId);
    if (!category) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Category "${categoryId}" not found` },
      });
    }

    if (!category.subcategories) {
      category.subcategories = [];
    }

    if (category.subcategories.some((s) => s.id === body.id)) {
      return reply.status(409).send({
        error: { code: 'CONFLICT', message: `Subcategory "${body.id}" already exists` },
      });
    }

    const subcategory: Subcategory = {
      id: body.id,
      title: body.title,
      product_key: body.product_key,
      slug: body.slug,
      description: body.description ?? '',
      order: body.order ?? category.subcategories.length * 10,
      enabled: body.enabled ?? true,
    };

    const result = subcategorySchema.safeParse(subcategory);
    if (!result.success) {
      return reply.status(400).send({
        error: {
          code: 'BAD_REQUEST',
          message: result.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    category.subcategories.push(result.data);
    category.subcategories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const wrote = await repos.categories.write(registry, readBaseRevision(request.body));
    if (!wrote.ok) {
      return reply.status(wrote.statusCode).send({
        error: {
          code: wrote.statusCode === 409 ? 'CONFLICT' : 'INTERNAL_ERROR',
          message: wrote.error,
        },
      });
    }

    return reply.status(201).send(result.data);
  });

  app.patch('/categories/:categoryId/subcategories/:subId', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const { categoryId, subId } = request.params as { categoryId: string; subId: string };
    const body = request.body as Record<string, unknown>;

    const registry = repos.categories.load();
    const category = (registry.categories ?? []).find((c) => c.id === categoryId);
    if (!category) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Category "${categoryId}" not found` },
      });
    }

    const subcategories = category.subcategories ?? [];
    const idx = subcategories.findIndex((s) => s.id === subId);
    if (idx === -1) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Subcategory "${subId}" not found` },
      });
    }

    const updated = { ...subcategories[idx], ...body };
    const result = subcategorySchema.safeParse(updated);
    if (!result.success) {
      return reply.status(400).send({
        error: {
          code: 'BAD_REQUEST',
          message: result.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    category.subcategories = subcategories.map((s) => (s.id === subId ? result.data : s));
    category.subcategories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const wrote = await repos.categories.write(registry, readBaseRevision(request.body));
    if (!wrote.ok) {
      return reply.status(wrote.statusCode).send({
        error: {
          code: wrote.statusCode === 409 ? 'CONFLICT' : 'INTERNAL_ERROR',
          message: wrote.error,
        },
      });
    }

    return result.data;
  });

  app.delete('/categories/:categoryId/subcategories/:subId', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const { categoryId, subId } = request.params as { categoryId: string; subId: string };

    const registry = repos.categories.load();
    const category = (registry.categories ?? []).find((c) => c.id === categoryId);
    if (!category) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Category "${categoryId}" not found` },
      });
    }

    const subcategories = category.subcategories ?? [];
    const before = subcategories.length;
    category.subcategories = subcategories.filter((s) => s.id !== subId);

    if (category.subcategories.length === before) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Subcategory "${subId}" not found` },
      });
    }

    const wrote = await repos.categories.write(registry, readBaseRevision(request.body));
    if (!wrote.ok) {
      return reply.status(wrote.statusCode).send({
        error: {
          code: wrote.statusCode === 409 ? 'CONFLICT' : 'INTERNAL_ERROR',
          message: wrote.error,
        },
      });
    }

    return reply.status(204).send();
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

    const registry = repos.categories.load();
    const category = (registry.categories ?? []).find((c) => c.id === categoryId);
    if (!category) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Category "${categoryId}" not found` },
      });
    }

    const subcategories = category.subcategories ?? [];
    for (let i = 0; i < orderedIds.length; i++) {
      const sub = subcategories.find((s) => s.id === orderedIds[i]);
      if (sub) {
        sub.order = i * 10;
      }
    }
    category.subcategories = subcategories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const wrote = await repos.categories.write(registry, readBaseRevision(request.body));
    if (!wrote.ok) {
      return reply.status(wrote.statusCode).send({
        error: {
          code: wrote.statusCode === 409 ? 'CONFLICT' : 'INTERNAL_ERROR',
          message: wrote.error,
        },
      });
    }

    return { status: 'ok', reordered: orderedIds.length, rev: wrote.rev };
  });
}
