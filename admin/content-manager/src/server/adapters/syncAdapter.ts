import { z } from 'zod';

export const syncConfigSchema = z.object({
  enabled: z.boolean().default(false),
  api_base: z.string().url().optional(),
  api_token: z.string().optional(),
  poll_interval: z.number().int().positive().default(60),
  pull_interval: z.number().int().positive().default(300),
  timeout: z.number().int().positive().default(10),
});

export type SyncConfig = z.infer<typeof syncConfigSchema>;

export class SyncAdapter {
  private config: SyncConfig;

  constructor(config: SyncConfig) {
    this.config = config;
  }

  get isConfigured(): boolean {
    return this.config.enabled && !!this.config.api_base;
  }

  getConfig(): SyncConfig {
    return { ...this.config };
  }

  async pushChanges(_changes: unknown): Promise<{ ok: boolean; status: number; body?: unknown }> {
    if (!this.isConfigured) {
      return { ok: false, status: 503, body: { error: 'Sync not configured' } };
    }

    return {
      ok: false,
      status: 501,
      body: {
        error: 'Remote sync transport not yet implemented. Edit conflicts locally.',
        required_api_contract: {
          description:
            'Server must accept: PATCH /api/products/:id with { base_rev, changeset_id, source, fields }',
          headers: ['Authorization: Bearer <token>', 'X-Correlation-Id: <changeset_id>'],
          responses: {
            '200': 'Patch applied, returns { product, rev, conflicts: [] }',
            '409':
              'Revision conflict, returns { product, rev, conflicts: [{ field, base_value, local_value, server_value }] }',
            '412': 'Precondition failed',
          },
        },
      },
    };
  }

  async pullChanges(): Promise<{ ok: boolean; status: number; body?: unknown }> {
    if (!this.isConfigured) {
      return { ok: false, status: 503, body: { error: 'Sync not configured' } };
    }

    return {
      ok: false,
      status: 501,
      body: {
        error: 'Remote sync transport not yet implemented. Edit conflicts locally.',
        required_api_contract: {
          description: 'Server must support: GET /api/products/changes?since_rev=<rev>',
          headers: ['Authorization: Bearer <token>'],
          responses: {
            '200': 'Returns { changes: [{ product_snapshot, rev, product_id }], to_rev }',
          },
        },
      },
    };
  }
}
