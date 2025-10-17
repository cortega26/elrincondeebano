const fs = require('fs');
const path = require('path');
const {
  rootDir,
  resolveOutputDir,
} = require('./utils/output-dir');

function main() {
  const outputRoot = resolveOutputDir();
  const serviceWorkerPath = path.join(rootDir, 'service-worker.js');

  // eslint-disable-next-line global-require, import/no-dynamic-require
  const swModule = require(serviceWorkerPath);
  const assets = swModule?.CACHE_CONFIG?.staticAssets;

  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error('Unable to read static asset list from service-worker.js');
  }

  const missing = assets.reduce((acc, assetPath) => {
    if (typeof assetPath !== 'string') {
      acc.push({ assetPath, reason: 'not a string' });
      return acc;
    }
    const relativePath = assetPath.replace(/^\//, '');
    const fullPath = path.join(outputRoot, relativePath);
    if (!fs.existsSync(fullPath)) {
      acc.push({ assetPath, fullPath });
    }
    return acc;
  }, []);

  if (missing.length > 0) {
    console.error('❌ Service worker assets missing from build output:');
    missing.forEach(({ assetPath, fullPath }) => {
      console.error(`   - ${assetPath} (expected at ${fullPath})`);
    });
    process.exit(1);
  }

  console.log('✅ Service worker assets verified in build output.');
}

main();
