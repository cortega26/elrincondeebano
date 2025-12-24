const fs = require('fs');
const path = require('path');
const { getDeterministicTimestamp } = require('./utils/deterministic-time');

const rootDir = path.resolve(__dirname, '..');
const pkg = require(path.join(rootDir, 'package.json'));

function ensureNodeVersion() {
  const required = pkg.engines && pkg.engines.node;
  if (!required) return;
  const current = process.versions.node;
  const [rangeMin] = required.replace(/[<>=]/g, '').split(' ');
  if (rangeMin && Number(current.split('.')[0]) < Number(rangeMin.split('.')[0])) {
    throw new Error(`Node ${current} does not satisfy engines requirement (${required}).`);
  }
}

function logCfimgMode() {
  const enable = process.env.CFIMG_ENABLE;
  const disable = process.env.CFIMG_DISABLE;
  if (disable && ['1', 'true', 'yes'].includes(disable.toLowerCase())) {
    console.log('CFIMG: rewrite disabled via CFIMG_DISABLE');
    return;
  }
  if (enable && ['1', 'true', 'yes'].includes(enable.toLowerCase())) {
    console.log('CFIMG: rewrite enabled via CFIMG_ENABLE');
    return;
  }
  console.log(
    'CFIMG: rewrite disabled by default; set CFIMG_ENABLE=1 when building behind Cloudflare'
  );
}

function ensureManifestExists() {
  const manifestPath = path.join(rootDir, 'build', 'asset-manifest.json');
  if (fs.existsSync(manifestPath)) {
    return;
  }
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ generatedAt: getDeterministicTimestamp(), files: [] }, null, 2)
  );
}

function main() {
  ensureNodeVersion();
  logCfimgMode();
  ensureManifestExists();
}

main();
