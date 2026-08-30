// Plan 119: fill missing image variants from the canonical (shipped) image
// when the originals tree is absent. The variant pipeline reads
// assets/images/originals/ which is not committed, so products added later
// (e.g. Lomo-Ahumado-Darmax) ship the full-size image with no srcset. This
// step derives w200..w1200 webp/avif variants from the product's own
// image_path and records them in data/product_data.json (image_variants).
'use strict';

// Shared helpers per plan 156 — via tools/utils/image-pipeline.mjs
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const {
  REPO_ROOT,
  GAP_FILL_WIDTHS: WIDTHS,
  GAP_FILL_EXTENSIONS: VARIANT_EXTENSIONS,
  ensureDir,
  writeBufferIfChanged,
} = require('./utils/constants.js');

const PRODUCTS_JSON = path.join(REPO_ROOT, 'data', 'product_data.json');

function loadProducts() {
  const raw = JSON.parse(fs.readFileSync(PRODUCTS_JSON, 'utf-8'));
  return { catalog: raw, products: raw.products };
}

function variantExists(variantsRoot, imagePath, width, ext) {
  const rel = path.dirname(imagePath.replace(/^assets\/images\//, ''));
  const base = path.basename(imagePath, path.extname(imagePath));
  const file = path.join(variantsRoot, `w${width}`, 'images', rel, `${base}.${ext}`);
  return fs.existsSync(file);
}

async function buildVariant(opts) {
  // Convention (plan 119): variants keep the ORIGINAL file name inside
  // w<width>/images/<category>/ — buildVariantAssetPath + publicAssetExists
  // derive the srcset from file presence, no width suffix allowed.
  const { source, variantsRoot, relDir, base, width, ext } = opts;
  const outDir = path.join(variantsRoot, `w${width}`, 'images', relDir);
  ensureDir(outDir);
  const img = sharp(source)
    .resize({ width, withoutEnlargement: true, fit: 'inside' })
    .withMetadata(false);
  const out = path.join(outDir, `${base}.${ext}`);
  // Use shared byte-compare helper for determinism (keeps output byte-identical)
  const buffer =
    ext === 'avif'
      ? await img.toFormat('avif', { cqLevel: 33 }).toBuffer()
      : await img.toFormat('webp', { quality: 75 }).toBuffer();
  writeBufferIfChanged(out, buffer);
}

async function run() {
  if (process.env.SKIP_IMAGE_OPT === '1') {
    console.log('Skipping variant gap-fill');
    return;
  }
  const { products } = loadProducts();
  const variantsRoot = path.join(REPO_ROOT, 'assets', 'images', 'variants');
  let filled = 0;
  let updated = 0;

  for (const product of products) {
    const imagePath = product.image_path || '';
    if (!imagePath.startsWith('assets/images/')) continue;
    const source = path.join(REPO_ROOT, imagePath);
    if (!fs.existsSync(source)) continue;

    const relDir = path.dirname(imagePath.replace(/^assets\/images\//, ''));
    const base = path.basename(imagePath, path.extname(imagePath));
    const missing = WIDTHS.filter(
      (w) => !VARIANT_EXTENSIONS.some((ext) => variantExists(variantsRoot, imagePath, w, ext))
    );
    if (missing.length === 0) continue;

    const built = [];
    for (const w of missing) {
      for (const ext of VARIANT_EXTENSIONS) {
        if (variantExists(variantsRoot, imagePath, w, ext)) continue;
        await buildVariant({ source, variantsRoot, relDir, base, width: w, ext });
        built.push(`${w}.${ext}`);
      }
    }
    if (built.length > 0) {
      filled += built.length;
      updated += 1;
      console.log(`[gap-fill] ${imagePath}: +${built.join(', ')}`);
    }
  }

  console.log(`Variant gap-fill: ${filled} variants generated for ${updated} products.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
