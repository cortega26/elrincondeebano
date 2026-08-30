// Generates PWA PNG icons from the tracked logo source image
// Requires: sharp (npm i --save-dev sharp)

const fs = require('fs');
const path = require('path');
const { REPO_ROOT: rootDir, ensureDir, writeBufferIfChanged } = require('./utils/constants.js');

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
  const src = path.join(rootDir, 'assets/images/og/logo.png');
  const outDir = path.join(rootDir, 'assets/images/web');
  const targets = [
    { size: 192, name: 'icon-192.png' },
    { size: 512, name: 'icon-512.png' },
  ];

  if (!fs.existsSync(src)) {
    console.error(`Source file not found: ${src}`);
    process.exit(1);
  }

  ensureDir(outDir);
  await Promise.all(
    targets.map(async (t) => {
      const dest = path.join(outDir, t.name);
      const buffer = await sharp(src)
        .resize(t.size, t.size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .png({ compressionLevel: 9 })
        .toBuffer();
      const changed = writeBufferIfChanged(dest, buffer);
      console.log(`${changed ? 'Wrote' : 'Unchanged'} ${dest}`);
    })
  );
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
