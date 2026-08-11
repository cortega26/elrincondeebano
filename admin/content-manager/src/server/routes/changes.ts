import type { FastifyInstance } from 'fastify';
import type { Repositories } from './catalog.ts';
import { ChangeSetRepository } from '../repositories/changeSetRepository.ts';
import { PreviewRepository } from '../repositories/previewRepository.ts';
import { HistoryRepository } from '../repositories/historyRepository.ts';
import {
  changeSetSchema,
  generateChangeSetId,
  isValidTransition,
  type ChangeSetStatus,
} from '../../shared/schemas/changeSet.ts';
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
import { HttpError, sanitizeUserMessage } from '../../shared/errors/AppError.ts';
import { createHash } from 'node:crypto';
import {
  ChangeSetApplier,
  buildInverseChangeSet,
  buildRedoChangeSet,
  forbiddenOpFields,
  CREATE_EXTRA_FIELDS,
} from '../services/changeSetApplier.ts';

// Plan 087: collects every forbidden data key across all product ops of a
// change set (create ops may carry 'id').
function forbiddenOpFieldsInChangeSet(cs: {
  product_ops: Array<{ action: string; data: Record<string, unknown> }>;
}): string[] {
  const forbidden: string[] = [];
  for (const op of cs.product_ops) {
    const extra = op.action === 'create' ? CREATE_EXTRA_FIELDS : undefined;
    forbidden.push(...forbiddenOpFields(op.data, extra));
  }
  return [...new Set(forbidden)];
}

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
  const history = new HistoryRepository(repoRoot);
  const applier = new ChangeSetApplier(repos);

  app.get('/change-sets', async () => {
    return { items: changeSets.listAll() };
  });

  app.get('/change-sets/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!isSafeId(id)) {
      return reply.status(400).send({
        error: { code: 'INVALID_ID', message: `Invalid change-set id "${id}"` },
      });
    }
    const cs = changeSets.load(id);
    if (!cs) {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Change set not found' } });
    }
    return cs;
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

    // Plan 087: reject ops carrying server-owned fields at the boundary
    // (the applier re-checks the same allowlist as defense in depth).
    const invalidFields = forbiddenOpFieldsInChangeSet(result.data);
    if (invalidFields.length > 0) {
      return reply.status(422).send({
        error: {
          code: 'INVALID_OP_FIELD',
          message: `Invalid field(s) in change-set op: ${invalidFields.join(', ')} — server-owned fields are not editable`,
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

    // Plan 062 step 1: status transitions are explicit and validated — no
    // arbitrary status assignment via PATCH.
    const allowedPatchFields = [
      'status',
      'product_ops',
      'category_ops',
      'validation_evidence',
      'publication_result',
    ];
    const unknownFields = Object.keys(body).filter((key) => !allowedPatchFields.includes(key));
    if (unknownFields.length > 0) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_FIELD',
          message: `Unsupported change-set field(s): ${unknownFields.join(', ')}`,
        },
      });
    }

    if (body.status !== undefined && body.status !== existing.status) {
      if (!isValidTransition(existing.status, body.status as ChangeSetStatus)) {
        return reply.status(409).send({
          error: {
            code: 'ILLEGAL_TRANSITION',
            message: `Illegal change-set transition: ${existing.status} -> ${String(body.status)}`,
          },
        });
      }
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

    // Plan 087: same allowlist guard as POST — PATCH can replace product_ops.
    const invalidFields = forbiddenOpFieldsInChangeSet(result.data);
    if (invalidFields.length > 0) {
      return reply.status(422).send({
        error: {
          code: 'INVALID_OP_FIELD',
          message: `Invalid field(s) in change-set op: ${invalidFields.join(', ')} — server-owned fields are not editable`,
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
    history.append({
      id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      kind: 'change-set-discarded',
      change_set_id: existing.id,
      summary: {
        product_ids: existing.product_ops.map((op) => op.product_id ?? ''),
      },
      ops: existing.product_ops,
    });
    return { status: 'discarded' };
  });

  // Apply a validated change set exactly once (plan 062 step 3): runs the
  // operation engine with per-entity revision checks, records before/after
  // evidence, and writes the catalog once through the revision-guarded path.
  app.post('/change-sets/:id/apply', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!isSafeId(id)) {
      return reply.status(400).send({
        error: { code: 'INVALID_ID', message: `Invalid change-set id "${id}"` },
      });
    }
    const cs = changeSets.load(id);
    if (!cs) {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Change set not found' } });
    }
    if (cs.status !== 'validated') {
      return reply.status(409).send({
        error: {
          code: 'ILLEGAL_TRANSITION',
          message: `Change set must be validated before apply (status: ${cs.status})`,
        },
      });
    }

    cs.status = 'publishing';
    cs.updated_at = new Date().toISOString();
    changeSets.save(cs);

    const result = await applier.apply(cs);
    if (!result.ok) {
      cs.status = 'failed';
      cs.updated_at = new Date().toISOString();
      changeSets.save(cs);
      return reply.status(result.statusCode).send({
        error: { code: result.code, message: result.error },
      });
    }

    cs.product_ops = result.ops;
    cs.status = 'published';
    cs.updated_at = new Date().toISOString();
    cs.publication_result = {
      applied: result.applied,
      resulting_revision: result.resulting_revision,
    };
    changeSets.save(cs);

    const counts = { created: 0, updated: 0, archived: 0, restored: 0 };
    for (const op of result.ops) {
      if (op.action === 'create') counts.created += 1;
      else if (op.action === 'edit') counts.updated += 1;
      else if (op.action === 'archive') counts.archived += 1;
      else counts.restored += 1;
    }
    history.append({
      id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      kind: 'change-set-applied',
      change_set_id: cs.id,
      source_change_set_id: cs.source_change_set_id,
      summary: {
        ...counts,
        product_ids: result.ops.map((op) => op.product_id ?? ''),
      },
      ops: result.ops,
    });

    return {
      status: 'applied',
      applied: result.applied,
      resulting_revision: result.resulting_revision,
      change_set_id: cs.id,
    };
  });

  // Undo (plan 062 step 4): a new validated change set built from the exact
  // recorded before values. Stale inverses fail at apply with explanation.
  app.post('/change-sets/:id/undo', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!isSafeId(id)) {
      return reply.status(400).send({
        error: { code: 'INVALID_ID', message: `Invalid change-set id "${id}"` },
      });
    }
    const cs = changeSets.load(id);
    if (!cs) {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Change set not found' } });
    }
    if (cs.status !== 'published') {
      return reply.status(409).send({
        error: {
          code: 'ILLEGAL_TRANSITION',
          message: `Only published change sets can be undone (status: ${cs.status})`,
        },
      });
    }

    const inverseId = generateChangeSetId();
    const built = buildInverseChangeSet(cs, inverseId, new Date().toISOString());
    if (!built.ok) {
      return reply.status(422).send({
        error: { code: 'UNSUPPORTED_OP', message: built.error },
      });
    }
    changeSets.save(built.changeSet);
    history.append({
      id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      kind: 'undo',
      change_set_id: inverseId,
      source_change_set_id: cs.id,
      summary: {
        product_ids: cs.product_ops.map((op) => op.product_id ?? ''),
      },
      ops: built.changeSet.product_ops,
    });
    return { status: 'created', undo_change_set_id: inverseId, change_set: built.changeSet };
  });

  // Redo: reapplies the original change set semantics via a new forward
  // change set (inverse of the inverse).
  app.post('/change-sets/:id/redo', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!isSafeId(id)) {
      return reply.status(400).send({
        error: { code: 'INVALID_ID', message: `Invalid change-set id "${id}"` },
      });
    }
    const cs = changeSets.load(id);
    if (!cs) {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Change set not found' } });
    }
    if (cs.status !== 'published' || !cs.source_change_set_id) {
      return reply.status(409).send({
        error: {
          code: 'ILLEGAL_TRANSITION',
          message: 'Redo requires a published inverse change set (source_change_set_id)',
        },
      });
    }

    const source = changeSets.load(cs.source_change_set_id);
    if (!source) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: `Source change set "${cs.source_change_set_id}" not found`,
        },
      });
    }

    const redoId = generateChangeSetId();
    const redo = buildRedoChangeSet(source, cs, redoId, new Date().toISOString());
    changeSets.save(redo);
    history.append({
      id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      kind: 'redo',
      change_set_id: redoId,
      source_change_set_id: cs.id,
      summary: {
        product_ids: cs.product_ops.map((op) => op.product_id ?? ''),
      },
      ops: redo.product_ops,
    });
    return { status: 'created', redo_change_set_id: redoId, change_set: redo };
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
      throw new HttpError(400, 'BAD_REQUEST', sanitizeUserMessage((err as Error).message));
    }
  });

  app.post('/diff', async (request, _reply) => {
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
      throw new HttpError(400, 'BAD_REQUEST', sanitizeUserMessage((err as Error).message));
    }
  });

  app.get('/history', async () => {
    const catalog = repos.products.loadCatalog();
    const products = catalog.products;

    // Durable append-only log (plan 062 step 4): one row per recorded op with
    // exact before/after evidence.
    const logRows = history.load().flatMap((entry) =>
      entry.ops.map((op) => ({
        product_name: products.find((p) => p.id === op.product_id)?.name ?? op.product_id ?? '?',
        product_id: op.product_id ?? '',
        field: `change-set:${entry.kind}:${op.action}`,
        timestamp: entry.timestamp,
        rev: op.resulting_revision,
        by: 'change-set',
        before: op.before,
        after: op.after,
        change_set_id: entry.change_set_id,
        source_change_set_id: entry.source_change_set_id,
      }))
    );

    // Legacy rows reconstructed from current field_last_modified metadata
    // (pre-change-set mutations).
    const legacyRows = products
      .filter((p) => Object.keys(p.field_last_modified).length > 0)
      .flatMap((p) =>
        Object.entries(p.field_last_modified).map(([field, meta]) => ({
          product_name: p.name,
          product_id: p.id,
          field,
          timestamp: meta.ts,
          rev: meta.rev,
          by: meta.by,
          before: undefined,
          after: undefined,
          change_set_id: undefined,
          source_change_set_id: undefined,
        }))
      );

    const entries = [...logRows, ...legacyRows]
      .sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''))
      .slice(0, 100);

    return {
      total_products: products.length,
      products_with_history: new Set(
        products.filter((p) => Object.keys(p.field_last_modified).length > 0).map((p) => p.id)
      ).size,
      entries,
      catalog_version: catalog.version,
      catalog_last_updated: catalog.last_updated,
    };
  });
}
