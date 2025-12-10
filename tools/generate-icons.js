// Generates PWA PNG icons from the existing WebP logo
// Requires: sharp (npm i --save-dev sharp)

const fs = require('fs');
const path = require('path');

async function ensureSharp() {
  try {
    // Dynamically require to provide clearer error if missing
    return require('sharp');
  } catch (e) {
    console.error('\nMissing devDependency: sharp\nRun:  npm i --save-dev sharp\n');
    process.exit(1);
  }
}

async function main() {
  const sharp = await ensureSharp();
  const rootDir = path.resolve(__dirname, '..');
  const src = path.join(rootDir, 'assets/images/web/logo.webp');
  const outDir = path.join(rootDir, 'assets/images/web');
  const targets = [
    { size: 192, name: 'icon-192.png' },
    { size: 512, name: 'icon-512.png' },
  ];

  if (!fs.existsSync(src)) {
    console.error(`Source file not found: ${src}`);
    process.exit(1);
  }

  await Promise.all(
    targets.map(async (t) => {
      const dest = path.join(outDir, t.name);
      await sharp(src)
        .resize(t.size, t.size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .png({ compressionLevel: 9 })
        .toFile(dest);
      console.log(`Wrote ${dest}`);
    })
  );
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
