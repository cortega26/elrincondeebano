import type { FastifyInstance } from 'fastify';
import type { Repositories } from './catalog.ts';
import { ChangeSetRepository } from '../repositories/changeSetRepository.ts';
import { PreviewRepository } from '../repositories/previewRepository.ts';
import { changeSetSchema, generateChangeSetId } from '../../shared/schemas/changeSet.ts';
import { productSchema } from '../../shared/schemas/product.ts';
import type { Product } from '../../shared/schemas/product.ts';
import {
  importApplyRequestSchema,
  CSV_EXPORT_COLUMNS,
  csvExportQuerySchema,
  type ImportFieldConflict,
  type ImportPreviewRecord,
  type ImportPreviewResponse,
  type ImportValidationError,
} from '../../shared/schemas/importExport.ts';
import { isSafeId } from '../../shared/identity.ts';
import { createHash } from 'node:crypto';

// Python parity: identity is `normalized_name::normalized_description`
// (import_export_mixin / models.identity_key). Python collapses whitespace
// and casefolds; JS has no casefold, so this matches Python for ASCII names
// and documented-differs for exotic Unicode (plan 060, parity note).
function normalizeImportIdentity(name: string, description: string): string {
  const norm = (v: string): string =>
    typeof v === 'string' ? v.split(/\s+/).join(' ').trim().toLowerCase() : '';
  return `${norm(name)}::${norm(description)}`;
}

function productKey(p: { id?: string; name: string; description: string }): string {
  return p.id ? p.id : normalizeImportIdentity(p.name, p.description);
}

function generatePreviewId(): string {
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const IMPORT_COMPARE_FIELDS = [
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

function toPreviewResponse(preview: ImportPreviewRecord): ImportPreviewResponse {
  return {
    preview_id: preview.id,
    input_hash: preview.input_hash,
    base_rev: preview.base_rev,
    summary: {
      additions: preview.additions.length,
      updates: preview.updates.length,
      unchanged: preview.unchanged.length,
      invalid: preview.validation_errors.length,
      conflicts: preview.conflicts.length,
    },
    additions: preview.additions,
    updates: preview.updates,
    conflicts: preview.conflicts,
    validation_errors: preview.validation_errors,
  };
}

export async function changesRoutes(
  app: FastifyInstance,
  repos: Repositories,
  changeSets: ChangeSetRepository,
  repoRoot: string
): Promise<void> {
  const previews = new PreviewRepository(repoRoot);

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
    if (body.id !== undefined && body.id !== id) {
      return reply.status(400).send({
        error: { code: 'INVALID_ID', message: 'Change-set id is immutable' },
      });
    }

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

  app.get('/export.csv', async (request, reply) => {
    const query = csvExportQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: {
          code: 'BAD_REQUEST',
          message: query.error.issues.map((i) => i.message).join('; '),
        },
      });
    }
    const { q, category, archived, out_of_stock } = query.data;

    let products = repos.products.loadCatalog().products;
    if (q) {
      const needle = q.toLowerCase();
      products = products.filter(
        (p) => p.name.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle)
      );
    }
    if (category !== undefined) {
      products = products.filter((p) => p.category === category);
    }
    if (archived !== undefined) {
      products = products.filter((p) => p.is_archived === (archived === 'true'));
    }
    if (out_of_stock !== undefined) {
      products = products.filter((p) => p.stock === (out_of_stock !== 'true'));
    }

    const escapeCsv = (value: unknown): string => {
      const text = String(value ?? '');
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    // Python parity (import_export_mixin.export_filtered_csv): same columns in
    // the same order; stock writes Python-style True/False; ints for price,
    // discount and order.
    const rows = products.map((p) => [
      p.name,
      p.description,
      p.price,
      p.discount,
      p.stock ? 'True' : 'False',
      p.category,
      p.image_path,
      p.image_avif_path,
      p.order,
    ]);

    const csv =
      [CSV_EXPORT_COLUMNS.join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join(
        '\n'
      ) + '\n';

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="catalog-export.csv"');
    return csv;
  });

  app.post('/import/preview', async (request, reply) => {
    try {
      const body = request.body as Record<string, unknown>;
      const rawProducts = body?.products ?? body;

      if (!Array.isArray(rawProducts)) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: "Expected a JSON object with 'products' array" },
        });
      }

      const inputHash = createHash('sha256').update(JSON.stringify(rawProducts)).digest('hex');

      const catalog = repos.products.loadCatalog();
      const baseRev = catalog.rev;
      const existingProducts = catalog.products;
      const byId = new Map<string, Product>();
      const identityMap = new Map<string, Product>();
      for (const p of existingProducts) {
        if (p.id) byId.set(p.id, p);
        identityMap.set(normalizeImportIdentity(p.name, p.description), p);
      }

      const incoming: Product[] = [];
      const additions: Product[] = [];
      const updates: Product[] = [];
      const unchanged: Product[] = [];
      const conflicts: ImportFieldConflict[] = [];
      const validation_errors: ImportValidationError[] = [];

      for (const raw of rawProducts as Array<Record<string, unknown>>) {
        const result = productSchema.safeParse(raw);
        if (!result.success) {
          validation_errors.push({
            product_id: String(raw.id ?? ''),
            product_name: String(raw.name ?? '?'),
            message: result.error.issues.map((i) => i.message).join('; '),
          });
          continue;
        }

        const p = result.data;
        incoming.push(p);
        const existing =
          (p.id ? byId.get(p.id) : undefined) ??
          identityMap.get(normalizeImportIdentity(p.name, p.description));

        if (!existing) {
          additions.push(p);
          continue;
        }

        const diffs = IMPORT_COMPARE_FIELDS.filter((field) => p[field] !== existing[field]);
        if (diffs.length === 0) {
          unchanged.push(p);
        } else {
          updates.push(p);
          const key = productKey(existing);
          for (const field of diffs) {
            conflicts.push({
              product_id: key,
              product_name: existing.name,
              field,
              local_value: existing[field],
              incoming_value: p[field],
            });
          }
        }
      }

      const preview: ImportPreviewRecord = {
        id: generatePreviewId(),
        created_at: new Date().toISOString(),
        input_hash: inputHash,
        base_rev: baseRev,
        incoming,
        additions,
        updates,
        unchanged,
        conflicts,
        validation_errors,
      };
      previews.save(preview);

      return toPreviewResponse(preview);
    } catch (err) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: (err as Error).message },
      });
    }
  });

  app.post('/import/apply', async (request, reply) => {
    try {
      const parsed = importApplyRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues.map((i) => i.message).join('; '),
          },
        });
      }
      const { preview_id, resolutions } = parsed.data;

      const preview = previews.load(preview_id);
      if (!preview) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: `Import preview "${preview_id}" not found` },
        });
      }

      const catalog = repos.products.loadCatalog();
      if (catalog.rev !== preview.base_rev) {
        return reply.status(409).send({
          error: {
            code: 'CONFLICT',
            message: 'The catalog changed since the preview. Re-run the import preview.',
          },
        });
      }

      // Every conflict of an updated product must carry an explicit
      // resolution; unknown fields are dropped (plan 060 tampering guard).
      const resolutionMap = new Map<string, Map<string, 'keep_local' | 'use_incoming'>>();
      for (const r of resolutions) {
        if (!resolutionMap.has(r.product_id)) resolutionMap.set(r.product_id, new Map());
        resolutionMap.get(r.product_id)!.set(r.field, r.resolution);
      }
      const unresolved: string[] = [];
      for (const conflict of preview.conflicts) {
        if (!resolutionMap.get(conflict.product_id)?.has(conflict.field)) {
          unresolved.push(`${conflict.product_name} / ${conflict.field}`);
        }
      }
      if (unresolved.length > 0) {
        return reply.status(422).send({
          error: {
            code: 'UNRESOLVED_CONFLICTS',
            message: `Unresolved conflicts: ${unresolved.slice(0, 10).join(', ')}`,
          },
        });
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const incoming of preview.additions) {
        catalog.products.push({ ...incoming, order: catalog.products.length });
        created += 1;
      }

      for (const incoming of preview.updates) {
        const existing = incoming.id
          ? catalog.products.find((e) => e.id === incoming.id)
          : catalog.products.find(
              (e) =>
                normalizeImportIdentity(e.name, e.description) ===
                normalizeImportIdentity(incoming.name, incoming.description)
            );
        if (!existing) {
          errors.push(`Product "${incoming.name}" no longer exists in the catalog`);
          continue;
        }

        const fieldResolutions = resolutionMap.get(productKey(existing));
        let changed = false;
        for (const field of IMPORT_COMPARE_FIELDS) {
          if (incoming[field] !== existing[field]) {
            const resolution = fieldResolutions?.get(field) ?? 'keep_local';
            if (resolution === 'use_incoming') {
              (existing as Record<string, unknown>)[field] = incoming[field];
              changed = true;
            }
          }
        }
        if (changed) {
          const result = productSchema.safeParse(existing);
          if (!result.success) {
            errors.push(
              `${existing.name}: ${result.error.issues.map((i) => i.message).join('; ')}`
            );
            continue;
          }
          existing.rev += 1;
          updated += 1;
        } else {
          skipped += 1;
        }
      }

      // No-op apply: nothing effective changed — do not bump the revision.
      if (created === 0 && updated === 0) {
        return {
          status: 'ok' as const,
          created: 0,
          updated: 0,
          skipped,
          resulting_revision: catalog.rev,
        };
      }

      catalog.rev += 1;
      catalog.last_updated = new Date().toISOString();

      const writeResult = await repos.products.writeCatalog(
        catalog,
        `import-${preview_id}`,
        preview.base_rev
      );
      if (!writeResult.ok) {
        return reply.status(writeResult.statusCode).send({
          error: {
            code: writeResult.statusCode === 409 ? 'CONFLICT' : 'INTERNAL_ERROR',
            message: writeResult.error,
          },
        });
      }

      return {
        status: 'ok' as const,
        created,
        updated,
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
