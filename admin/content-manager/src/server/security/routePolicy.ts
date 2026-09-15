export type RouteClass = 'read' | 'preview' | 'mutation';

export interface RoutePolicyEntry {
  method: string;
  path: string;
  class: RouteClass;
}

// Every registered route in src/server/routes/*.ts must appear here. The
// guarantee test (test/contract/routePolicy.test.ts) enforces that mutation
// routes without a credential are rejected; adding a route without updating
// this table makes it fail closed (Step 1), so it cannot silently run
// unauthenticated.
export const ROUTE_POLICY: RoutePolicyEntry[] = [
  // health + bootstrap (no credential)
  { method: 'GET', path: '/api/v1/health', class: 'read' },
  { method: 'GET', path: '/api/v1/openapi.json', class: 'read' },
  { method: 'GET', path: '/api/v1/bootstrap', class: 'read' },
  // products
  { method: 'GET', path: '/api/v1/products', class: 'read' },
  { method: 'GET', path: '/api/v1/products/:id', class: 'read' },
  { method: 'GET', path: '/api/v1/products/revision', class: 'read' },
  { method: 'POST', path: '/api/v1/products', class: 'mutation' },
  { method: 'PATCH', path: '/api/v1/products/:id', class: 'mutation' },
  { method: 'DELETE', path: '/api/v1/products/:id', class: 'mutation' },
  { method: 'POST', path: '/api/v1/products/reorder', class: 'mutation' },
  { method: 'POST', path: '/api/v1/products/batch-update', class: 'mutation' },
  { method: 'POST', path: '/api/v1/categories/batch-update', class: 'mutation' },
  { method: 'POST', path: '/api/v1/media/intents/batch', class: 'mutation' },
  { method: 'POST', path: '/api/v1/products/bulk/preview', class: 'preview' },
  { method: 'POST', path: '/api/v1/products/bulk/apply', class: 'mutation' },
  // categories + nav groups
  { method: 'GET', path: '/api/v1/categories', class: 'read' },
  { method: 'GET', path: '/api/v1/categories/:key', class: 'read' },
  { method: 'POST', path: '/api/v1/categories', class: 'mutation' },
  { method: 'PATCH', path: '/api/v1/categories/:id', class: 'mutation' },
  { method: 'DELETE', path: '/api/v1/categories/:id', class: 'mutation' },
  { method: 'POST', path: '/api/v1/categories/reorder', class: 'mutation' },
  { method: 'POST', path: '/api/v1/nav-groups', class: 'mutation' },
  { method: 'PATCH', path: '/api/v1/nav-groups/:id', class: 'mutation' },
  { method: 'DELETE', path: '/api/v1/nav-groups/:id', class: 'mutation' },
  { method: 'POST', path: '/api/v1/categories/:categoryId/subcategories', class: 'mutation' },
  {
    method: 'PATCH',
    path: '/api/v1/categories/:categoryId/subcategories/:subId',
    class: 'mutation',
  },
  {
    method: 'DELETE',
    path: '/api/v1/categories/:categoryId/subcategories/:subId',
    class: 'mutation',
  },
  {
    method: 'POST',
    path: '/api/v1/categories/:categoryId/subcategories/reorder',
    class: 'mutation',
  },
  // storefront
  { method: 'GET', path: '/api/v1/storefront/bundles', class: 'read' },
  { method: 'GET', path: '/api/v1/storefront/featured', class: 'read' },
  { method: 'PUT', path: '/api/v1/storefront/bundles', class: 'mutation' },
  { method: 'PUT', path: '/api/v1/storefront/featured', class: 'mutation' },
  // media
  { method: 'GET', path: '/api/v1/media', class: 'read' },
  { method: 'GET', path: '/api/v1/media/validate', class: 'read' },
  { method: 'POST', path: '/api/v1/media/intents', class: 'mutation' },
  { method: 'POST', path: '/api/v1/media/intents/:id/run', class: 'mutation' },
  { method: 'POST', path: '/api/v1/media/intents/:id/apply', class: 'mutation' },
  { method: 'POST', path: '/api/v1/media/intents/:id/cancel', class: 'mutation' },
  { method: 'DELETE', path: '/api/v1/media/intents/:id', class: 'mutation' },
  { method: 'POST', path: '/api/v1/media/upload', class: 'mutation' },
  // change sets + import/export + diff
  { method: 'GET', path: '/api/v1/change-sets', class: 'read' },
  { method: 'GET', path: '/api/v1/change-sets/:id', class: 'read' },
  { method: 'POST', path: '/api/v1/change-sets', class: 'mutation' },
  { method: 'PATCH', path: '/api/v1/change-sets/:id', class: 'mutation' },
  { method: 'POST', path: '/api/v1/change-sets/:id/discard', class: 'mutation' },
  { method: 'POST', path: '/api/v1/change-sets/:id/apply', class: 'mutation' },
  { method: 'POST', path: '/api/v1/change-sets/:id/undo', class: 'mutation' },
  { method: 'POST', path: '/api/v1/change-sets/:id/redo', class: 'mutation' },
  { method: 'GET', path: '/api/v1/export', class: 'read' },
  { method: 'GET', path: '/api/v1/export.csv', class: 'read' },
  // Plan 180: import/preview persists a durable server-side record (unlike
  // pure previews), so it is classed as a mutation — preview routes that
  // persist state must always be classed `mutation`.
  { method: 'POST', path: '/api/v1/import/preview', class: 'mutation' },
  { method: 'POST', path: '/api/v1/import/apply', class: 'mutation' },
  // Plan 090: diff is a pure read — no write-mode or credential required.
  { method: 'POST', path: '/api/v1/diff', class: 'read' },
  { method: 'GET', path: '/api/v1/history', class: 'read' },
  { method: 'POST', path: '/api/v1/history/:productId/revert', class: 'mutation' },
  { method: 'GET', path: '/api/v1/diagnostics', class: 'read' },
  // conflicts + sync
  { method: 'GET', path: '/api/v1/conflicts', class: 'read' },
  { method: 'POST', path: '/api/v1/conflicts/:id/resolve', class: 'mutation' },
  { method: 'POST', path: '/api/v1/conflicts/:id/retry', class: 'mutation' },
  { method: 'GET', path: '/api/v1/sync/status', class: 'read' },
  { method: 'GET', path: '/api/v1/sync/events', class: 'read' },
  { method: 'PUT', path: '/api/v1/sync/config', class: 'mutation' },
  { method: 'POST', path: '/api/v1/sync/now', class: 'mutation' },
  { method: 'POST', path: '/api/v1/sync/pause', class: 'mutation' },
  { method: 'POST', path: '/api/v1/sync/resume', class: 'mutation' },
  // publication + jobs
  { method: 'GET', path: '/api/v1/git/status', class: 'read' },
  { method: 'POST', path: '/api/v1/git/pull', class: 'mutation' },
  { method: 'POST', path: '/api/v1/publications/preview', class: 'preview' },
  { method: 'POST', path: '/api/v1/publications', class: 'mutation' },
  { method: 'GET', path: '/api/v1/publications/recovery', class: 'read' },
  { method: 'GET', path: '/api/v1/jobs', class: 'read' },
  { method: 'GET', path: '/api/v1/jobs/:id', class: 'read' },
  { method: 'POST', path: '/api/v1/jobs/:id/cancel', class: 'mutation' },
  // Plan 211: preview builds. POST is a mutation, not a preview — it runs
  // minutes of compute and rewrites astro-poc/dist (shared with the release
  // artifact path), so plan 180's rule (persists state ⇒ mutation) applies;
  // temp-dist being regenerable does not make the clobber safe. GETs are
  // reads contained to the preview dist root (route-level containment).
  { method: 'POST', path: '/api/v1/preview/build', class: 'mutation' },
  { method: 'GET', path: '/api/v1/preview', class: 'read' },
  { method: 'GET', path: '/api/v1/preview/*', class: 'read' },
  // backup
  { method: 'GET', path: '/api/v1/backup', class: 'read' },
  { method: 'POST', path: '/api/v1/backup', class: 'mutation' },
  { method: 'POST', path: '/api/v1/backup/:id/restore', class: 'mutation' },
  { method: 'POST', path: '/api/v1/backup/prune-preview', class: 'preview' },
  { method: 'POST', path: '/api/v1/backup/prune', class: 'mutation' },
  { method: 'POST', path: '/api/v1/backup/reconcile', class: 'mutation' },
];

export interface RouteMatch {
  class: RouteClass;
  exact: boolean;
}

export function classifyRoute(method: string, url: string): RouteMatch {
  const normalizedPath = url.split('?')[0] ?? '';

  for (const entry of ROUTE_POLICY) {
    if (entry.method !== method) continue;
    if (entry.path === normalizedPath) return { class: entry.class, exact: true };

    // Plan 211: wildcard entries (preview static assets) match by prefix.
    if (entry.path.endsWith('/*')) {
      const prefix = entry.path.slice(0, -2);
      if (normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)) {
        return { class: entry.class, exact: true };
      }
      continue;
    }

    const entryParts = entry.path.split('/');
    const urlParts = normalizedPath.split('/');
    if (entryParts.length !== urlParts.length) continue;

    let matches = true;
    for (let i = 0; i < entryParts.length; i++) {
      if (entryParts[i] === urlParts[i]) continue;
      if (entryParts[i].startsWith(':')) continue;
      matches = false;
      break;
    }
    if (matches) return { class: entry.class, exact: true };
  }

  // Fail closed: an unlisted write method is a mutation (credential required);
  // only unlisted GETs are readable.
  return method === 'GET' ? { class: 'read', exact: false } : { class: 'mutation', exact: false };
}
