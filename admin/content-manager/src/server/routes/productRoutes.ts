import type { FastifyInstance } from 'fastify';
import type { SyncService } from '../services/syncService.ts';
import { ProductService } from '../../domain/products/productService.ts';
import type { CommandEnvelope } from '../../shared/commands/envelope.ts';
import { discountPercent2 } from '../../shared/discount.ts';
import { parseBodyFilters, parseQueryFilters } from '../../shared/productFilters.ts';
import { relocateProductMedia, rollbackMediaRelocation } from '../services/mediaRelocation.ts';
import { requireWriteMode, type Repositories } from './helpers.ts';
import { runCatalogCommand } from './catalog-command.ts';
export async function productRoutes(
  app: FastifyInstance,
  repos: Repositories,
  productService: ProductService,
  syncService: SyncService | undefined,
  repoRoot: string
): Promise<void> {
  // Plan 088: bulk operations target either an explicit id list or every
  // product matching the same filters as GET /products (scope: 'all').
  function resolveBulkIds(body: { product_ids?: string[]; scope?: string; filters?: unknown }): {
    ids: string[];
    error?: { code: string; message: string };
  } {
    if (body.scope === 'all') {
      const all = repos.products.getAll(1, Number.MAX_SAFE_INTEGER, parseBodyFilters(body.filters));
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

  // Plan 172: bulk action/value allowlist — the service blind-casts otherwise,
  // so unknown actions silently no-op and non-finite values (NaN from a
  // cleared UI field, wrong types) corrupt the catalog on persist.
  const BULK_ACTIONS = [
    'set_discount_percent',
    'set_discount_fixed',
    'set_stock',
    'set_price_delta_percent',
    'set_category',
  ] as const;
  type BulkAction = (typeof BULK_ACTIONS)[number];

  function validateBulkInput(
    action: unknown,
    value: unknown
  ):
    | { ok: true; action: BulkAction; value: number | boolean | string }
    | { ok: false; message: string } {
    if (typeof action !== 'string' || !(BULK_ACTIONS as readonly string[]).includes(action)) {
      return { ok: false, message: `Unknown bulk action "${String(action)}"` };
    }
    const known = action as BulkAction;
    if (known === 'set_stock') {
      if (typeof value !== 'boolean') {
        return { ok: false, message: 'Bulk action set_stock requires a boolean value' };
      }
      return { ok: true, action: known, value };
    }
    if (known === 'set_category') {
      if (typeof value !== 'string' || value.trim() === '') {
        return { ok: false, message: 'Bulk action set_category requires a non-empty string value' };
      }
      return { ok: true, action: known, value };
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { ok: false, message: `Bulk action ${known} requires a finite numeric value` };
    }
    return { ok: true, action: known, value };
  }
  app.get('/products', async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const filters = parseQueryFilters(query);
    // Plan 221: the parser keeps query-shape semantics ('', clamps); invalid
    // numeric strings arrive as NaN, so the GET route keeps answering them
    // with an empty page (the export route inherits the same contract).
    if (filters.min_price !== undefined && !Number.isFinite(filters.min_price)) {
      return { page, limit, total: 0, items: [] };
    }
    if (filters.max_price !== undefined && !Number.isFinite(filters.max_price)) {
      return { page, limit, total: 0, items: [] };
    }
    if (
      (filters.min_discount !== undefined && !Number.isFinite(filters.min_discount)) ||
      (filters.max_discount !== undefined && !Number.isFinite(filters.max_discount))
    ) {
      return { page, limit, total: 0, items: [] };
    }

    const { items, total } = repos.products.getAll(page, limit, filters);

    return {
      page,
      limit,
      total,
      items: items.map((p) => ({
        ...p,
        discounted_price: Math.max(0, p.price - p.discount),
        discount_percentage: discountPercent2(p.price, p.discount),
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
      discount_percentage: discountPercent2(product.price, product.discount),
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

    let created: { product?: unknown; changedFields?: string[] } | undefined;

    return runCatalogCommand({
      repos,
      reply,
      commandId: envelope.command_id,
      successStatus: 201,
      apply: (catalog) => {
        const result = productService.create(catalog, envelope.payload);
        if (!result.ok) {
          return {
            ok: false,
            statusCode: result.statusCode,
            code: result.statusCode === 409 ? 'CONFLICT' : 'VALIDATION_ERROR',
            message: result.error ?? 'Validation failed',
          };
        }
        created = result;
        return { ok: true };
      },
      onSuccess: () => ({
        changed_fields: (created as { changedFields?: string[] })?.changedFields,
        product: (created as { product?: unknown })?.product,
      }),
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

    let previousCategory = '';
    let previousImagePath = '';
    let previousAvifPath = '';
    let editResult: { ok: true; product?: unknown; changedFields?: string[] } | undefined;

    return runCatalogCommand({
      repos,
      reply,
      commandId: envelope.command_id,
      apply: (catalog) => {
        const previous = catalog.products.find((p) => p.id === id);
        previousCategory = previous?.category ?? '';
        previousImagePath = previous?.image_path ?? '';
        previousAvifPath = previous?.image_avif_path ?? '';

        const result = productService.edit(catalog, {
          entityId: id,
          baseRevision: envelope.base_revision ?? 0,
          changes: envelope.payload ?? {},
        });

        if (!result.ok) {
          return {
            ok: false,
            statusCode: result.statusCode,
            code:
              result.statusCode === 409
                ? 'CONFLICT'
                : result.statusCode === 404
                  ? 'NOT_FOUND'
                  : 'VALIDATION_ERROR',
            message: result.error ?? 'Edit failed',
          };
        }

        editResult = result as { ok: true; product?: unknown; changedFields?: string[] };
        return { ok: true };
      },
      onSuccess: async (catalog) => {
        const typedResult = editResult as unknown as {
          product?: { category?: string; image_path?: string; image_avif_path?: string };
          changedFields?: string[];
        };
        // Plan 097: relocate media when the category changed — the image files
        // follow the product to assets/images/<newCategory>/. Any failure rolls
        // back the moves and keeps the ORIGINAL paths (the edit itself stands);
        // the moved paths are committed with a second revision-guarded write.
        const newCategory = typedResult?.product?.category ?? '';
        if (
          previousCategory &&
          newCategory &&
          previousCategory !== newCategory &&
          typedResult?.product
        ) {
          const reloc = await relocateProductMedia(
            repoRoot,
            typedResult.product as unknown as {
              image_path?: string;
              image_avif_path?: string;
            },
            {
              previousCategory,
              previousImagePath,
              previousAvifPath,
              newCategory,
            }
          );
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
                Object.assign(typedResult.product as object, target);
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
        const changedFields = typedResult?.changedFields ?? [];
        if (syncService && id && changedFields.length > 0 && typedResult?.product) {
          const productRecord = typedResult.product as unknown as Record<string, unknown>;
          syncService.enqueue(
            id,
            envelope.base_revision ?? 0,
            Object.fromEntries(changedFields.map((f) => [f, productRecord[f]])),
            productRecord
          );
        }

        return {
          changed_fields: typedResult?.changedFields,
          product: typedResult?.product,
        };
      },
    });
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

    let ops: Array<{
      id: string;
      baseRevision: number;
      changes: Record<string, unknown>;
    }> = [];
    let changedFields: string[][] = [];

    return runCatalogCommand({
      repos,
      reply,
      commandId: envelope.command_id,
      apply: (catalog) => {
        ops = [];
        const stale: string[] = [];
        for (const update of envelope.updates!) {
          const product = catalog.products.find(
            (pr) => pr.id === update.id || pr.sku === update.id
          );
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
          return {
            ok: false,
            statusCode: 409,
            code: 'CONFLICT',
            message: `Stale revisions for: ${stale.join(', ')}`,
            details: stale,
          };
        }

        changedFields = [];
        for (const op of ops) {
          const result = productService.edit(catalog, {
            entityId: op.id,
            baseRevision: op.baseRevision,
            changes: op.changes,
          });
          if (!result.ok) {
            return {
              ok: false,
              statusCode: result.statusCode,
              code:
                result.statusCode === 409
                  ? 'CONFLICT'
                  : result.statusCode === 404
                    ? 'NOT_FOUND'
                    : 'VALIDATION_ERROR',
              message: result.error ?? 'Edit failed',
            };
          }
          changedFields.push(result.changedFields ?? []);
        }

        return { ok: true };
      },
      onSuccess: () => ({
        applied: ops.length,
        changed_fields: changedFields.flat(),
      }),
    });
  });

  app.post('/products/reorder', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const body = request.body as { command_id?: string; ordered_ids?: string[] };
    if (!body?.command_id || !body?.ordered_ids || !Array.isArray(body.ordered_ids)) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Missing command_id or ordered_ids array' },
      });
    }

    let reorderedCount = 0;

    return runCatalogCommand({
      repos,
      reply,
      commandId: body.command_id,
      apply: (catalog) => {
        // Plan 088: reorder must cover the FULL catalog — a partial id list
        // (visible page under filters/pagination) would compact the visible
        // orders to 0..N and scramble the global order.
        if (body.ordered_ids!.length !== catalog.products.length) {
          return {
            ok: false,
            statusCode: 409,
            code: 'REORDER_SCOPE_AMBIGUOUS',
            message: `Reorder requires the full catalog (${catalog.products.length} products), got ${body.ordered_ids!.length}. Clear filters and pagination first.`,
          };
        }
        const uniqueIds = new Set(body.ordered_ids);
        if (uniqueIds.size !== body.ordered_ids!.length) {
          return {
            ok: false,
            statusCode: 400,
            code: 'BAD_REQUEST',
            message: 'ordered_ids contains duplicates',
          };
        }
        // Plan 173: length + duplicates is not enough — the id SET must equal
        // the catalog id set, or unknown ids are silently skipped while
        // missing products keep stale orders (duplicate `order` values, 200).
        const catalogIds = new Set(catalog.products.map((p) => p.id));
        if (catalog.products.some((p) => !p.id)) {
          return {
            ok: false,
            statusCode: 400,
            code: 'BAD_REQUEST',
            message:
              'Catalog contains products without ids — backfill stable ids before reordering',
          };
        }
        if (
          uniqueIds.size !== catalogIds.size ||
          ![...uniqueIds].every((id) => catalogIds.has(id))
        ) {
          return {
            ok: false,
            statusCode: 400,
            code: 'BAD_REQUEST',
            message: 'ordered_ids must contain exactly the catalog id set (unknown or missing ids)',
          };
        }

        const result = productService.reorder(catalog, body.ordered_ids!);
        if (!result.ok) {
          return {
            ok: false,
            statusCode: 400,
            code: 'BAD_REQUEST',
            message: result.error ?? 'Reorder failed',
          };
        }

        reorderedCount = result.reordered;
        return { ok: true };
      },
      onSuccess: () => ({
        reordered: reorderedCount,
      }),
    });
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

    const validated = validateBulkInput(body.action, body.value);
    if (!validated.ok) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: validated.message },
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
      action: validated.action,
      value: validated.value,
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

    const validated = validateBulkInput(body.action, body.value);
    if (!validated.ok) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: validated.message },
      });
    }

    const resolved = resolveBulkIds(body);
    if (resolved.error) {
      return reply.status(resolved.error.code === 'NO_MATCHES' ? 422 : 400).send({
        error: { code: resolved.error.code, message: resolved.error.message },
      });
    }

    let bulkResult: { changed: number; skipped: number; changes: unknown[] } | undefined;

    return runCatalogCommand({
      repos,
      reply,
      commandId: body.command_id,
      apply: (catalog) => {
        const result = productService.bulkApply(catalog, {
          action: validated.action,
          value: validated.value,
          product_ids: resolved.ids,
        });

        if (!result.ok) {
          return {
            ok: false,
            statusCode: 400,
            code: 'BAD_REQUEST',
            message: result.error ?? 'Bulk apply failed',
          };
        }

        bulkResult = result;
        return { ok: true };
      },
      onSuccess: () => ({
        changed: bulkResult!.changed,
        skipped: bulkResult!.skipped,
        changes: bulkResult!.changes,
      }),
    });
  });
}
