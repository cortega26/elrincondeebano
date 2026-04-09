import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

if (process.env.PREFLIGHT_SKIP_OG === '1') {
  console.log('PREFLIGHT_SKIP_OG=1: skipping home OG image generation.');
  process.exit(0);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const SOURCE_PATH = path.join(rootDir, 'assets', 'images', 'web', 'logo.webp');
const OUTPUT_DIR = path.join(rootDir, 'assets', 'images', 'og');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'home.og.jpg');
const IMAGE_SIZE = 1200;

async function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    throw new Error(`Missing home OG source image: ${SOURCE_PATH}`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const rendered = await sharp(SOURCE_PATH)
    .resize(IMAGE_SIZE, IMAGE_SIZE, {
      fit: 'cover',
      position: 'center',
      withoutEnlargement: false,
    })
    .jpeg({
      quality: 88,
      progressive: true,
      mozjpeg: true,
    })
    .toBuffer();

  if (fs.existsSync(OUTPUT_PATH)) {
    const existing = fs.readFileSync(OUTPUT_PATH);
    if (existing.equals(rendered)) {
      console.log(`Home OG image unchanged, skipping write.`);
      return;
    }
  }

  fs.writeFileSync(OUTPUT_PATH, rendered);
  console.log(`Generated ${path.relative(rootDir, OUTPUT_PATH)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
