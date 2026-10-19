import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  REPO_ROOT as rootDir,
  HOME_OG_SIZE as IMAGE_SIZE,
  ensureDir,
  writeBufferIfChanged,
} from './utils/image-pipeline.mjs';
import { logger } from './utils/logger.mjs';

if (process.env.PREFLIGHT_SKIP_OG === '1') {
  logger.info('PREFLIGHT_SKIP_OG=1: skipping home OG image generation.');
  process.exit(0);
}

const SOURCE_PATH = path.join(rootDir, 'assets', 'images', 'og', 'logo.png');
const OUTPUT_DIR = path.join(rootDir, 'assets', 'images', 'og');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'home.og.jpg');

async function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    throw new Error(`Missing home OG source image: ${SOURCE_PATH}`);
  }

  ensureDir(OUTPUT_DIR);

  const rendered = await sharp(SOURCE_PATH)
    .resize(IMAGE_SIZE, IMAGE_SIZE, {
      fit: 'cover',
      position: 'center',
      withoutEnlargement: false,
    })
    .jpeg({
      quality: 95,
      progressive: false,
      mozjpeg: true,
      chromaSubsampling: '4:4:4',
    })
    .toBuffer();

  const changed = writeBufferIfChanged(OUTPUT_PATH, rendered);
  if (!changed) {
    logger.info(`Home OG image unchanged, skipping write.`);
    return;
  }

  logger.info(`Generated ${path.relative(rootDir, OUTPUT_PATH)}`);
}

main().catch((error) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
