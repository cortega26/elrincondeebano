import type { FastifyInstance } from 'fastify';
import type { SyncService } from '../services/syncService.ts';
import { ProductService } from '../../domain/products/productService.ts';
import type { CommandEnvelope } from '../../shared/commands/envelope.ts';
import { relocateProductMedia, rollbackMediaRelocation } from '../services/mediaRelocation.ts';
import { requireWriteMode, type Repositories } from './helpers.ts';
export async function productRoutes(
  app: FastifyInstance,
  repos: Repositories,
  productService: ProductService,
  syncService: SyncService | undefined,
  repoRoot: string
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

    // Plan 097: media relocation — capture the previous category before the
    // edit so image files can follow the product to its new subdirectory.
    const previous = catalog.products.find((p) => p.id === id);
    const previousCategory = previous?.category ?? '';
    const previousImagePath = previous?.image_path ?? '';
    const previousAvifPath = previous?.image_avif_path ?? '';

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

    // Plan 097: relocate media when the category changed — the image files
    // follow the product to assets/images/<newCategory>/. Any failure rolls
    // back the moves and keeps the ORIGINAL paths (the edit itself stands);
    // the moved paths are committed with a second revision-guarded write.
    const newCategory = result.product?.category ?? '';
    if (previousCategory && newCategory && previousCategory !== newCategory && result.product) {
      const reloc = await relocateProductMedia(repoRoot, result.product, {
        previousCategory,
        previousImagePath,
        previousAvifPath,
        newCategory,
      });
      if (reloc.moved.length > 0) {
        const updated = JSON.parse(JSON.stringify(catalog));
        const target = updated.products.find(
          (p: { id?: string; sku?: string }) => p.id === id || p.sku === id
        );
        if (target) {
          target.image_path = reloc.newImagePath;
          target.image_avif_path = reloc.newAvifPath;
          updated.rev += 1;
          updated.last_updated = new Date().toISOString();
          const baseAfterReloc = updated.rev - 1;
          const secondWrite = await repos.products.writeCatalog(
            updated,
            `${envelope.command_id}-reloc`,
            baseAfterReloc
          );
          if (secondWrite.ok) {
            Object.assign(result.product, target);
          } else {
            rollbackMediaRelocation(reloc.moved);
          }
        } else {
          rollbackMediaRelocation(reloc.moved);
        }
      }
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

  // Plan 121: batch update — undo/redo applies many per-product patches in
  // ONE catalog write (was N sequential full-catalog rewrites). All ops are
  // validated against fresh state before anything mutates; the whole batch
  // commits under a single revision guard (all-or-nothing).
  app.post('/products/batch-update', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const envelope = request.body as {
      command_id?: string;
      updates?: Array<{ id: string; rev: number; patch: Record<string, unknown> }>;
    };
    if (
      !envelope?.command_id ||
      !Array.isArray(envelope.updates) ||
      envelope.updates.length === 0
    ) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Missing command_id or updates array' },
      });
    }

    const catalog = repos.products.loadCatalog();
    const baseRev = catalog.rev;

    // Validate every op first (prospective check per product, plan 100/121):
    // a stale rev aborts the whole batch with the offending ids listed.
    const ops: Array<{
      id: string;
      baseRevision: number;
      changes: Record<string, unknown>;
    }> = [];
    const stale: string[] = [];
    for (const update of envelope.updates) {
      const product = catalog.products.find((pr) => pr.id === update.id || pr.sku === update.id);
      if (!product) {
        stale.push(`${update.id}:NOT_FOUND`);
        continue;
      }
      if (product.rev !== update.rev) {
        stale.push(`${update.id}:stale`);
        continue;
      }
      ops.push({ id: update.id, baseRevision: update.rev, changes: update.patch ?? {} });
    }
    if (stale.length > 0) {
      return reply.status(409).send({
        error: {
          code: 'CONFLICT',
          message: `Stale revisions for: ${stale.join(', ')}`,
          details: stale,
        },
      });
    }

    const changedFields: string[][] = [];
    for (const op of ops) {
      const result = productService.edit(catalog, {
        entityId: op.id,
        baseRevision: op.baseRevision,
        changes: op.changes,
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
      changedFields.push(result.changedFields ?? []);
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
      applied: ops.length,
      changed_fields: changedFields.flat(),
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
