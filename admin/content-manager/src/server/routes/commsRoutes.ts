import type { FastifyInstance } from 'fastify';
import { CommsConflictError, CommsRepository } from '../repositories/commsRepository.ts';
import { parseCommsDocument } from '../../shared/comms.ts';

// Plan 217 / ADR 0011: API del módulo privado de comunicaciones. Solo
// lectura y reemplazo completo del documento (la SPA compone los cambios);
// el PUT es mutación (credencial + modo operator, ver ROUTE_POLICY).
export async function commsRoutes(app: FastifyInstance, repoRoot: string): Promise<void> {
  const repo = new CommsRepository(repoRoot);

  app.get('/comms', async (_request, reply) => {
    // Contiene teléfonos: nunca cachear.
    reply.header('Cache-Control', 'no-store');
    try {
      return repo.read();
    } catch (err) {
      return reply.status(500).send({
        error: { code: 'COMMS_UNREADABLE', message: (err as Error).message },
      });
    }
  });

  app.put('/comms', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const body = request.body as { expected_rev?: unknown; document?: unknown } | undefined;
    if (typeof body?.expected_rev !== 'number' || !Number.isInteger(body.expected_rev)) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Se esperaba { expected_rev, document }' },
      });
    }
    const parsed = parseCommsDocument(body.document);
    if (!parsed.ok) {
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Documento de comunicaciones inválido',
          details: parsed.errors.slice(0, 20).map((message) => ({ code: 'invalid', message })),
        },
      });
    }
    try {
      return repo.save(parsed.value, body.expected_rev);
    } catch (err) {
      if (err instanceof CommsConflictError) {
        return reply.status(409).send({
          error: { code: 'REV_CONFLICT', message: err.message },
        });
      }
      throw err;
    }
  });
}
