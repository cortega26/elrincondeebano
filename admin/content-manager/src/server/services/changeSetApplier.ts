import type { ChangeSetOp } from '../../shared/schemas/changeSet.ts';
import type { ChangeSet } from '../../shared/schemas/changeSet.ts';
import { productSchema } from '../../shared/schemas/product.ts';
import { generateProductId } from '../../shared/identity.ts';
import type { Repositories } from '../../server/routes/catalog.ts';

export type ApplyResult =
  | { ok: true; applied: number; resulting_revision: number; ops: ChangeSetOp[] }
  | { ok: false; statusCode: number; code: string; error: string };

// Applies change-set product operations exactly once, recording before/after
// values and per-entity revision evidence (plan 062 step 3). Stale base
// revisions fail the whole apply — nothing is partially written.
export class ChangeSetApplier {
  constructor(private readonly repos: Repositories) {}

  async apply(cs: ChangeSet): Promise<ApplyResult> {
    const catalog = this.repos.products.loadCatalog();
    const baseRev = catalog.rev;
    const ops: ChangeSetOp[] = [];

    for (const op of cs.product_ops) {
      const product = op.product_id
        ? catalog.products.find((p) => p.id === op.product_id)
        : undefined;

      switch (op.action) {
        case 'create': {
          const parsed = productSchema.safeParse(op.data);
          if (!parsed.success) {
            return {
              ok: false,
              statusCode: 422,
              code: 'VALIDATION_ERROR',
              error: parsed.error.issues.map((i) => i.message).join('; '),
            };
          }
          const productRecord = {
            ...parsed.data,
            id: parsed.data.id ?? generateProductId(),
            order: catalog.products.length,
            rev: 1,
          };
          catalog.products.push(productRecord);
          ops.push({
            ...op,
            // Backfill the server-assigned id so undo/redo can target it.
            product_id: productRecord.id,
            before: {},
            after: { ...productRecord },
            resulting_revision: productRecord.rev,
          });
          break;
        }

        case 'edit':
        case 'archive':
        case 'restore': {
          if (!product) {
            return {
              ok: false,
              statusCode: 404,
              code: 'NOT_FOUND',
              error: `Product "${op.product_id ?? '?'}" not found`,
            };
          }
          if (op.base_revision !== undefined && product.rev !== op.base_revision) {
            return {
              ok: false,
              statusCode: 409,
              code: 'STALE_REVISION',
              error: `Product "${product.name}" changed since the change set was built (rev ${product.rev} != ${op.base_revision})`,
            };
          }

          const before: Record<string, unknown> = {};
          if (op.action === 'edit') {
            for (const [field, value] of Object.entries(op.data)) {
              before[field] = (product as unknown as Record<string, unknown>)[field];
              (product as unknown as Record<string, unknown>)[field] = value;
            }
          } else if (op.action === 'archive') {
            before.is_archived = product.is_archived;
            product.is_archived = true;
          } else {
            before.is_archived = product.is_archived;
            product.is_archived = false;
          }

          const revalidated = productSchema.safeParse(product);
          if (!revalidated.success) {
            return {
              ok: false,
              statusCode: 422,
              code: 'VALIDATION_ERROR',
              error: `${product.name}: ${revalidated.error.issues.map((i) => i.message).join('; ')}`,
            };
          }
          product.rev += 1;
          ops.push({
            ...op,
            before,
            after: op.action === 'edit' ? { ...op.data } : { is_archived: product.is_archived },
            resulting_revision: product.rev,
          });
          break;
        }
      }
    }

    catalog.rev += 1;
    catalog.last_updated = new Date().toISOString();

    const writeResult = await this.repos.products.writeCatalog(
      catalog,
      `change-set-${cs.id}`,
      baseRev
    );
    if (!writeResult.ok) {
      return {
        ok: false,
        statusCode: writeResult.statusCode,
        code: writeResult.statusCode === 409 ? 'CONFLICT' : 'INTERNAL_ERROR',
        error: writeResult.error ?? 'Catalog write failed',
      };
    }

    return { ok: true, applied: ops.length, resulting_revision: catalog.rev, ops };
  }
}

// Builds the exact inverse change set from recorded before values (plan 062
// step 4). Creates are inverted as archive (the catalog has no hard delete).
export function buildInverseChangeSet(
  cs: ChangeSet,
  id: string,
  now: string
): { ok: true; changeSet: ChangeSet } | { ok: false; error: string } {
  const inverseOps: ChangeSetOp[] = [];
  for (const op of cs.product_ops) {
    const productId = op.product_id;
    if (op.action === 'create') {
      inverseOps.push({
        action: 'archive',
        product_id: productId,
        data: { is_archived: true },
        before: {},
        after: {},
        base_revision: op.resulting_revision,
        idempotency_key: `inverse-${op.idempotency_key ?? op.product_id ?? 'x'}`,
      });
      continue;
    }
    if (op.action === 'edit') {
      const data = op.before;
      inverseOps.push({
        action: 'edit',
        product_id: productId,
        data,
        before: {},
        after: {},
        base_revision: op.resulting_revision,
        idempotency_key: `inverse-${op.idempotency_key ?? op.product_id ?? 'x'}`,
      });
      continue;
    }
    if (op.action === 'archive' || op.action === 'restore') {
      inverseOps.push({
        action: op.action === 'archive' ? 'restore' : 'archive',
        product_id: productId,
        data: { is_archived: op.action === 'archive' ? false : true },
        before: {},
        after: {},
        base_revision: op.resulting_revision,
        idempotency_key: `inverse-${op.idempotency_key ?? op.product_id ?? 'x'}`,
      });
      continue;
    }
    return { ok: false, error: `Unsupported inverse for action "${op.action}"` };
  }

  return {
    ok: true,
    changeSet: {
      id,
      status: 'validated',
      created_at: now,
      updated_at: now,
      product_ops: inverseOps,
      category_ops: [],
      validation_evidence: {
        kind: 'inverse',
        source_change_set_id: cs.id,
        derived_from: 'recorded-before-values',
      },
      publication_result: null,
      source_change_set_id: cs.id,
    },
  };
}

// Redo: reapplies the original semantics (source forward values) at the
// current post-undo revisions (inverse evidence). A created product was
// archived by undo, so redo restores it — never duplicates it.
export function buildRedoChangeSet(
  source: ChangeSet,
  inverse: ChangeSet,
  id: string,
  now: string
): ChangeSet {
  const revisionAfterUndo = new Map<string, number | undefined>(
    inverse.product_ops.map((op) => [op.product_id ?? '', op.resulting_revision])
  );

  return {
    id,
    status: 'validated',
    created_at: now,
    updated_at: now,
    product_ops: source.product_ops.map((op) => {
      const base: Omit<ChangeSetOp, 'action' | 'data'> = {
        product_id: op.product_id,
        base_revision: revisionAfterUndo.get(op.product_id ?? '') ?? op.resulting_revision,
        before: {},
        after: {},
        idempotency_key: `redo-${op.idempotency_key ?? op.product_id ?? 'x'}`,
      };
      if (op.action === 'create') {
        return { ...base, action: 'restore', data: { is_archived: false } };
      }
      if (op.action === 'edit') {
        return { ...base, action: 'edit', data: { ...op.after } };
      }
      if (op.action === 'archive' || op.action === 'restore') {
        return { ...base, action: op.action, data: { is_archived: op.action === 'archive' } };
      }
      return { ...base, action: op.action, data: { ...op.data } };
    }),
    category_ops: [],
    validation_evidence: { kind: 'redo', source_change_set_id: source.id },
    publication_result: null,
    source_change_set_id: source.id,
  };
}
