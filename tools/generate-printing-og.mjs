import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  REPO_ROOT as rootDir,
  HOME_OG_SIZE as IMAGE_SIZE,
  ensureDir,
  writeBufferIfChanged,
} from './utils/image-pipeline.mjs';
import { buildLabel, wrapLabelLines, labelStyleForLines } from './utils/category-og.mjs';

if (process.env.PREFLIGHT_SKIP_OG === '1') {
  console.log('PREFLIGHT_SKIP_OG=1: skipping printing OG image generation.');
  process.exit(0);
}

const SOURCE_PATH = path.join(rootDir, 'assets', 'images', 'og', 'logo.png');
const OUTPUT_DIR = path.join(rootDir, 'assets', 'images', 'og');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'printing.og.jpg');

// Plan 249: the printing card is the brand logo base plus a caption band
// composed with the category-OG text helpers (same dark translucent band,
// white caps style and label wrapping as tools/utils/category-og.mjs), so
// the share image is surface-specific instead of a bare logo resize.
const TITLE = 'Impresiones y fotocopias';
const SUBTITLE = 'COTIZA EN SEGUNDOS · ENTREGA EN EL EDIFICIO';
const BAND = { x: 60, y: 780, width: 1080, height: 360, radius: 36 };
const TITLE_CENTER_Y = 915;
const SUBTITLE_BASELINE_Y = 1065;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildCaptionSvg() {
  const label = buildLabel(TITLE, 'impresiones');
  const lines = wrapLabelLines(label);
  const [fontSize, lineHeight] = labelStyleForLines(lines);
  const startY = TITLE_CENTER_Y - ((lines.length - 1) * lineHeight) / 2;
  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="${IMAGE_SIZE / 2}" y="${(startY + index * lineHeight).toFixed(1)}">${escapeHtml(line)}</tspan>`
    )
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" ` +
    `viewBox="0 0 ${IMAGE_SIZE} ${IMAGE_SIZE}" role="img" aria-label="${escapeHtml(TITLE)}">` +
    `<rect x="${BAND.x}" y="${BAND.y}" width="${BAND.width}" height="${BAND.height}" rx="${BAND.radius}" fill="#0E1A2E"/>` +
    `<rect x="${BAND.x + 10}" y="${BAND.y + 10}" width="${BAND.width - 20}" height="${BAND.height - 20}" rx="${BAND.radius - 10}" fill="none" stroke="#FFFFFF" stroke-opacity="0.36" stroke-width="3"/>` +
    `<text x="${IMAGE_SIZE / 2}" text-anchor="middle" fill="#FFFFFF" ` +
    `font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${fontSize}" ` +
    `font-weight="700" letter-spacing="2" dominant-baseline="middle" ` +
    `style="paint-order: stroke; stroke: rgba(10, 16, 28, 0.35); stroke-width: 2px;">${tspans}</text>` +
    `<text x="${IMAGE_SIZE / 2}" y="${SUBTITLE_BASELINE_Y}" text-anchor="middle" fill="#FFFFFF" fill-opacity="0.92" ` +
    `font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="600" letter-spacing="3">${escapeHtml(SUBTITLE)}</text>` +
    '</svg>'
  );
}

async function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    throw new Error(`Missing printing OG source image: ${SOURCE_PATH}`);
  }

  ensureDir(OUTPUT_DIR);

  const captionLayer = await sharp(Buffer.from(buildCaptionSvg()), { density: 300 })
    .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: 'cover' })
    .png()
    .toBuffer();

  const rendered = await sharp(SOURCE_PATH)
    .resize(IMAGE_SIZE, IMAGE_SIZE, {
      fit: 'cover',
      position: 'center',
      withoutEnlargement: false,
    })
    .composite([{ input: captionLayer, top: 0, left: 0 }])
    .jpeg({
      quality: 95,
      progressive: false,
      mozjpeg: true,
      chromaSubsampling: '4:4:4',
    })
    .toBuffer();

  const changed = writeBufferIfChanged(OUTPUT_PATH, rendered);
  if (!changed) {
    console.log(`Printing OG image unchanged, skipping write.`);
    return;
  }

  console.log(`Generated ${path.relative(rootDir, OUTPUT_PATH)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
