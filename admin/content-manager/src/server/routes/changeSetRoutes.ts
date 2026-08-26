import type { FastifyInstance } from 'fastify';
import type { Repositories } from './helpers.ts';
import { ChangeSetRepository } from '../repositories/changeSetRepository.ts';
import { HistoryRepository } from '../repositories/historyRepository.ts';
import {
  changeSetSchema,
  generateChangeSetId,
  isValidTransition,
  type ChangeSetStatus,
} from '../../shared/schemas/changeSet.ts';
import { isSafeId } from '../../shared/identity.ts';
import {
  ChangeSetApplier,
  buildInverseChangeSet,
  buildRedoChangeSet,
} from '../services/changeSetApplier.ts';
import { forbiddenOpFieldsInChangeSet } from './changes-common.ts';
import type { ProductService } from '../../domain/products/productService.ts';

export async function changeSetRoutes(
  app: FastifyInstance,
  repos: Repositories,
  changeSets: ChangeSetRepository,
  repoRoot: string,
  productService: ProductService
): Promise<void> {
  void productService;
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
      id: `h-${Date.now()}-${globalThis.crypto.randomUUID().slice(0, 6)}`,
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
      id: `h-${Date.now()}-${globalThis.crypto.randomUUID().slice(0, 6)}`,
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
      id: `h-${Date.now()}-${globalThis.crypto.randomUUID().slice(0, 6)}`,
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
      id: `h-${Date.now()}-${globalThis.crypto.randomUUID().slice(0, 6)}`,
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
}
