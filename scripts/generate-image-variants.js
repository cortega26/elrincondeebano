// Generate responsive product image variants and thumbnails, then augment product_data.json
// Requires: sharp (already in devDependencies)

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const crypto = require('crypto');

// Paths
const REPO_ROOT = path.resolve(__dirname, '..');
const PRODUCTS_JSON = path.resolve(process.env.USERPROFILE || process.env.HOME || '', 'OneDrive', 'Tienda Ebano', '_products', 'product_data.json');
const IMG_ROOT = path.resolve(REPO_ROOT, 'assets', 'images');
const OUT_ROOT = path.join(IMG_ROOT, 'variants');

const CARD_WIDTHS = [200, 320, 400, 480, 640];
const THUMB_SIZES = [100, 200]; // square thumbs (1x, 2x)

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

async function generateVariantsFor(srcRel) {
  const srcAbs = path.resolve(REPO_ROOT, srcRel);
  if (!fs.existsSync(srcAbs)) return { variants: [], thumb: null };

  const relDir = path.dirname(srcRel).replace(/^assets[\\/]/, '');
  const baseName = path.basename(srcRel);

  const outVariants = [];

  // Card widths (keep aspect, only width constraint)
  for (const w of CARD_WIDTHS) {
    const outDir = path.join(OUT_ROOT, `w${w}`, relDir);
    ensureDir(outDir);
    const outAbs = path.join(outDir, baseName);
    if (!fs.existsSync(outAbs)) {
      await sharp(srcAbs).resize({ width: w, withoutEnlargement: true }).toFile(outAbs);
    }
    const outRel = path.posix.join('/assets/images/variants', `w${w}`, relDir.split(path.sep).join('/'), baseName);
    outVariants.push({ url: outRel, width: w });
  }

  // Thumbnail squares (1x/2x) - separate 'thumbs' namespace to avoid collisions with w200 card variants\n  const thumbVariants = [];\n  for (const s of THUMB_SIZES) {\n    const outThumbDir = path.join(OUT_ROOT, 'thumbs', w, relDir);\n    ensureDir(outThumbDir);\n    const outThumbAbs = path.join(outThumbDir, baseName);\n    if (!fs.existsSync(outThumbAbs)) {\n      await sharp(srcAbs)\n        .resize(s, s, { fit: 'cover', withoutEnlargement: true })\n        .webp({ quality: 80 })\n        .toFile(outThumbAbs);\n    }\n    const rel = path.posix.join('/assets/images/variants', 'thumbs', w, relDir.split(path.sep).join('/'), baseName);\n    thumbVariants.push({ url: rel, width: s });\n  }
  const thumbRel = thumbVariants.find(v => v.width === 100)?.url || thumbVariants[0]?.url || null;

  return { variants: outVariants, thumb: thumbRel, thumbVariants };
}

async function run() {
  if (!fs.existsSync(PRODUCTS_JSON)) {
    console.error('product_data.json not found at', PRODUCTS_JSON);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(PRODUCTS_JSON, 'utf8'));
  const products = Array.isArray(data.products) ? data.products : data;

  for (const p of products) {
    try {
      const srcRel = String(p.image_path || '').replace(/^\//, '');
      if (!srcRel) continue;
      const { variants, thumb, thumbVariants } = await generateVariantsFor(srcRel);
      if (variants.length) p.image_variants = variants;
      if (thumb) p.thumbnail_path = thumb;
      if (thumbVariants && thumbVariants.length) p.thumbnail_variants = thumbVariants;
    } catch (e) {
      console.warn('Variant generation failed for', p.image_path, e.message);
    }
  }

  // Bump version suffix to invalidate caches downstream
  const version = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  if (data.version) data.version += `-v${version}`; else data.version = `v${version}`;
  fs.writeFileSync(PRODUCTS_JSON, JSON.stringify(data, null, 2));
  console.log('Updated', PRODUCTS_JSON, 'with variants and thumbnails');
}

run().catch(e => { console.error(e); process.exit(1); });
