import type { FastifyInstance } from 'fastify';
import type { Repositories } from './catalog.ts';
import { ChangeSetRepository } from '../repositories/changeSetRepository.ts';
import { changeSetSchema, generateChangeSetId } from '../../shared/schemas/changeSet.ts';
import { productSchema } from '../../shared/schemas/product.ts';
import { isSafeId } from '../../shared/identity.ts';

export async function changesRoutes(
  app: FastifyInstance,
  repos: Repositories,
  changeSets: ChangeSetRepository,
  _repoRoot: string
): Promise<void> {
  app.get('/change-sets', async () => {
    return { items: changeSets.listAll() };
  });

  app.post('/change-sets', async (request, reply) => {
    const id = generateChangeSetId();
    const now = new Date().toISOString();

    const cs = {
      id,
      status: 'draft' as const,
      created_at: now,
      updated_at: now,
      product_ops: (request.body as Record<string, unknown>)?.product_ops ?? [],
      category_ops: (request.body as Record<string, unknown>)?.category_ops ?? [],
      validation_evidence: null,
      publication_result: null,
    };

    const result = changeSetSchema.safeParse(cs);
    if (!result.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: result.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    changeSets.save(result.data);
    return reply.status(201).send(result.data);
  });

  app.patch('/change-sets/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!isSafeId(id)) {
      return reply.status(400).send({
        error: { code: 'INVALID_ID', message: `Invalid change-set id "${id}"` },
      });
    }
    const existing = changeSets.load(id);
    if (!existing) {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Change set not found' } });
    }

    const body = request.body as Record<string, unknown>;
    const updated = {
      ...existing,
      ...body,
      updated_at: new Date().toISOString(),
    };

    const result = changeSetSchema.safeParse(updated);
    if (!result.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: result.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    changeSets.save(result.data);
    return result.data;
  });

  app.post('/change-sets/:id/discard', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!isSafeId(id)) {
      return reply.status(400).send({
        error: { code: 'INVALID_ID', message: `Invalid change-set id "${id}"` },
      });
    }
    const existing = changeSets.load(id);
    if (!existing) {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Change set not found' } });
    }

    if (existing.status === 'published') {
      return reply.status(409).send({
        error: { code: 'CONFLICT', message: 'Cannot discard a published change set' },
      });
    }

    existing.status = 'discarded';
    existing.updated_at = new Date().toISOString();
    changeSets.save(existing);
    return { status: 'discarded' };
  });

  app.get('/export', async () => {
    const catalog = repos.products.loadCatalog();
    return catalog;
  });

  app.post('/import/preview', async (request, reply) => {
    try {
      const body = request.body as Record<string, unknown>;
      const products = body?.products ?? (body as unknown);

      if (!Array.isArray(products)) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: "Expected a JSON object with 'products' array" },
        });
      }

      interface Conflict {
        product_name: string;
        product_id: string;
        field: string;
        local_value: unknown;
        incoming_value: unknown;
        resolved: boolean;
        resolution: null | 'keep_local' | 'use_incoming';
      }

      const conflicts: Conflict[] = [];
      const newProducts: Array<Record<string, unknown>> = [];
      // Full parsed incoming object per conflicted product, keyed by the
      // matched existing product's id. The client needs this to build a
      // schema-valid apply payload — individual diff rows only carry one
      // field each, and productSchema requires the whole object.
      const incomingById: Record<string, Record<string, unknown>> = {};

      const existingProducts = repos.products.loadCatalog().products;
      const existingMap = new Map<string, (typeof existingProducts)[0]>();
      const byId = new Map<string, (typeof existingProducts)[0]>();

      for (const p of existingProducts) {
        if (p.id) byId.set(p.id, p);
        const key = `${p.name}::${p.description}`;
        existingMap.set(key, p);
      }

      for (const incoming of products as Array<Record<string, unknown>>) {
        const result = productSchema.safeParse(incoming);
        if (!result.success) {
          conflicts.push({
            product_name: String(incoming.name ?? '?'),
            product_id: String(incoming.id ?? '?'),
            field: 'validation',
            local_value: null,
            incoming_value: result.error.issues.map((i) => i.message).join('; '),
            resolved: false,
            resolution: null,
          });
          continue;
        }

        const p = result.data;
        const existing =
          (p.id ? byId.get(p.id) : undefined) ?? existingMap.get(`${p.name}::${p.description}`);

        if (existing) {
          const diffs: Array<{ field: string; local_value: unknown; incoming_value: unknown }> = [];
          const compareFields = [
            'name',
            'description',
            'price',
            'discount',
            'stock',
            'category',
            'image_path',
            'image_avif_path',
            'is_archived',
          ] as const;
          for (const key of compareFields) {
            if (p[key] !== existing[key]) {
              diffs.push({ field: key, local_value: existing[key], incoming_value: p[key] });
            }
          }
          if (diffs.length > 0) {
            incomingById[existing.id ?? ''] = p;
            for (const diff of diffs) {
              conflicts.push({
                product_name: existing.name,
                product_id: existing.id ?? '',
                field: diff.field,
                local_value: diff.local_value,
                incoming_value: diff.incoming_value,
                resolved: false,
                resolution: null,
              });
            }
          }
        } else {
          newProducts.push(p);
        }
      }

      return {
        conflicts,
        no_conflicts: newProducts.length,
        total_conflicts: conflicts.length,
        new_products: newProducts,
        incoming_by_id: incomingById,
      };
    } catch (err) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: (err as Error).message },
      });
    }
  });

  app.post('/import/apply', async (request, reply) => {
    try {
      const body = request.body as Record<string, unknown>;
      const products = (body?.products ?? []) as Array<Record<string, unknown>>;
      const resolutions = (body?.resolutions ?? []) as Array<{
        product_id: string;
        field: string;
        resolution: 'local' | 'incoming';
      }>;

      if (!Array.isArray(products) || products.length === 0) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: "Expected non-empty 'products' array" },
        });
      }

      const resolutionMap = new Map<string, Set<string>>();
      for (const r of resolutions) {
        const key = r.product_id;
        if (!resolutionMap.has(key)) resolutionMap.set(key, new Set());
        resolutionMap.get(key)!.add(r.field);
      }

      const isSkipped = (product_id: string, field: string): boolean => {
        const fields = resolutionMap.get(product_id);
        if (!fields) return false;
        return !fields.has(field);
      };

      const catalog = repos.products.loadCatalog();
      const baseRev = catalog.rev;
      let applied = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const incoming of products) {
        const result = productSchema.safeParse(incoming);
        if (!result.success) {
          errors.push(
            `${String(incoming.name ?? '?')}: ${result.error.issues.map((i) => i.message).join('; ')}`
          );
          continue;
        }

        const p = result.data;
        const existing = p.id
          ? catalog.products.find((e) => e.id === p.id)
          : catalog.products.find(
              (e) => `${e.name}::${e.description}` === `${p.name}::${p.description}`
            );

        if (existing) {
          if (resolutions.length > 0) {
            let hasIncoming = false;
            const fields = [
              'name',
              'description',
              'price',
              'discount',
              'stock',
              'category',
              'image_path',
              'image_avif_path',
              'is_archived',
            ] as const;
            for (const field of fields) {
              if (p[field] !== existing[field]) {
                if (isSkipped(existing.id ?? '', field)) {
                  skipped += 1;
                } else {
                  (existing as Record<string, unknown>)[field] = p[field];
                  hasIncoming = true;
                  applied += 1;
                }
              }
            }
            if (hasIncoming) {
              existing.rev += 1;
            } else {
              skipped += 1;
            }
          } else {
            Object.assign(existing, p);
            existing.rev += 1;
            applied += 1;
          }
        } else {
          catalog.products.push({
            ...p,
            id: p.id ?? `imported-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          });
          applied += 1;
        }
      }

      catalog.rev += 1;
      catalog.last_updated = new Date().toISOString();

      const writeResult = await repos.products.writeCatalog(
        catalog,
        `import-${Date.now()}`,
        baseRev
      );
      if (!writeResult.ok) {
        return reply.status(writeResult.statusCode).send({
          error: { code: 'CONFLICT', message: writeResult.error },
        });
      }

      return {
        status: 'ok',
        applied,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
        resulting_revision: catalog.rev,
      };
    } catch (err) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: (err as Error).message },
      });
    }
  });

  app.post('/diff', async (request, reply) => {
    try {
      const body = request.body as {
        before?: Record<string, unknown>;
        after?: Record<string, unknown>;
      };
      const current = repos.products.loadCatalog();

      const before = (body?.before?.products ?? []) as Array<Record<string, unknown>>;
      const after = (body?.after?.products ?? current.products) as Array<Record<string, unknown>>;

      interface DiffEntry {
        field: string;
        old: unknown;
        new: unknown;
        productName?: string;
      }

      const productDiffs: DiffEntry[] = [];
      const beforeMap = new Map<string, Record<string, unknown>>();
      for (const p of before) {
        const id = (p.id ?? p.name) as string;
        if (id) beforeMap.set(id, p);
      }

      const compareFields = [
        'name',
        'description',
        'price',
        'discount',
        'stock',
        'category',
        'image_path',
        'image_avif_path',
        'is_archived',
      ];
      for (const p of after) {
        const id = (p.id ?? p.name) as string;
        const old = id ? beforeMap.get(id) : undefined;
        if (old) {
          const productName = (p.name ?? old.name ?? '') as string;
          for (const field of compareFields) {
            if (p[field] !== old[field]) {
              productDiffs.push({
                field,
                old: old[field],
                new: p[field],
                productName,
              });
            }
          }
        }
      }

      return {
        products: productDiffs,
        categories: [],
        storefront: [],
      };
    } catch (err) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: (err as Error).message },
      });
    }
  });

  app.get('/history', async () => {
    const catalog = repos.products.loadCatalog();
    const products = catalog.products;

    const historyEntries = products
      .filter((p) => Object.keys(p.field_last_modified).length > 0)
      .flatMap((p) =>
        Object.entries(p.field_last_modified).map(([field, meta]) => ({
          product_name: p.name,
          product_id: p.id,
          field,
          timestamp: meta.ts,
          by: meta.by,
          rev: meta.rev,
        }))
      )
      .sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''))
      .slice(0, 100);

    return {
      total_products: products.length,
      products_with_history: new Set(
        products.filter((p) => Object.keys(p.field_last_modified).length > 0).map((p) => p.id)
      ).size,
      entries: historyEntries,
      catalog_version: catalog.version,
      catalog_last_updated: catalog.last_updated,
    };
  });
}
