import type { CreateCategoryInput } from '../../domain/categories/categoryService.ts';
import { categoryRecordSchema } from '../../shared/schemas/category.ts';
import { requireWriteMode } from './helpers.ts';
import { runRegistryCommand } from './catalog-command.ts';
import {
  type CategoryRouteContext,
  readBaseRevision,
  scheduleCategoryOg,
} from './categories-common.ts';

// Plan 198: category CRUD slice of categoryRoutes (move-only split).
export async function registerCategoryCrudRoutes({
  app,
  repos,
  productService,
  categoryService,
  repoRoot,
}: CategoryRouteContext): Promise<void> {
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

    const body = request.body as CreateCategoryInput;

    if (!body?.id || !body?.key || !body?.slug) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Missing id, key, or slug' },
      });
    }

    return runRegistryCommand({
      reply,
      load: () => repos.categories.load(),
      getBaseRevision: () => readBaseRevision(request.body),
      successStatus: 201,
      apply: (registry) => {
        const result = categoryService.create(registry, body);
        if (!result.ok) {
          return {
            ok: false,
            statusCode: 409,
            code: 'CONFLICT',
            message: result.error ?? 'Category create failed',
          };
        }
        return { ok: true, data: result.category };
      },
      write: (registry, baseRevision) => repos.categories.write(registry, baseRevision),
      onSuccess: (_registry, data, writeRev) => {
        const category = (data ?? {}) as { slug?: string; key?: string };
        scheduleCategoryOg(repoRoot, category.slug || category.key, 'generate');
        return {
          ...(data as Record<string, unknown>),
          rev: writeRev,
          resulting_revision: writeRev,
        };
      },
    });
  });

  app.patch('/categories/:id', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const { id } = request.params as { id: string };

    return runRegistryCommand({
      reply,
      load: () => repos.categories.load(),
      getBaseRevision: () => readBaseRevision(request.body),
      apply: (registry) => {
        const result = categoryService.edit(registry, id, request.body ?? {});
        if (!result.ok) {
          // Plan 094: typed code from the service — never string-match messages.
          const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'CONFLICT' ? 409 : 422;
          return {
            ok: false,
            statusCode: status,
            code: result.code ?? 'VALIDATION_ERROR',
            message: result.error ?? 'Category operation failed',
          };
        }
        return { ok: true, data: result.category };
      },
      write: (registry, baseRevision) => repos.categories.write(registry, baseRevision),
      onSuccess: (_registry, data, writeRev) => {
        const category = (data ?? {}) as { slug?: string; key?: string };
        scheduleCategoryOg(repoRoot, category.slug || category.key, 'generate');
        return {
          ...(data as Record<string, unknown>),
          rev: writeRev,
          resulting_revision: writeRev,
        };
      },
    });
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

    return runRegistryCommand({
      reply,
      load: () => repos.categories.load(),
      getBaseRevision: () => readBaseRevision(request.body),
      successStatus: 200,
      apply: (freshRegistry) => {
        const result = categoryService.remove(freshRegistry, id, 0);
        if (!result.ok) {
          // Plan 094: typed code from the service.
          return {
            ok: false,
            statusCode: result.code === 'NOT_FOUND' ? 404 : 409,
            code: result.code ?? 'CONFLICT',
            message: result.error ?? 'Category operation failed',
          };
        }
        return { ok: true };
      },
      write: (freshRegistry, baseRevision) => repos.categories.write(freshRegistry, baseRevision),
      onSuccess: (_registry, _data, writeRev) => {
        scheduleCategoryOg(repoRoot, id, 'delete');
        return { status: 'deleted', reassigned: usage.length, resulting_revision: writeRev };
      },
    });
  });

  // Plan 127 F2.1: batch category operations for undo/redo — upsert or
  // delete records under ONE registry write with a single revision guard
  // (mirrors the product batch-update endpoint, plan 121). All ops are
  // validated before anything mutates; all-or-nothing.
  app.post('/categories/batch-update', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const envelope = request.body as {
      command_id?: string;
      base_revision?: number;
      ops?: Array<{ type: 'upsert' | 'delete'; category?: unknown }>;
    };
    if (!envelope?.command_id || !Array.isArray(envelope.ops) || envelope.ops.length === 0) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Missing command_id or ops array' },
      });
    }

    const registry = repos.categories.load();
    // Batch delete is strict: no reassign_to in batch. Undo-of-create on an
    // in-use category is intentionally rejected — the operator must unassign
    // products first (or use the single DELETE with reassign_to).
    const catalog = repos.products.loadCatalog();

    // Validate every op first.
    const parsedOps: Array<{ type: 'upsert' | 'delete'; category?: unknown }> = [];
    for (const op of envelope.ops) {
      if (op.type === 'upsert') {
        const parsed = categoryRecordSchema.safeParse(op.category);
        if (!parsed.success) {
          return reply.status(422).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: parsed.error.issues.map((i) => i.message).join('; '),
            },
          });
        }
        parsedOps.push({ type: 'upsert', category: parsed.data });
      } else if (op.type === 'delete') {
        const id = (op.category as { id?: string } | undefined)?.id;
        if (!id || !registry.categories?.some((c) => c.id === id)) {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message: `Category "${id ?? ''}" not found` },
          });
        }
        const usage = catalog.products.filter((p) => p.category === id);
        if (usage.length > 0) {
          return reply.status(409).send({
            error: {
              code: 'CATEGORY_IN_USE',
              message: `La categoría está en uso por ${usage.length} productos. Reasigna o borra primero.`,
            },
          });
        }
        parsedOps.push({ type: 'delete', category: op.category });
      } else {
        return reply.status(422).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: `Unknown op type: ${String((op as { type?: string }).type)}`,
          },
        });
      }
    }

    // Apply.
    const applyBatch = (
      registry: Parameters<typeof categoryService.upsert>[0]
    ): { ok: true } | { ok: false; statusCode: number; code: string; message: string } => {
      for (const op of parsedOps) {
        if (op.type === 'upsert') {
          const result = categoryService.upsert(registry, op.category as never);
          if (!result.ok) {
            return {
              ok: false,
              statusCode: result.code === 'NOT_FOUND' ? 404 : 409,
              code: result.code ?? 'CONFLICT',
              message: result.error ?? 'Category operation failed',
            };
          }
        } else {
          const id = (op.category as { id: string }).id;
          const result = categoryService.remove(registry, id, 0);
          if (!result.ok) {
            return {
              ok: false,
              statusCode: result.code === 'NOT_FOUND' ? 404 : 409,
              code: result.code ?? 'CONFLICT',
              message: result.error ?? 'Category operation failed',
            };
          }
        }
      }
      return { ok: true };
    };

    return runRegistryCommand({
      reply,
      load: () => repos.categories.load(),
      getBaseRevision: () => readBaseRevision(envelope),
      apply: applyBatch,
      write: (freshRegistry, baseRevision) => repos.categories.write(freshRegistry, baseRevision),
      onSuccess: (_registry, _data, writeRev) => ({
        command_id: envelope.command_id,
        status: 'ok',
        applied: parsedOps.length,
        resulting_revision: writeRev,
      }),
    });
  });

  app.post('/categories/reorder', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const body = request.body as { ordered_ids?: string[] };
    if (!body?.ordered_ids?.length) {
      return reply
        .status(400)
        .send({ error: { code: 'BAD_REQUEST', message: 'Missing ordered_ids' } });
    }
    const orderedIds = body.ordered_ids;

    return runRegistryCommand({
      reply,
      load: () => repos.categories.load(),
      getBaseRevision: () => readBaseRevision(body),
      apply: (registry) => {
        categoryService.reorder(registry, orderedIds);
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
