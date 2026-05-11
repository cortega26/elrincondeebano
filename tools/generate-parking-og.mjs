import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

if (process.env.PREFLIGHT_SKIP_OG === '1') {
  console.log('PREFLIGHT_SKIP_OG=1: skipping parking OG image generation.');
  process.exit(0);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const WIDTH = 1200;
const HEIGHT = 1200;
const OUTPUT_DIR = path.join(rootDir, 'assets', 'images', 'og');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'parking.og.jpg');

function renderSvg() {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    WIDTH +
    '" height="' +
    HEIGHT +
    '" viewBox="0 0 ' +
    WIDTH +
    ' ' +
    HEIGHT +
    '" role="img" aria-label="Estacionamiento El Rincón de Ébano">' +
    '<defs>' +
    '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="#005b4f"/>' +
    '<stop offset="100%" stop-color="#00382f"/>' +
    '</linearGradient>' +
    '<radialGradient id="halo" cx="0.5" cy="0.4" r="0.7">' +
    '<stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.15"/>' +
    '<stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>' +
    '</radialGradient>' +
    '</defs>' +
    '<rect width="' +
    WIDTH +
    '" height="' +
    HEIGHT +
    '" fill="url(#bg)"/>' +
    '<rect width="' +
    WIDTH +
    '" height="' +
    HEIGHT +
    '" fill="url(#halo)"/>' +
    /* Circle with car icon */
    '<circle cx="600" cy="420" r="240" fill="#0E1A2E" fill-opacity="0.28"/>' +
    '<circle cx="600" cy="420" r="240" fill="none" stroke="#FFFFFF" stroke-opacity="0.20" stroke-width="6"/>' +
    /* Car icon (Lucide "car") */
    '<g transform="translate(600 420) scale(12) translate(-12 -12)" color="#FFFFFF" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/>' +
    '<circle cx="6.5" cy="16.5" r="2.5"/>' +
    '<circle cx="16.5" cy="16.5" r="2.5"/>' +
    '</g>' +
    /* Badge */
    '<rect x="300" y="788" width="600" height="160" rx="80" fill="#0E1A2E" fill-opacity="0.5"/>' +
    '<rect x="312" y="800" width="576" height="136" rx="68" fill="none" stroke="#FFFFFF" stroke-opacity="0.30" stroke-width="3"/>' +
    '<text x="600" y="900" text-anchor="middle" fill="#FFFFFF" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="68" font-weight="700" letter-spacing="3" dominant-baseline="middle" style="paint-order: stroke; stroke: rgba(10, 16, 28, 0.35); stroke-width: 2px;">ESTACIONAMIENTO</text>' +
    /* Subtitle */
    '<text x="600" y="1010" text-anchor="middle" fill="#FFFFFF" fill-opacity="0.80" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="400" letter-spacing="1" dominant-baseline="middle">El Rincón de Ébano</text>' +
    /* Border */
    '<rect x="10" y="10" width="1180" height="1180" rx="24" fill="none" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="4"/>' +
    '</svg>'
  );
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const svg = renderSvg();
  const rendered = await sharp(Buffer.from(svg))
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'center' })
    .jpeg({ quality: 88, progressive: true, mozjpeg: true })
    .toBuffer();

  if (fs.existsSync(OUTPUT_PATH)) {
    const existing = fs.readFileSync(OUTPUT_PATH);
    if (existing.equals(rendered)) {
      console.log('Parking OG image unchanged, skipping write.');
      return;
    }
  }

  fs.writeFileSync(OUTPUT_PATH, rendered);
  console.log('Generated ' + path.relative(rootDir, OUTPUT_PATH));
}

main().catch(function (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
