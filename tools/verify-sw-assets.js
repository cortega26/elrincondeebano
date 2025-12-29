const fs = require('fs');
const path = require('path');
const { rootDir, resolveOutputDir } = require('./utils/output-dir');
const { readManifest } = require('./utils/manifest');

function main() {
  const outputRoot = resolveOutputDir();
  const serviceWorkerPath = path.join(rootDir, 'service-worker.js');
  const manifestPath = path.join(outputRoot, 'asset-manifest.json');
  const manifest = readManifest(manifestPath);

  // eslint-disable-next-line global-require
  const swModule = require(serviceWorkerPath);
  const assets = swModule?.CACHE_CONFIG?.staticAssets;

  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error('Unable to read static asset list from service-worker.js');
  }

  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error(`Asset manifest is missing or empty at ${manifestPath}`);
  }

  const manifestMissing = manifest.files.reduce((acc, assetPath) => {
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

  const swMissing = assets.reduce((acc, assetPath) => {
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

  if (swMissing.length > 0 || manifestMissing.length > 0) {
    console.error('❌ Service worker assets missing from build output:');
    swMissing.forEach(({ assetPath, fullPath }) => {
      console.error(`   - ${assetPath} (expected at ${fullPath})`);
    });
    console.error('❌ Manifest assets missing from build output:');
    manifestMissing.forEach(({ assetPath, fullPath }) => {
      console.error(`   - ${assetPath} (expected at ${fullPath})`);
    });
    process.exit(1);
  }

  console.log('✅ Service worker and manifest assets verified in build output.');
}

main();
