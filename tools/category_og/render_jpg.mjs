import sharp from 'sharp';
import fs from 'node:fs';

const [,, input, output, widthArg, heightArg, qualityArg] = process.argv;

if (!input || !output) {
  console.error('Usage: node render_jpg.mjs <input.svg> <output.jpg> [width] [height] [quality]');
  process.exit(2);
}

const width = Number.parseInt(widthArg || '1200', 10);
const height = Number.parseInt(heightArg || '1200', 10);
const quality = Number.parseInt(qualityArg || '88', 10);

if (!fs.existsSync(input)) {
  console.error(`Input SVG not found: ${input}`);
  process.exit(3);
}

(async () => {
  await sharp(input, { density: 300 })
    .resize(width, height, { fit: 'cover' })
    .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toFile(output);
})().catch((error) => {
  console.error(String(error && error.stack ? error.stack : error));
  process.exit(1);
});
