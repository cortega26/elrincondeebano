import type { FastifyInstance } from 'fastify';
import { runDoctor, redactDoctorReport } from '../services/doctor.ts';

export async function diagnosticsRoutes(app: FastifyInstance, repoRoot: string): Promise<void> {
  app.get('/diagnostics', async () => {
    // Plan 061 step 3: the report is redacted before it leaves the server —
    // no absolute home paths, credentials or token-like values in the UI or
    // the downloadable evidence.
    return redactDoctorReport(runDoctor(repoRoot));
  });
}
