import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const widths = [200, 400, 600, 800, 1200, 1600, 2000];
const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, 'assets', 'images', 'originals');
const outRoot = path.join(repoRoot, 'assets', 'images', 'variants');

function listImages(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((e) => {
    const res = path.join(dir, e.name);
    if (e.isDirectory()) return listImages(res);
    return /\.(jpe?g|png)$/i.test(e.name) ? [res] : [];
  });
}

async function buildVariants(file) {
  const rel = path.relative(srcRoot, file);
  const base = path.basename(rel, path.extname(rel));
  const outDir = path.join(outRoot, path.dirname(rel));
  fs.mkdirSync(outDir, { recursive: true });
  const ext = path.extname(file).slice(1).toLowerCase() === 'png' ? 'png' : 'jpg';
  for (const w of widths) {
    const img = sharp(file)
      .resize({ width: w, withoutEnlargement: true, fit: 'inside' })
      .withMetadata(false);
    await img.toFormat('avif', { cqLevel: 33 }).toFile(path.join(outDir, `${base}-${w}.avif`));
    await img.toFormat('webp', { quality: 75 }).toFile(path.join(outDir, `${base}-${w}.webp`));
    await img.toFormat(ext, { quality: 75 }).toFile(path.join(outDir, `${base}-${w}.${ext}`));
  }
}

async function run() {
  if (process.env.SKIP_IMAGE_OPT === '1') {
    console.log('Skipping image generation');
    return;
  }
  if (!fs.existsSync(srcRoot)) return;
  const files = listImages(srcRoot);
  for (const f of files) {
    await buildVariants(f);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
