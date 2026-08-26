import type { FastifyInstance } from 'fastify';
import type { Repositories } from './helpers.ts';
import { ChangeSetRepository } from '../repositories/changeSetRepository.ts';
import { PreviewRepository } from '../repositories/previewRepository.ts';
import { HistoryRepository } from '../repositories/historyRepository.ts';
import { productSchema } from '../../shared/schemas/product.ts';
import type { Product } from '../../shared/schemas/product.ts';
import {
  importApplyRequestSchema,
  CSV_EXPORT_COLUMNS,
  csvExportQuerySchema,
} from '../../shared/schemas/importExport.ts';
import type {
  ImportFieldConflict,
  ImportPreviewRecord,
  ImportValidationError,
} from '../../shared/schemas/importExport.ts';
import { HttpError, sanitizeUserMessage } from '../../shared/errors/AppError.ts';
import { createHash } from 'node:crypto';
import {
  IMPORT_COMPARE_FIELDS,
  generatePreviewId,
  normalizeImportIdentity,
  productKey,
  toPreviewResponse,
} from './changes-common.ts';
import type { ProductService } from '../../domain/products/productService.ts';

export async function importRoutes(
  app: FastifyInstance,
  repos: Repositories,
  changeSets: ChangeSetRepository,
  repoRoot: string,
  productService: ProductService
): Promise<void> {
  void changeSets;
  void productService;
  const previews = new PreviewRepository(repoRoot);
  const history = new HistoryRepository(repoRoot);

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
    const { q, category, archived, out_of_stock, discounted_only, min_discount, max_discount } =
      query.data;

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
    // Plan 091: discount filters mirror GET /products (percent of price).
    const discountPercent = (p: (typeof products)[number]): number =>
      p.price > 0 ? (p.discount / p.price) * 100 : 0;
    if (discounted_only === 'true') {
      products = products.filter((p) => discountPercent(p) > 0);
    }
    if (min_discount !== undefined) {
      const min = Number(min_discount);
      if (Number.isFinite(min)) products = products.filter((p) => discountPercent(p) >= min);
    }
    if (max_discount !== undefined) {
      const max = Number(max_discount);
      if (Number.isFinite(max)) products = products.filter((p) => discountPercent(p) <= max);
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
      throw new HttpError(400, 'BAD_REQUEST', sanitizeUserMessage((err as Error).message));
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

      // Plan 092: index updates once per apply instead of find-per-update.
      const byId = new Map(catalog.products.map((e) => [e.id, e]));
      const byIdentity = new Map(
        catalog.products.map((e) => [normalizeImportIdentity(e.name, e.description), e])
      );
      for (const incoming of preview.updates) {
        const existing = incoming.id
          ? byId.get(incoming.id)
          : byIdentity.get(normalizeImportIdentity(incoming.name, incoming.description));
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

      history.append({
        id: `h-${Date.now()}-${globalThis.crypto.randomUUID().slice(0, 6)}`,
        timestamp: new Date().toISOString(),
        kind: 'import-applied',
        change_set_id: `import-${preview_id}`,
        summary: {
          created,
          updated,
          product_ids: [...preview.additions, ...preview.updates]
            .map((p) => (p.id ?? '') as string)
            .filter(Boolean),
        },
        ops: [],
      });

      return {
        status: 'ok' as const,
        created,
        updated,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
        resulting_revision: catalog.rev,
      };
    } catch (err) {
      throw new HttpError(400, 'BAD_REQUEST', sanitizeUserMessage((err as Error).message));
    }
  });
}
