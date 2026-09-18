// Backfill stable product ids (plan 053/055 identity migration).
// Deterministic and idempotent: the id derives from the canonical identity
// (normalized name::description, the same key the import/parity flows use),
// so re-runs and parallel tools converge. Usage:
//   node --import tsx scripts/backfill-product-ids.mjs
//   REPO_ROOT=/path node --import tsx scripts/backfill-product-ids.mjs
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeJsonFileAtomic } from '../src/server/services/atomicFileWriter.ts';
import { productCatalogSchema } from '../src/shared/schemas/product.ts';
// Plan 195: identity token step shared with the import flow (single
// implementation — backfill and import must resolve the same key).
import { normalizeToken } from '../src/shared/identity.ts';

function resolveRepoRoot(): string {
  if (process.env.REPO_ROOT) return process.env.REPO_ROOT;
  const candidates = [process.cwd(), resolve(process.cwd(), '..', '..')];
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'data', 'product_data.json'))) return candidate;
  }
  return candidates[1] ?? process.cwd();
}

export function stableProductId(name: string, description: string): string {
  const key = `${normalizeToken(name)}::${normalizeToken(description)}`;
  return `p-${createHash('sha1').update(key).digest('hex').slice(0, 12)}`;
}

export function backfillCatalogIds(catalog: { products: Array<Record<string, unknown>> }): {
  added: number;
} {
  let added = 0;
  const seen = new Set<unknown>();
  for (const product of catalog.products) {
    if (!product || typeof product !== 'object') continue;
    if (!product.id) {
      product.id = stableProductId(String(product.name ?? ''), String(product.description ?? ''));
      added += 1;
    }
    if (seen.has(product.id)) {
      throw new Error(
        `Collision for id ${String(product.id)} (${String(product.name)}) — aborting without writing`
      );
    }
    seen.add(product.id);
  }
  return { added };
}

function main(): void {
  const repoRoot = resolveRepoRoot();
  const path = resolve(repoRoot, 'data', 'product_data.json');
  const catalog = JSON.parse(readFileSync(path, 'utf-8'));

  let added: number;
  try {
    added = backfillCatalogIds(catalog).added;
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  if (added === 0) {
    console.log('No products needed ids — catalog already has stable ids.');
    return;
  }

  // Plan 196: validate before writing (fail closed) and persist through the
  // canonical atomic writer (tmp + rename + backup) instead of bare tmp+rename.
  const parsed = productCatalogSchema.safeParse(catalog);
  if (!parsed.success) {
    console.error(
      `Backfill produced an invalid catalog, aborting without writing: ${parsed.error.issues
        .map((i) => i.message)
        .join('; ')}`
    );
    process.exit(1);
  }
  writeJsonFileAtomic(path, parsed.data, { maxBackups: 5, filePrefix: 'product_data.json' });
  console.log(`Backfilled stable ids for ${added} products in ${path}`);
}

// Plan 196: importing this module must have no side effects (a test runner
// importing it must not read or write the catalog).
const invokedAsMain =
  (process.argv[1] ?? '') !== '' &&
  import.meta.url === pathToFileURL(process.argv[1] as string).href;
if (invokedAsMain) {
  main();
}
