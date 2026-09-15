'use strict';

// Shared helpers per plan 156 — consolidate via tools/utils/image-pipeline.mjs
// CJS tools share constants.js (single source with image-pipeline.mjs)
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const {
  REPO_ROOT,
  CRITICAL_UI_ASSETS,
  normalizeAssetPath,
  supportsAvifConversion,
  deriveAvifPath,
  ensureDir,
  writeBufferIfChanged,
} = require('./utils/constants.js');

const DEFAULT_PRODUCTS_JSON = path.join(REPO_ROOT, 'data', 'product_data.json');

function resolveProductsJsonPath() {
  const override = process.env.PRODUCTS_JSON;
  if (override && override.trim()) {
    return path.resolve(override.trim());
  }
  return DEFAULT_PRODUCTS_JSON;
}

function ensureParentDir(filePath) {
  ensureDir(path.dirname(filePath));
}

async function ensureAvifAsset({
  repoRoot = REPO_ROOT,
  sourcePath,
  targetPath,
  force = false,
  quality = 50,
  effort = 4,
} = {}) {
  const normalizedSource = normalizeAssetPath(sourcePath);
  const normalizedTarget = normalizeAssetPath(targetPath) || deriveAvifPath(normalizedSource);

  if (!normalizedSource || !normalizedTarget) {
    return { generated: false, targetPath: normalizedTarget || '' };
  }

  const sourceAbsolutePath = path.join(repoRoot, normalizedSource);
  const targetAbsolutePath = path.join(repoRoot, normalizedTarget);

  if (!fs.existsSync(sourceAbsolutePath)) {
    throw new Error(`Missing source asset: ${normalizedSource}`);
  }

  if (!force && fs.existsSync(targetAbsolutePath)) {
    return { generated: false, targetPath: normalizedTarget };
  }

  ensureParentDir(targetAbsolutePath);
  // Use shared helper's byte-compare write via buffer (deterministic, keeps outputs identical)
  const buffer = await sharp(sourceAbsolutePath).avif({ quality, effort }).toBuffer();
  const changed = writeBufferIfChanged(targetAbsolutePath, buffer);
  return { generated: changed, targetPath: normalizedTarget };
}

async function syncProductCatalogAvif({
  productsJsonPath = resolveProductsJsonPath(),
  repoRoot = REPO_ROOT,
  force = false,
} = {}) {
  if (!fs.existsSync(productsJsonPath)) {
    throw new Error(`Missing product catalog: ${productsJsonPath}`);
  }

  const payload = JSON.parse(fs.readFileSync(productsJsonPath, 'utf8'));
  const products = Array.isArray(payload?.products) ? payload.products : [];
  const stats = {
    totalProducts: products.length,
    updatedProducts: 0,
    generatedAssets: 0,
    linkedExistingAssets: 0,
    skippedProducts: 0,
  };

  // Plan 186: bounded pool for the per-product encodes (was one await at a
  // time — wall time was the sum of all encodes). Pure w.r.t. shared state:
  // each task touches only its own product; mutations and stats apply
  // sequentially below. A task failure still fails the run (first error,
  // after in-flight tasks settle) — same exit contract as the serial loop.
  const { runTasksBounded } = await import('./run-parallel.mjs');
  const os = require('node:os');
  const jobs = [];
  for (const product of products) {
    const imagePath = normalizeAssetPath(product?.image_path);
    if (!supportsAvifConversion(imagePath)) {
      stats.skippedProducts += 1;
      continue;
    }

    const currentAvifPath = normalizeAssetPath(product?.image_avif_path);
    const targetAvifPath = currentAvifPath || deriveAvifPath(imagePath);
    if (!targetAvifPath) {
      stats.skippedProducts += 1;
      continue;
    }
    jobs.push({ product, currentAvifPath, targetAvifPath, imagePath });
  }

  const outcomes = await runTasksBounded(
    jobs.map((job) => async () => ({
      job,
      result: await ensureAvifAsset({
        repoRoot,
        sourcePath: job.imagePath,
        targetPath: job.targetAvifPath,
        force,
      }),
    })),
    os.cpus().length
  );

  for (const { job, result } of outcomes) {
    const { product, currentAvifPath, targetAvifPath } = job;
    const { generated } = result;

    if (product.image_avif_path !== targetAvifPath) {
      product.image_avif_path = targetAvifPath;
      stats.updatedProducts += 1;
    }

    if (generated) {
      stats.generatedAssets += 1;
    } else if (!currentAvifPath) {
      stats.linkedExistingAssets += 1;
    }
  }

  // Plan 186: write-if-changed — an unconditional rewrite bumps the catalog
  // mtime on every build and invalidates downstream mtime caches for nothing.
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  let current = null;
  try {
    current = fs.readFileSync(productsJsonPath, 'utf8');
  } catch {
    // Missing/unreadable: fall through to the write below.
  }
  if (current !== serialized) {
    fs.writeFileSync(productsJsonPath, serialized, 'utf8');
  }
  return stats;
}

async function syncCriticalUiAvifAssets({ repoRoot = REPO_ROOT, force = false } = {}) {
  const stats = {
    totalAssets: CRITICAL_UI_ASSETS.length,
    generatedAssets: 0,
  };

  for (const assetPath of CRITICAL_UI_ASSETS) {
    const { generated } = await ensureAvifAsset({ repoRoot, sourcePath: assetPath, force });
    if (generated) {
      stats.generatedAssets += 1;
    }
  }

  return stats;
}

async function run() {
  const force = process.env.FULL_REGEN === '1';
  const catalogStats = await syncProductCatalogAvif({ force });
  const uiStats = await syncCriticalUiAvifAssets({ force });

  console.log(
    `Synced AVIF assets: ${catalogStats.updatedProducts} catalog link(s) updated, ` +
      `${catalogStats.generatedAssets} catalog asset(s) generated, ` +
      `${catalogStats.linkedExistingAssets} existing catalog AVIF asset(s) linked, ` +
      `${uiStats.generatedAssets}/${uiStats.totalAssets} critical UI asset(s) generated.`
  );
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  CRITICAL_UI_ASSETS,
  deriveAvifPath,
  ensureAvifAsset,
  resolveProductsJsonPath,
  supportsAvifConversion,
  syncCriticalUiAvifAssets,
  syncProductCatalogAvif,
};
