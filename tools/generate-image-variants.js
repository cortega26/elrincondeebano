// Generate responsive product image variants and thumbnails, then augment product_data.json
// Requires: sharp (already in devDependencies)

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const crypto = require('crypto');

// Paths
const REPO_ROOT = path.resolve(__dirname, '..');
const PRODUCTS_JSON = path.resolve(
  process.env.USERPROFILE || process.env.HOME || '',
  'OneDrive',
  'Tienda Ebano',
  'data',
  'product_data.json'
);
const IMG_ROOT = path.resolve(REPO_ROOT, 'assets', 'images');
const OUT_ROOT = path.join(IMG_ROOT, 'variants');
const MANIFEST_PATH = path.join(OUT_ROOT, 'manifest.json');

const CARD_WIDTHS = [200, 320, 400, 480, 640];
const THUMB_SIZES = [100, 200]; // square thumbs (1x, 2x)

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function fileHash(absPath) {
  const buf = fs.readFileSync(absPath);
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveManifest(m) {
  ensureDir(OUT_ROOT);
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2));
}

async function generateVariantsFor(srcRel, manifest, seenSet) {
  const srcAbs = path.resolve(REPO_ROOT, srcRel);
  if (!fs.existsSync(srcAbs)) return { variants: [], thumb: null };

  const relDir = path.dirname(srcRel).replace(/^assets[\\\/](?:images[\\\/])?/, '');
  const baseName = path.basename(srcRel);
  const key = srcRel.replace(/\\/g, '/');
  const hash = fileHash(srcAbs);
  const previous = manifest[key];

  const outVariants = [];

  // Card widths (keep aspect, only width constraint)
  for (const w of CARD_WIDTHS) {
    const outDir = path.join(OUT_ROOT, `w${w}`, relDir);
    ensureDir(outDir);
    const outAbs = path.join(outDir, baseName);
    if (
      process.env.FULL_REGEN === '1' ||
      !fs.existsSync(outAbs) ||
      !previous ||
      previous.hash !== hash
    ) {
      await sharp(srcAbs).resize({ width: w, withoutEnlargement: true }).toFile(outAbs);
    }
    const outRel = path.posix.join(
      '/assets/images/variants',
      `w${w}`,
      relDir.split(path.sep).join('/'),
      baseName
    );
    outVariants.push({ url: outRel, width: w });
  }

  // Thumbnail squares (1x/2x) - separate 'thumbs' namespace to avoid collisions with card variants
  const thumbVariants = [];
  for (const s of THUMB_SIZES) {
    const outThumbDir = path.join(OUT_ROOT, 'thumbs', `w${s}`, relDir);
    ensureDir(outThumbDir);
    const outThumbAbs = path.join(outThumbDir, baseName);
    if (
      process.env.FULL_REGEN === '1' ||
      !fs.existsSync(outThumbAbs) ||
      !previous ||
      previous.hash !== hash
    ) {
      await sharp(srcAbs)
        .resize(s, s, { fit: 'cover', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(outThumbAbs);
    }
    const rel = path.posix.join(
      '/assets/images/variants',
      'thumbs',
      `w${s}`,
      relDir.split(path.sep).join('/'),
      baseName
    );
    thumbVariants.push({ url: rel, width: s });
  }
  const thumbRel = thumbVariants.find((v) => v.width === 100)?.url || thumbVariants[0]?.url || null;

  manifest[key] = { hash, updated: Date.now() };
  if (seenSet) {
    seenSet.add(key);
  }
  return { variants: outVariants, thumb: thumbRel, thumbVariants };
}

async function run() {
  if (!fs.existsSync(PRODUCTS_JSON)) {
    console.error('product_data.json not found at', PRODUCTS_JSON);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(PRODUCTS_JSON, 'utf8'));
  const products = Array.isArray(data.products) ? data.products : data;
  const manifest = loadManifest();
  const seen = new Set();

  for (const p of products) {
    try {
      const srcRel = String(p.image_path || '').replace(/^\//, '');
      if (!srcRel) continue;
      const { variants, thumb, thumbVariants } = await generateVariantsFor(srcRel, manifest, seen);
      if (variants.length) p.image_variants = variants;
      if (thumb) p.thumbnail_path = thumb;
      if (thumbVariants && thumbVariants.length) p.thumbnail_variants = thumbVariants;
    } catch (e) {
      console.warn('Variant generation failed for', p.image_path, e.message);
    }
  }

  // Optional orphan cleanup (remove manifest entries + files for images not present)
  if (process.env.CLEAN_ORPHANS === '1') {
    for (const key of Object.keys(manifest)) {
      if (seen.has(key)) continue;
      const relDir = path.dirname(key).replace(/^assets[\\\/](?:images[\\\/])?/, '');
      const baseName = path.basename(key);
      for (const w of CARD_WIDTHS) {
        const variantPath = path.join(OUT_ROOT, `w${w}`, relDir, baseName);
        try {
          if (fs.existsSync(variantPath)) fs.unlinkSync(variantPath);
        } catch {}
      }
      for (const s of THUMB_SIZES) {
        const thumbPath = path.join(OUT_ROOT, 'thumbs', `w${s}`, relDir, baseName);
        try {
          if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
        } catch {}
      }
      delete manifest[key];
    }
  }

  // Bump version suffix to invalidate caches downstream
  const version = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14);
  if (data.version) data.version += `-v${version}`;
  else data.version = `v${version}`;
  fs.writeFileSync(PRODUCTS_JSON, JSON.stringify(data, null, 2));
  console.log('Updated', PRODUCTS_JSON, 'with variants and thumbnails');
  saveManifest(manifest);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
