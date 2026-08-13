import type { FastifyInstance } from 'fastify';
import { buildOpenApi } from '../openapi.ts';

// Plan 127 F2.3: the generated API contract — served read-only.
export async function openapiRoute(app: FastifyInstance): Promise<void> {
  app.get('/openapi.json', async (_request, reply) => {
    return reply.type('application/json').send(buildOpenApi());
  });
}
