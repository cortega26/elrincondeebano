const fs = require('fs');

function readManifest(manifestPath) {
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return { files: [] };
  }
}

function writeManifest(manifestPath, manifest) {
  const payload = {
    generatedAt: manifest.generatedAt || new Date().toISOString(),
    files: Array.isArray(manifest.files) ? Array.from(new Set(manifest.files)).sort() : [],
  };
  fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2));
}

function appendToManifest(manifestPath, entries = []) {
  const manifest = readManifest(manifestPath);
  if (!Array.isArray(manifest.files)) {
    manifest.files = [];
  }
  for (const entry of entries) {
    if (typeof entry === 'string') {
      const normalized = entry.startsWith('/') ? entry : `/${entry}`;
      manifest.files.push(normalized);
    }
  }
  writeManifest(manifestPath, manifest);
}

module.exports = {
  readManifest,
  writeManifest,
  appendToManifest,
};
