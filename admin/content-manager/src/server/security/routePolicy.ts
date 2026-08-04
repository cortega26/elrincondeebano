export type RouteClass = 'read' | 'preview' | 'mutation';

export interface RoutePolicyEntry {
  method: string;
  path: string;
  class: RouteClass;
}

export const ROUTE_POLICY: RoutePolicyEntry[] = [
  { method: 'GET', path: '/api/v1/health', class: 'read' },
  { method: 'GET', path: '/api/v1/products', class: 'read' },
  { method: 'GET', path: '/api/v1/products/:id', class: 'read' },
  { method: 'POST', path: '/api/v1/products', class: 'mutation' },
  { method: 'PATCH', path: '/api/v1/products/:id', class: 'mutation' },
  { method: 'POST', path: '/api/v1/products/reorder', class: 'mutation' },
  { method: 'POST', path: '/api/v1/products/bulk/preview', class: 'preview' },
  { method: 'POST', path: '/api/v1/products/bulk/apply', class: 'mutation' },
  { method: 'GET', path: '/api/v1/categories', class: 'read' },
  { method: 'POST', path: '/api/v1/categories', class: 'mutation' },
  { method: 'PATCH', path: '/api/v1/categories/:id', class: 'mutation' },
  { method: 'DELETE', path: '/api/v1/categories/:id', class: 'mutation' },
  { method: 'POST', path: '/api/v1/categories/:id/subcategories', class: 'mutation' },
  { method: 'PATCH', path: '/api/v1/categories/:id/subcategories/:subId', class: 'mutation' },
  { method: 'DELETE', path: '/api/v1/categories/:id/subcategories/:subId', class: 'mutation' },
  { method: 'POST', path: '/api/v1/categories/:id/subcategories/reorder', class: 'mutation' },
  { method: 'GET', path: '/api/v1/storefront/bundles', class: 'read' },
  { method: 'PUT', path: '/api/v1/storefront/bundles', class: 'mutation' },
  { method: 'GET', path: '/api/v1/storefront/featured', class: 'read' },
  { method: 'PUT', path: '/api/v1/storefront/featured', class: 'mutation' },
  { method: 'GET', path: '/api/v1/media', class: 'read' },
  { method: 'POST', path: '/api/v1/media/intent', class: 'preview' },
  { method: 'POST', path: '/api/v1/media/upload', class: 'mutation' },
  { method: 'POST', path: '/api/v1/media/avif', class: 'mutation' },
  { method: 'GET', path: '/api/v1/changes', class: 'read' },
  { method: 'POST', path: '/api/v1/changes', class: 'mutation' },
  { method: 'PATCH', path: '/api/v1/changes/:id', class: 'mutation' },
  { method: 'DELETE', path: '/api/v1/changes/:id', class: 'mutation' },
  { method: 'POST', path: '/api/v1/import/preview', class: 'preview' },
  { method: 'POST', path: '/api/v1/import/apply', class: 'mutation' },
  { method: 'GET', path: '/api/v1/export', class: 'read' },
  { method: 'GET', path: '/api/v1/history', class: 'read' },
  { method: 'GET', path: '/api/v1/conflicts', class: 'read' },
  { method: 'POST', path: '/api/v1/conflicts/sync/now', class: 'mutation' },
  { method: 'PUT', path: '/api/v1/conflicts/sync/config', class: 'mutation' },
  { method: 'GET', path: '/api/v1/publication/status', class: 'read' },
  { method: 'POST', path: '/api/v1/publication/preflight', class: 'preview' },
  { method: 'POST', path: '/api/v1/publication/apply', class: 'mutation' },
  { method: 'GET', path: '/api/v1/publication/recovery', class: 'read' },
  { method: 'POST', path: '/api/v1/publication/recovery/restore', class: 'mutation' },
  { method: 'GET', path: '/api/v1/backup', class: 'read' },
  { method: 'POST', path: '/api/v1/backup/restore', class: 'mutation' },
  { method: 'POST', path: '/api/v1/backup/create', class: 'mutation' },
  { method: 'POST', path: '/api/v1/backup/prune', class: 'mutation' },
  { method: 'GET', path: '/api/v1/bootstrap', class: 'read' },
  { method: 'GET', path: '/api/v1/sync/status', class: 'read' },
  { method: 'POST', path: '/api/v1/sync/now', class: 'mutation' },
  { method: 'PUT', path: '/api/v1/sync/config', class: 'mutation' },
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

  return { class: 'read', exact: false };
}
