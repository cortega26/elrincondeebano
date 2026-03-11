import fs from 'node:fs';
import sharp from 'sharp';

const [,, input, output, widthArg, heightArg, qualityArg] = process.argv;

if (!input || !output) {
  console.error('Usage: node render_raster_jpg.mjs <input> <output.jpg> [width] [height] [quality]');
  process.exit(2);
}

const width = Number.parseInt(widthArg || '1200', 10);
const height = Number.parseInt(heightArg || '1200', 10);
const quality = Number.parseInt(qualityArg || '88', 10);

if (!fs.existsSync(input)) {
  console.error(`Input raster not found: ${input}`);
  process.exit(3);
}

(async () => {
  await sharp(input)
    .resize(width, height, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      withoutEnlargement: false,
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality, progressive: true, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toFile(output);
})().catch((error) => {
  console.error(String(error && error.stack ? error.stack : error));
  process.exit(1);
});
