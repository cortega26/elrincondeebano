import type { FastifyInstance } from 'fastify';

export function healthRoute(app: FastifyInstance, _opts: unknown, done: () => void): void {
  app.get('/health', async (_request, _reply) => {
    return {
      status: 'ok',
      version: '0.1.0',
      uptime: process.uptime(),
      node: process.version,
      timestamp: new Date().toISOString(),
    };
  });

  done();
}
