import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const constants = require('./constants.js');

export const REPO_ROOT = constants.REPO_ROOT;
export const PRODUCT_IMAGE_WIDTHS = constants.PRODUCT_IMAGE_WIDTHS;
export const HERO_WIDTHS = constants.HERO_WIDTHS;
export const HERO_BASE_WIDTH = constants.HERO_BASE_WIDTH;
export const PRODUCT_IMAGE_SIZES = constants.PRODUCT_IMAGE_SIZES;
export const GAP_FILL_WIDTHS = constants.GAP_FILL_WIDTHS;
export const GAP_FILL_EXTENSIONS = constants.GAP_FILL_EXTENSIONS;
export const GENERATE_IMAGE_WIDTHS = constants.GENERATE_IMAGE_WIDTHS;
export const OG_WIDTH = constants.OG_WIDTH;
export const OG_HEIGHT = constants.OG_HEIGHT;
export const OG_TEMPLATE_VERSION = constants.OG_TEMPLATE_VERSION;
export const OG_JPG_QUALITY = constants.OG_JPG_QUALITY;
export const HOME_OG_QUALITY = constants.HOME_OG_QUALITY;
export const HOME_OG_SIZE = constants.HOME_OG_SIZE;
export const SUPPORTED_RASTER_EXTENSIONS = constants.SUPPORTED_RASTER_EXTENSIONS;
export const CRITICAL_UI_ASSETS = constants.CRITICAL_UI_ASSETS;
export const CFIMG_THUMB = constants.CFIMG_THUMB;

// ---------------------------------------------------------------------------
// Repo / path helpers + FS helpers — re-exported from constants.js for CJS compat
// Single source is constants.js (sync), re-exported here for ESM consumers
// ---------------------------------------------------------------------------
export const resolveRepoRoot = constants.resolveRepoRoot;
export const resolveFromRepo = constants.resolveFromRepo;
export const ensureDir = constants.ensureDir;
export const writeBufferIfChanged = constants.writeBufferIfChanged;
export const writeTextIfChanged = constants.writeTextIfChanged;
export const copyIfChanged = constants.copyIfChanged;
export const fileSha256 = constants.fileSha256;

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJsonIfChanged(filePath, payload) {
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  return writeTextIfChanged(filePath, serialized);
}

// ---------------------------------------------------------------------------
// Image helpers — normalize / derivation (extracted from sync-avif-assets.js)
// Re-exported from constants.js for single-source truth (CJS + ESM)
// ---------------------------------------------------------------------------
export const normalizeAssetPath = constants.normalizeAssetPath;
export const supportsAvifConversion = constants.supportsAvifConversion;
export const deriveAvifPath = constants.deriveAvifPath;

// Variant path helpers (gap-fill / generate-images)
export function variantExists(variantsRoot, imagePath, width, ext) {
  const rel = path.dirname(imagePath.replace(/^assets\/images\//, ''));
  const base = path.basename(imagePath, path.extname(imagePath));
  const file = path.join(variantsRoot, `w${width}`, 'images', rel, `${base}.${ext}`);
  return fs.existsSync(file);
}

export function buildVariantPath({ variantsRoot, imagePath, width, ext }) {
  const rel = path.dirname(imagePath.replace(/^assets\/images\//, ''));
  const base = path.basename(imagePath, path.extname(imagePath));
  const outDir = path.join(variantsRoot, `w${width}`, 'images', rel);
  return { outDir, outPath: path.join(outDir, `${base}.${ext}`) };
}

// ---------------------------------------------------------------------------
// Sharp helpers — load → resize → convert → write-if-changed
// Re-exports sharp lazily so callers can do `import sharp from 'sharp'` or use helper.
// ---------------------------------------------------------------------------
export async function loadSharp() {
  const mod = await import('sharp');
  return mod.default || mod;
}

/**
 * Render a sharp pipeline to a buffer with given options.
 * Keeps the call-site's exact formatOptions by passing them through.
 */
export async function renderSharpBuffer({ input, resize, format, formatOptions, density }) {
  const sharp = await loadSharp();
  let pipeline = typeof density === 'number' ? sharp(input, { density }) : sharp(input);
  if (resize) {
    pipeline = pipeline.resize(resize);
  }
  if (format && formatOptions) {
    pipeline = pipeline[format](formatOptions);
  } else if (format) {
    pipeline = pipeline[format]();
  }
  // Ensure without metadata for determinism
  pipeline = pipeline.withMetadata ? pipeline.withMetadata(false) : pipeline;
  return pipeline.toBuffer();
}

/**
 * Single-decode then clone pattern for generate-images.mjs
 * Decodes once, then clones for each width/format to avoid re-decode.
 */
export async function generateVariantsSingleDecode({ sourcePath, widths, outDir, base, formats }) {
  const sharp = await loadSharp();
  const baseImage = sharp(sourcePath).withMetadata(false);
  // We will produce buffers per width/format by cloning.
  // Note: sharp requires .clone() per output to avoid mutating the pipeline.
  const results = [];
  for (const w of widths) {
    for (const fmt of formats) {
      const outputPath = path.join(outDir, `${base}-${w}.${fmt.ext}`);
      if (fs.existsSync(outputPath) && !fmt.force) {
        results.push({ outputPath, skipped: true });
        continue;
      }
      const pipeline = baseImage
        .clone()
        .resize({ width: w, withoutEnlargement: true, fit: 'inside' })
        .toFormat(fmt.format, fmt.options);
      const buffer = await pipeline.toBuffer();
      const changed = writeBufferIfChanged(outputPath, buffer);
      results.push({ outputPath, changed, skipped: false });
    }
  }
  return results;
}

export function getProductsJsonPath(override) {
  if (override && String(override).trim()) {
    return path.resolve(String(override).trim());
  }
  return path.join(REPO_ROOT, 'data', 'product_data.json');
}
