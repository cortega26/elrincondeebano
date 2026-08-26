import type { FastifyInstance } from 'fastify';
import type { Repositories } from './helpers.ts';
import { ChangeSetRepository } from '../repositories/changeSetRepository.ts';
import { HistoryRepository } from '../repositories/historyRepository.ts';
import { requireWriteMode } from './helpers.ts';
import type { ProductService } from '../../domain/products/productService.ts';
import { isSafeId } from '../../shared/identity.ts';
import { HttpError, sanitizeUserMessage } from '../../shared/errors/AppError.ts';
import { generateChangeSetId } from '../../shared/schemas/changeSet.ts';
import type { ChangeSet } from '../../shared/schemas/changeSet.ts';
import { ChangeSetApplier } from '../services/changeSetApplier.ts';

export async function historyRoutes(
  app: FastifyInstance,
  repos: Repositories,
  changeSets: ChangeSetRepository,
  repoRoot: string,
  productService: ProductService
): Promise<void> {
  void changeSets;
  const history = new HistoryRepository(repoRoot);
  const applier = new ChangeSetApplier(repos);

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

  // Plan 095: hard delete (purge) — a change-set op with full before
  // evidence, applied through the same engine as every other mutation.
  app.delete('/products/:id', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;
    const { id } = request.params as { id: string };
    if (!isSafeId(id)) {
      return reply.status(400).send({
        error: { code: 'INVALID_ID', message: `Invalid product id "${id}"` },
      });
    }
    const body = request.body as { base_revision?: number } | undefined;
    const catalog = repos.products.loadCatalog();
    const product = catalog.products.find((p) => p.id === id);
    if (!product) {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: `Product "${id}" not found` } });
    }

    const csId = generateChangeSetId();
    const now = new Date().toISOString();
    const cs: ChangeSet = {
      id: csId,
      status: 'validated',
      created_at: now,
      updated_at: now,
      product_ops: [
        {
          action: 'purge',
          product_id: id,
          data: {},
          base_revision: body?.base_revision ?? product.rev,
          before: {},
          after: {},
        },
      ],
      category_ops: [],
      validation_evidence: { kind: 'purge', source_change_set_id: null },
      publication_result: null,
    };

    const result = await applier.apply(cs);
    if (!result.ok) {
      return reply.status(result.statusCode).send({
        error: { code: result.code, message: result.error },
      });
    }

    history.append({
      id: `h-${Date.now()}-${globalThis.crypto.randomUUID().slice(0, 6)}`,
      timestamp: new Date().toISOString(),
      kind: 'change-set-applied',
      change_set_id: csId,
      summary: { product_ids: [id] },
      ops: result.ops,
    });

    return {
      status: 'purged',
      command_id: body?.base_revision !== undefined ? csId : undefined,
      resulting_revision: result.resulting_revision,
    };
  });

  // Plan 095: revert a product to a recorded change-set revision — applies
  // the inverse (before-values) as a rev-guarded edit change set.
  app.post('/history/:productId/revert', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;
    const { productId } = request.params as { productId: string };
    if (!isSafeId(productId)) {
      return reply.status(400).send({
        error: { code: 'INVALID_ID', message: `Invalid product id "${productId}"` },
      });
    }
    const body = request.body as { to_rev?: number } | undefined;
    const toRev = body?.to_rev;
    if (toRev === undefined || !Number.isInteger(toRev) || toRev < 0) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Missing or invalid to_rev' },
      });
    }

    // Plan 095: to_rev names the revision to restore — the op that
    // transitioned AWAY from it (base_revision === toRev) provides the exact
    // before-state; the op that produced it provides its after-state.
    let targetOp:
      | {
          product_id?: string;
          action: string;
          before: Record<string, unknown>;
          after: Record<string, unknown>;
          base_revision?: number;
          resulting_revision?: number;
        }
      | undefined;
    let restoreFromAfter = false;
    for (const entry of history.load()) {
      for (const op of entry.ops) {
        if (op.product_id !== productId) continue;
        if (op.base_revision === toRev && op.action === 'edit') {
          targetOp = op;
          restoreFromAfter = false;
          break;
        }
        if (op.resulting_revision === toRev && op.action === 'edit') {
          targetOp = op;
          restoreFromAfter = true;
        }
      }
      if (targetOp && !restoreFromAfter) break;
    }
    if (!targetOp) {
      return reply.status(422).send({
        error: {
          code: 'NOT_REVERTIBLE',
          message: 'No hay snapshot reversible para esa revisión (solo ediciones de change set).',
        },
      });
    }

    const current = repos.products.loadCatalog().products.find((p) => p.id === productId);
    if (!current) {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: `Product "${productId}" not found` } });
    }

    const csId = generateChangeSetId();
    const now = new Date().toISOString();
    const cs: ChangeSet = {
      id: csId,
      status: 'validated',
      created_at: now,
      updated_at: now,
      product_ops: [
        {
          action: 'edit',
          product_id: productId,
          data: (restoreFromAfter ? targetOp.after : targetOp.before) as Record<string, unknown>,
          base_revision: current.rev,
          before: {},
          after: {},
          idempotency_key: `revert-${csId}`,
        },
      ],
      category_ops: [],
      validation_evidence: { kind: 'revert', source_change_set_id: null },
      publication_result: null,
    };

    const result = await applier.apply(cs);
    if (!result.ok) {
      return reply.status(result.statusCode).send({
        error: { code: result.code, message: result.error },
      });
    }
    return { status: 'reverted', resulting_revision: result.resulting_revision };
  });

  app.get('/history', async () => {
    const catalog = repos.products.loadCatalog();
    const products = catalog.products;

    // Durable append-only log (plan 062 step 4): one row per recorded op with
    // exact before/after evidence.
    // Plan 092: name lookup map once per request instead of find-per-op.
    const productNameById = new Map(products.map((p) => [p.id, p.name]));
    const logRows = history.load().flatMap((entry) =>
      entry.ops.map((op) => ({
        product_name: productNameById.get(op.product_id ?? '') ?? op.product_id ?? '?',
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

    // Plan 097: cap 20 rows per product (Python parity: 20/product) instead
    // of a global 100 — older per-product detail no longer disappears first.
    const sortedAll = [...logRows, ...legacyRows].sort((a, b) =>
      (b.timestamp ?? '').localeCompare(a.timestamp ?? '')
    );
    const perProduct = new Map<string, number>();
    const entries = sortedAll.filter((e) => {
      const count = (perProduct.get(e.product_id ?? '') ?? 0) + 1;
      perProduct.set(e.product_id ?? '', count);
      return count <= 20;
    });

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
