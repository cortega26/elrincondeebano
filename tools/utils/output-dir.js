const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');

function resolveOutputDir() {
  const override = process.env.BUILD_OUTPUT_DIR;
  if (override) {
    return path.resolve(rootDir, override);
  }
  return path.join(rootDir, 'build');
}

function resolveFromOutput(...segments) {
  return path.join(resolveOutputDir(), ...segments);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function prepareOutputRoot() {
  const outputDir = resolveOutputDir();
  fs.rmSync(outputDir, { recursive: true, force: true });
  ensureDir(outputDir);
  return outputDir;
}

module.exports = {
  rootDir,
  resolveOutputDir,
  resolveFromOutput,
  ensureDir,
  prepareOutputRoot,
};
