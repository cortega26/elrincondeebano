import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ProductRepository } from '../repositories/productRepository.ts';
import type { CategoryRepository } from '../repositories/categoryRepository.ts';
import type { StorefrontRepository } from '../repositories/storefrontRepository.ts';
import type { SyncService } from '../services/syncService.ts';
import { ProductService } from '../../domain/products/productService.ts';
import type { CommandEnvelope } from '../../shared/commands/envelope.ts';
import type { CategoryService } from '../../domain/categories/categoryService.ts';
import type { CreateCategoryInput } from '../../domain/categories/categoryService.ts';
import type { Subcategory } from '../../shared/schemas/category.ts';
import { subcategorySchema, navGroupRecordSchema } from '../../shared/schemas/category.ts';

// Plan 094: single write-mode guard — was copy-pasted into every mutation
// route (15 blocks with identical 403 semantics).
export function requireWriteMode(reply: FastifyReply, productService: ProductService): boolean {
  if (!productService.isEnabled) {
    reply
      .status(403)
      .send({ error: { code: 'FORBIDDEN', message: 'Write operations are disabled' } });
    return false;
  }
  return true;
}

export interface Repositories {
  products: ProductRepository;
  categories: CategoryRepository;
  storefront: StorefrontRepository;
}

export async function productRoutes(
  app: FastifyInstance,
  repos: Repositories,
  productService: ProductService,
  syncService?: SyncService
): Promise<void> {
  // Plan 088: bulk operations target either an explicit id list or every
  // product matching the same filters as GET /products (scope: 'all').
  type BulkFilters = {
    q?: string;
    category?: string;
    archived?: boolean;
    out_of_stock?: boolean;
    min_price?: number;
    max_price?: number;
    discounted_only?: boolean;
    min_discount?: number;
    max_discount?: number;
  };

  function parseBulkFilters(raw: unknown): BulkFilters {
    const f = (raw ?? {}) as Record<string, unknown>;
    const minPrice = f.min_price !== undefined ? Number(f.min_price) : undefined;
    const maxPrice = f.max_price !== undefined ? Number(f.max_price) : undefined;
    const minDiscount = f.min_discount !== undefined ? Number(f.min_discount) : undefined;
    const maxDiscount = f.max_discount !== undefined ? Number(f.max_discount) : undefined;
    return {
      q: typeof f.q === 'string' && f.q.trim() ? f.q.trim() : undefined,
      category: typeof f.category === 'string' && f.category.trim() ? f.category.trim() : undefined,
      archived: f.archived !== undefined ? f.archived === true : undefined,
      out_of_stock: f.out_of_stock !== undefined ? f.out_of_stock === true : undefined,
      min_price:
        minPrice !== undefined && Number.isFinite(minPrice) ? Math.max(0, minPrice) : undefined,
      max_price:
        maxPrice !== undefined && Number.isFinite(maxPrice) ? Math.max(0, maxPrice) : undefined,
      discounted_only: f.discounted_only !== undefined ? f.discounted_only === true : undefined,
      min_discount:
        minDiscount !== undefined && Number.isFinite(minDiscount)
          ? Math.min(100, Math.max(0, minDiscount))
          : undefined,
      max_discount:
        maxDiscount !== undefined && Number.isFinite(maxDiscount)
          ? Math.min(100, Math.max(0, maxDiscount))
          : undefined,
    };
  }

  function resolveBulkIds(body: { product_ids?: string[]; scope?: string; filters?: unknown }): {
    ids: string[];
    error?: { code: string; message: string };
  } {
    if (body.scope === 'all') {
      const all = repos.products.getAll(1, Number.MAX_SAFE_INTEGER, parseBulkFilters(body.filters));
      const ids = all.items.filter((p) => p.id).map((p) => p.id!);
      if (ids.length === 0) {
        return { ids: [], error: { code: 'NO_MATCHES', message: 'No products match the filters' } };
      }
      return { ids };
    }
    if (!body.product_ids?.length) {
      return {
        ids: [],
        error: { code: 'BAD_REQUEST', message: 'Missing product_ids or scope=all' },
      };
    }
    return { ids: body.product_ids };
  }
  app.get('/products', async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const q = query.q?.trim() || undefined;
    const category = query.category?.trim() || undefined;
    const archived = query.archived !== undefined ? query.archived === 'true' : undefined;
    const out_of_stock =
      query.out_of_stock !== undefined ? query.out_of_stock === 'true' : undefined;
    const min_price =
      query.min_price !== undefined && query.min_price !== ''
        ? Math.max(0, Number(query.min_price))
        : undefined;
    const max_price =
      query.max_price !== undefined && query.max_price !== ''
        ? Math.max(0, Number(query.max_price))
        : undefined;
    // Plan 091: discount filters (percent of price, 0–100).
    const discounted_only = query.discounted_only === 'true' ? true : undefined;
    const min_discount =
      query.min_discount !== undefined && query.min_discount !== ''
        ? Math.min(100, Math.max(0, Number(query.min_discount)))
        : undefined;
    const max_discount =
      query.max_discount !== undefined && query.max_discount !== ''
        ? Math.min(100, Math.max(0, Number(query.max_discount)))
        : undefined;
    if (min_price !== undefined && !Number.isFinite(min_price)) {
      return { page, limit, total: 0, items: [] };
    }
    if (max_price !== undefined && !Number.isFinite(max_price)) {
      return { page, limit, total: 0, items: [] };
    }
    if (
      (min_discount !== undefined && !Number.isFinite(min_discount)) ||
      (max_discount !== undefined && !Number.isFinite(max_discount))
    ) {
      return { page, limit, total: 0, items: [] };
    }

    const { items, total } = repos.products.getAll(page, limit, {
      q,
      category,
      archived,
      out_of_stock,
      min_price,
      max_price,
      discounted_only,
      min_discount,
      max_discount,
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
    if (!requireWriteMode(reply, productService)) return;

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
    if (!requireWriteMode(reply, productService)) return;

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

    // Plan 064: queue the edit for remote sync when enabled (offline edit
    // flow); the queue is idempotent and the adapter is configured or this
    // is a no-op.
    const changedFields = result.changedFields ?? [];
    if (syncService && id && changedFields.length > 0 && result.product) {
      const productRecord = result.product as unknown as Record<string, unknown>;
      syncService.enqueue(
        id,
        envelope.base_revision ?? 0,
        Object.fromEntries(changedFields.map((f) => [f, productRecord[f]])),
        productRecord
      );
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
    if (!requireWriteMode(reply, productService)) return;

    const body = request.body as { command_id?: string; ordered_ids?: string[] };
    if (!body?.command_id || !body?.ordered_ids || !Array.isArray(body.ordered_ids)) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Missing command_id or ordered_ids array' },
      });
    }

    const catalog = repos.products.loadCatalog();
    const baseRev = catalog.rev;

    // Plan 088: reorder must cover the FULL catalog — a partial id list
    // (visible page under filters/pagination) would compact the visible
    // orders to 0..N and scramble the global order.
    if (body.ordered_ids.length !== catalog.products.length) {
      return reply.status(409).send({
        error: {
          code: 'REORDER_SCOPE_AMBIGUOUS',
          message: `Reorder requires the full catalog (${catalog.products.length} products), got ${body.ordered_ids.length}. Clear filters and pagination first.`,
        },
      });
    }
    const uniqueIds = new Set(body.ordered_ids);
    if (uniqueIds.size !== body.ordered_ids.length) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'ordered_ids contains duplicates' },
      });
    }

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
    if (!requireWriteMode(reply, productService)) return;

    const body = request.body as {
      command_id?: string;
      action?: string;
      value?: number | boolean | string;
      product_ids?: string[];
      scope?: string;
      filters?: unknown;
    };

    if (!body?.command_id || !body?.action) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Missing command_id or action' },
      });
    }

    const resolved = resolveBulkIds(body);
    if (resolved.error) {
      return reply.status(resolved.error.code === 'NO_MATCHES' ? 422 : 400).send({
        error: { code: resolved.error.code, message: resolved.error.message },
      });
    }

    const catalog = repos.products.loadCatalog();
    const result = productService.bulkPreview(catalog, {
      action: body.action as 'set_discount_percent',
      value: body.value as number,
      product_ids: resolved.ids,
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
    if (!requireWriteMode(reply, productService)) return;

    const body = request.body as {
      command_id?: string;
      action?: string;
      value?: number | boolean | string;
      product_ids?: string[];
      scope?: string;
      filters?: unknown;
    };

    if (!body?.command_id || !body?.action) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Missing command_id or action' },
      });
    }

    const resolved = resolveBulkIds(body);
    if (resolved.error) {
      return reply.status(resolved.error.code === 'NO_MATCHES' ? 422 : 400).send({
        error: { code: resolved.error.code, message: resolved.error.message },
      });
    }

    const catalog = repos.products.loadCatalog();
    const baseRev = catalog.rev;

    const result = productService.bulkApply(catalog, {
      action: body.action as 'set_discount_percent',
      value: body.value as number,
      product_ids: resolved.ids,
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

    return { ...result.category, rev: wrote.rev };
  });

  app.delete('/categories/:id', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const { id } = request.params as { id: string };
    const registry = repos.categories.load();

    // Cross-file check: count products using this category
    const productUsage = repos.products
      .getAll(1, 200)
      .items.filter((p) => p.category === id).length;

    const result = categoryService.remove(registry, id, productUsage);
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
