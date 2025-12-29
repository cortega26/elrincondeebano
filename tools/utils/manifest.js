const fs = require('fs');
const { getDeterministicTimestamp } = require('./deterministic-time');

function readManifest(manifestPath) {
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return { files: [] };
  }
}

function readManifestFonts(manifestPath, label = 'manifest') {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const files = Array.isArray(manifest?.files) ? manifest.files : [];
    return files.filter(
      (file) => typeof file === 'string' && file.toLowerCase().endsWith('.woff2')
    );
  } catch (error) {
    console.warn(`${label}: Unable to read asset manifest for font preloads:`, error);
    return [];
  }
}

function writeManifest(manifestPath, manifest) {
  const payload = {
    generatedAt: manifest.generatedAt || getDeterministicTimestamp(),
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
  readManifestFonts,
};
