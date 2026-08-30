import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  GENERATE_IMAGE_WIDTHS as widths,
  REPO_ROOT as repoRoot,
  ensureDir,
  writeBufferIfChanged,
} from './utils/image-pipeline.mjs';

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
  ensureDir(outDir);
  const ext = path.extname(file).slice(1).toLowerCase() === 'png' ? 'png' : 'jpg';
  // Single-decode then clone — decode once, clone per variant (plan 156 PERF fix)
  const baseImage = sharp(file).withMetadata(false);
  for (const w of widths) {
    const outAvif = path.join(outDir, `${base}-${w}.avif`);
    const outWebp = path.join(outDir, `${base}-${w}.webp`);
    const outFallback = path.join(outDir, `${base}-${w}.${ext}`);

    // skip-if-exists with byte-compare write (keeps outputs identical, avoids redundant encodes)
    if (!fs.existsSync(outAvif)) {
      const buf = await baseImage
        .clone()
        .resize({ width: w, withoutEnlargement: true, fit: 'inside' })
        .toFormat('avif', { cqLevel: 33 })
        .toBuffer();
      writeBufferIfChanged(outAvif, buf);
    }
    if (!fs.existsSync(outWebp)) {
      const buf = await baseImage
        .clone()
        .resize({ width: w, withoutEnlargement: true, fit: 'inside' })
        .toFormat('webp', { quality: 75 })
        .toBuffer();
      writeBufferIfChanged(outWebp, buf);
    }
    if (!fs.existsSync(outFallback)) {
      const buf = await baseImage
        .clone()
        .resize({ width: w, withoutEnlargement: true, fit: 'inside' })
        .toFormat(ext, { quality: 75 })
        .toBuffer();
      writeBufferIfChanged(outFallback, buf);
    }
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
