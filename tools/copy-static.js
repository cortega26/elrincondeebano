const fs = require('fs');
const path = require('path');
const { rootDir, resolveOutputDir, resolveFromOutput, ensureDir } = require('./utils/output-dir');

function copyFileRelative(relativePath, targetRelativePath = relativePath) {
  const source = path.join(rootDir, relativePath);
  const destination = resolveFromOutput(targetRelativePath);
  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
}

function copyDirectoryRelative(relativePath) {
  const source = path.join(rootDir, relativePath);
  const destination = resolveFromOutput(relativePath);
  fs.cpSync(source, destination, { recursive: true });
}

function main() {
  const outputRoot = resolveOutputDir();
  ensureDir(outputRoot);

  // Static directories needed at runtime
  copyDirectoryRelative('assets');
  copyDirectoryRelative('data');
  copyDirectoryRelative('admin-panel'); // lightweight web admin

  // Root-level static files
  ['404.html', 'app.webmanifest', 'robots.txt', 'service-worker.js'].forEach((file) =>
    copyFileRelative(file)
  );

  // Offline fall-back page (source stored under static/)
  copyFileRelative(path.join('static', 'offline.html'), path.join('pages', 'offline.html'));
}

main();
