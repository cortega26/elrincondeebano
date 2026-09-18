// Plan 197: media domain slice of ContentManagerClient.
// Pure functions over the shared ApiRequestFn core — no call-site churn:
// the facade keeps every signature, these just move.
import type { ApiRequestFn } from './requestCore.ts';

export async function getMedia(request: ApiRequestFn): Promise<{
  items: Array<{
    path: string;
    name: string;
    size: number;
    ext: string;
    status: 'active' | 'orphan' | 'generated' | 'staged' | 'missing';
    productName?: string;
  }>;
  summary: {
    total: number;
    active: number;
    orphans: number;
    generated: number;
    staged: number;
    missing: number;
  };
  intents: Array<{
    id: string;
    type: string;
    status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'applied';
    target_path?: string;
    progress: number;
    errors: string[];
    category_slug?: string;
  }>;
}> {
  return request('/media');
}
