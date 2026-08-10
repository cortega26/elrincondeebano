import type { FastifyInstance } from 'fastify';
import type { ProductRepository } from '../repositories/productRepository.ts';
import type { CategoryRepository } from '../repositories/categoryRepository.ts';
import type { StorefrontRepository } from '../repositories/storefrontRepository.ts';
import { ProductService } from '../../domain/products/productService.ts';
import type { CommandEnvelope } from '../../shared/commands/envelope.ts';
import type { CategoryService } from '../../domain/categories/categoryService.ts';
import type { CreateCategoryInput } from '../../domain/categories/categoryService.ts';
import type { Subcategory } from '../../shared/schemas/category.ts';
import { subcategorySchema, navGroupRecordSchema } from '../../shared/schemas/category.ts';

export interface Repositories {
  products: ProductRepository;
  categories: CategoryRepository;
  storefront: StorefrontRepository;
}

export async function productRoutes(
  app: FastifyInstance,
  repos: Repositories,
  productService: ProductService
): Promise<void> {
  app.get('/products', async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const q = query.q?.trim() || undefined;
    const category = query.category?.trim() || undefined;
    const archived = query.archived !== undefined ? query.archived === 'true' : undefined;
    const out_of_stock =
      query.out_of_stock !== undefined ? query.out_of_stock === 'true' : undefined;

    const { items, total } = repos.products.getAll(page, limit, {
      q,
      category,
      archived,
      out_of_stock,
    });

    return {
      page,
      limit,
      total,
      items: items.map((p) => ({
        ...p,
        discounted_price: Math.max(0, p.price - p.discount),
        discount_percentage: p.price > 0 ? Math.round((p.discount / p.price) * 10000) / 100 : 0,
      })),
    };
  });

  app.get('/products/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const product = repos.products.getById(id);

    if (!product) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Product "${id}" not found` },
      });
    }

    return {
      ...product,
      discounted_price: Math.max(0, product.price - product.discount),
      discount_percentage:
        product.price > 0 ? Math.round((product.discount / product.price) * 10000) / 100 : 0,
    };
  });

  app.get('/products/revision', async () => {
    return repos.products.getRevision();
  });

  app.post('/products', async (request, reply) => {
    if (!productService.isEnabled) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Write operations are disabled' },
      });
    }

    const envelope = request.body as CommandEnvelope<{
      name: string;
      description?: string;
      price: number;
      discount?: number;
      stock?: boolean;
      category?: string;
      image_path?: string;
      image_avif_path?: string;
    }>;

    if (!envelope?.command_id || !envelope?.payload) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Missing command_id or payload' },
      });
    }

    const catalog = repos.products.loadCatalog();
    const baseRev = catalog.rev;

    const result = productService.create(catalog, envelope.payload);

    if (!result.ok) {
      return reply.status(result.statusCode).send({
        error: {
          code: result.statusCode === 409 ? 'CONFLICT' : 'VALIDATION_ERROR',
          message: result.error,
        },
      });
    }

    const writeResult = await repos.products.writeCatalog(catalog, envelope.command_id, baseRev);

    if (!writeResult.ok) {
      return reply.status(writeResult.statusCode).send({
        error: { code: 'CONFLICT', message: writeResult.error },
      });
    }

    return reply.status(201).send({
      command_id: envelope.command_id,
      status: 'ok',
      resulting_revision: catalog.rev,
      changed_fields: result.changedFields,
      product: result.product,
    });
  });

  app.patch('/products/:id', async (request, reply) => {
    if (!productService.isEnabled) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Write operations are disabled' },
      });
    }

    const { id } = request.params as { id: string };
    const envelope = request.body as CommandEnvelope<{
      name?: string;
      description?: string;
      price?: number;
      discount?: number;
      stock?: boolean;
      category?: string;
      image_path?: string;
      image_avif_path?: string;
      is_archived?: boolean;
    }>;

    if (!envelope?.command_id) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Missing command_id' },
      });
    }

    const catalog = repos.products.loadCatalog();
    const baseRev = catalog.rev;

    const result = productService.edit(catalog, {
      entityId: id,
      baseRevision: envelope.base_revision ?? 0,
      changes: envelope.payload ?? {},
    });

    if (!result.ok) {
      return reply.status(result.statusCode).send({
        error: {
          code:
            result.statusCode === 409
              ? 'CONFLICT'
              : result.statusCode === 404
                ? 'NOT_FOUND'
                : 'VALIDATION_ERROR',
          message: result.error,
        },
      });
    }

    const writeResult = await repos.products.writeCatalog(catalog, envelope.command_id, baseRev);

    if (!writeResult.ok) {
      return reply.status(writeResult.statusCode).send({
        error: { code: 'CONFLICT', message: writeResult.error },
      });
    }

    return {
      command_id: envelope.command_id,
      status: 'ok',
      resulting_revision: catalog.rev,
      changed_fields: result.changedFields,
      product: result.product,
    };
  });

  app.post('/products/reorder', async (request, reply) => {
    if (!productService.isEnabled) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Write operations are disabled' },
      });
    }

    const body = request.body as { command_id?: string; ordered_ids?: string[] };
    if (!body?.command_id || !body?.ordered_ids || !Array.isArray(body.ordered_ids)) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Missing command_id or ordered_ids array' },
      });
    }

    const catalog = repos.products.loadCatalog();
    const baseRev = catalog.rev;

    const result = productService.reorder(catalog, body.ordered_ids);
    if (!result.ok) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: result.error },
      });
    }

    const writeResult = await repos.products.writeCatalog(catalog, body.command_id, baseRev);
    if (!writeResult.ok) {
      return reply.status(writeResult.statusCode).send({
        error: { code: 'CONFLICT', message: writeResult.error },
      });
    }

    return {
      command_id: body.command_id,
      status: 'ok',
      resulting_revision: catalog.rev,
      reordered: result.reordered,
    };
  });

  app.post('/products/bulk/preview', async (request, reply) => {
    if (!productService.isEnabled) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Write operations are disabled' },
      });
    }

    const body = request.body as {
      command_id?: string;
      action?: string;
      value?: number | boolean | string;
      product_ids?: string[];
    };

    if (!body?.command_id || !body?.action || !body?.product_ids?.length) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Missing command_id, action, or product_ids' },
      });
    }

    const catalog = repos.products.loadCatalog();
    const result = productService.bulkPreview(catalog, {
      action: body.action as 'set_discount_percent',
      value: body.value as number,
      product_ids: body.product_ids,
    });

    if (!result.ok) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: result.error },
      });
    }

    return {
      command_id: body.command_id,
      status: 'ok',
      action: body.action,
      changes: result.changes,
      total_changes: result.changes.length,
    };
  });

  app.post('/products/bulk/apply', async (request, reply) => {
    if (!productService.isEnabled) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Write operations are disabled' },
      });
    }

    const body = request.body as {
      command_id?: string;
      action?: string;
      value?: number | boolean | string;
      product_ids?: string[];
    };

    if (!body?.command_id || !body?.action || !body?.product_ids?.length) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Missing command_id, action, or product_ids' },
      });
    }

    const catalog = repos.products.loadCatalog();
    const baseRev = catalog.rev;

    const result = productService.bulkApply(catalog, {
      action: body.action as 'set_discount_percent',
      value: body.value as number,
      product_ids: body.product_ids,
    });

    if (!result.ok) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: result.error },
      });
    }

    const writeResult = await repos.products.writeCatalog(catalog, body.command_id, baseRev);
    if (!writeResult.ok) {
      return reply.status(writeResult.statusCode).send({
        error: { code: 'CONFLICT', message: writeResult.error },
      });
    }

    return {
      command_id: body.command_id,
      status: 'ok',
      resulting_revision: catalog.rev,
      changed: result.changed,
      changes: result.changes,
    };
  });
}

export async function categoryRoutes(
  app: FastifyInstance,
  repos: Repositories,
  productService: ProductService,
  categoryService: CategoryService
): Promise<void> {
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
    if (!productService.isEnabled) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Write operations are disabled' },
      });
    }

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

    return reply.status(201).send({ ...result.category, rev: wrote.rev });
  });

  app.patch('/categories/:id', async (request, reply) => {
    if (!productService.isEnabled) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Write operations are disabled' },
      });
    }

    const { id } = request.params as { id: string };
    const registry = repos.categories.load();
    const result = categoryService.edit(registry, id, request.body ?? {});

    if (!result.ok) {
      const code = result.error?.includes('not found') ? 'NOT_FOUND' : 'CONFLICT';
      return reply.status(code === 'NOT_FOUND' ? 404 : 409).send({
        error: { code, message: result.error },
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

    return { ...result.category, rev: wrote.rev };
  });

  app.delete('/categories/:id', async (request, reply) => {
    if (!productService.isEnabled) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Write operations are disabled' },
      });
    }

    const { id } = request.params as { id: string };
    const registry = repos.categories.load();

    // Cross-file check: count products using this category
    const productUsage = repos.products
      .getAll(1, 200)
      .items.filter((p) => p.category === id).length;

    const result = categoryService.remove(registry, id, productUsage);
    if (!result.ok) {
      const code = result.error?.includes('in use') ? 'CONFLICT' : 'NOT_FOUND';
      return reply
        .status(code === 'CONFLICT' ? 409 : 404)
        .send({ error: { code, message: result.error } });
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

  app.post('/categories/reorder', async (request, reply) => {
    if (!productService.isEnabled) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Write operations are disabled' },
      });
    }

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
    if (!productService.isEnabled) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Write operations are disabled' },
      });
    }

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

  app.delete('/nav-groups/:id', async (request, reply) => {
    if (!productService.isEnabled) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Write operations are disabled' },
      });
    }

    const { id } = request.params as { id: string };
    const registry = repos.categories.load();
    const result = categoryService.removeNavGroup(registry, id);

    if (!result.ok) {
      const code = result.error?.includes('has') ? 'CONFLICT' : 'NOT_FOUND';
      return reply
        .status(code === 'CONFLICT' ? 409 : 404)
        .send({ error: { code, message: result.error } });
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
    if (!productService.isEnabled) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Write operations are disabled' },
      });
    }

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
    if (!productService.isEnabled) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Write operations are disabled' },
      });
    }

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
    if (!productService.isEnabled) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Write operations are disabled' },
      });
    }

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
    if (!productService.isEnabled) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Write operations are disabled' },
      });
    }

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

export async function storefrontRoutes(app: FastifyInstance, repos: Repositories): Promise<void> {
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
}
