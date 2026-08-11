// Backfill stable product ids (plan 053/055 identity migration).
// Deterministic and idempotent: the id derives from the canonical identity
// (normalized name::description, the same key the import/parity flows use),
// so re-runs and parallel tools converge. Usage:
//   node --import tsx scripts/backfill-product-ids.mjs
//   REPO_ROOT=/path node --import tsx scripts/backfill-product-ids.mjs
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';

function resolveRepoRoot(): string {
  if (process.env.REPO_ROOT) return process.env.REPO_ROOT;
  const candidates = [process.cwd(), resolve(process.cwd(), '..', '..')];
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'data', 'product_data.json'))) return candidate;
  }
  return candidates[1] ?? process.cwd();
}

function normalizeIdentityPart(value: string): string {
  return String(value ?? '')
    .split(/\s+/)
    .join(' ')
    .trim()
    .toLowerCase();
}

export function stableProductId(name: string, description: string): string {
  const key = `${normalizeIdentityPart(name)}::${normalizeIdentityPart(description)}`;
  return `p-${createHash('sha1').update(key).digest('hex').slice(0, 12)}`;
}

const repoRoot = resolveRepoRoot();
const path = resolve(repoRoot, 'data', 'product_data.json');
const catalog = JSON.parse(readFileSync(path, 'utf-8'));

let added = 0;
const seen = new Set<string>();
for (const product of catalog.products) {
  if (!product || typeof product !== 'object') continue;
  if (!product.id) {
    product.id = stableProductId(product.name ?? '', product.description ?? '');
    added += 1;
  }
  if (seen.has(product.id)) {
    console.error(`Collision for id ${product.id} (${product.name}) — aborting without writing`);
    process.exit(1);
  }
  seen.add(product.id);
}

if (added === 0) {
  console.log('No products needed ids — catalog already has stable ids.');
  process.exit(0);
}

const tmp = `${path}.tmp`;
writeFileSync(tmp, JSON.stringify(catalog, null, 2), { encoding: 'utf-8', flush: true });
renameSync(tmp, path);
console.log(`Backfilled stable ids for ${added} products in ${path}`);
