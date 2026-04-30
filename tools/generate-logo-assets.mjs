import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const SOURCE_PATH = path.join(rootDir, 'assets', 'images', 'og', 'logo.png');
const OUTPUT_DIR = path.join(rootDir, 'assets', 'images', 'web');
const TRANSPARENT_BACKGROUND = { r: 255, g: 255, b: 255, alpha: 0 };

const rasterTargets = [
  {
    output: 'logo.webp',
    format: 'webp',
    formatOptions: { quality: 90 },
  },
  {
    output: 'logo.avif',
    format: 'avif',
    formatOptions: { quality: 60, effort: 4 },
  },
  ...[40, 80, 120].flatMap((size) => [
    {
      output: `logo-${size}.webp`,
      format: 'webp',
      resize: {
        width: size,
        height: size,
        fit: 'contain',
        background: TRANSPARENT_BACKGROUND,
      },
      formatOptions: { quality: 90 },
    },
    {
      output: `logo-${size}.avif`,
      format: 'avif',
      resize: {
        width: size,
        height: size,
        fit: 'contain',
        background: TRANSPARENT_BACKGROUND,
      },
      formatOptions: { quality: 60, effort: 4 },
    },
  ]),
  ...[192, 512].map((size) => ({
    output: `icon-${size}.png`,
    format: 'png',
    resize: {
      width: size,
      height: size,
      fit: 'contain',
      background: TRANSPARENT_BACKGROUND,
    },
    formatOptions: { compressionLevel: 9 },
  })),
];

function createIcoFromPngBuffer(pngBuffer, width, height) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(width >= 256 ? 0 : width, 6);
  header.writeUInt8(height >= 256 ? 0 : height, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(pngBuffer.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, pngBuffer]);
}

function writeBufferIfChanged(targetPath, nextBuffer) {
  if (fs.existsSync(targetPath)) {
    const currentBuffer = fs.readFileSync(targetPath);
    if (currentBuffer.equals(nextBuffer)) {
      return false;
    }
  }

  fs.writeFileSync(targetPath, nextBuffer);
  return true;
}

async function renderTarget({ format, resize, formatOptions }) {
  let pipeline = sharp(SOURCE_PATH);
  if (resize) {
    pipeline = pipeline.resize(resize);
  }

  return pipeline[format](formatOptions).toBuffer();
}

async function generateRasterAssets() {
  const results = [];

  for (const target of rasterTargets) {
    const outputPath = path.join(OUTPUT_DIR, target.output);
    const rendered = await renderTarget(target);
    const updated = writeBufferIfChanged(outputPath, rendered);
    results.push({
      path: outputPath,
      updated,
    });
  }

  return results;
}

async function generateFavicon() {
  const faviconPng = await sharp(SOURCE_PATH)
    .resize(64, 64, {
      fit: 'contain',
      background: TRANSPARENT_BACKGROUND,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const faviconIco = createIcoFromPngBuffer(faviconPng, 64, 64);
  const outputPath = path.join(OUTPUT_DIR, 'favicon.ico');
  return {
    path: outputPath,
    updated: writeBufferIfChanged(outputPath, faviconIco),
  };
}

async function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    throw new Error(`Missing logo source image: ${SOURCE_PATH}`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const rasterResults = await generateRasterAssets();
  const faviconResult = await generateFavicon();
  const results = [...rasterResults, faviconResult];

  for (const result of results) {
    const relativePath = path.relative(rootDir, result.path);
    if (result.updated) {
      console.log(`Generated ${relativePath}`);
      continue;
    }

    console.log(`Unchanged ${relativePath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
