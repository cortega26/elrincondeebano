import type { FastifyInstance } from 'fastify';
import { openApiDocument } from '../openapi.ts';

// Plan 127 F2.3: the generated API contract — served read-only.
// Plan 150: serve the memoized document (buildOpenApi is pure — no request
// inputs — so a single build per process is safe).
export async function openapiRoute(app: FastifyInstance): Promise<void> {
  app.get('/openapi.json', async (_request, reply) => {
    return reply.type('application/json').send(openApiDocument);
  });
}
