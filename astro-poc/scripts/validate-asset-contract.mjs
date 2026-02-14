import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const distProductDataPath = path.join(distRoot, 'data', 'product_data.json');

const REQUIRED_ASSET_PATHS = ['assets/images/web/logo.webp'];
const PRODUCT_ASSET_FIELDS = ['image_path', 'image_avif_path', 'thumbnail_path'];

function normalizeAssetRef(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:')
  ) {
    return null;
  }

  let candidatePath;

  try {
    const parsed = new URL(trimmed, 'https://elrincondeebano.com');
    if (parsed.origin !== 'https://elrincondeebano.com') {
      return null;
    }
    candidatePath = parsed.pathname;
  } catch {
    return null;
  }

  if (!candidatePath.startsWith('/assets/') && !candidatePath.startsWith('assets/')) {
    return null;
  }

  const decoded = decodeURIComponent(candidatePath).replace(/\\/g, '/');
  const relative = decoded.replace(/^\/+/, '');
  if (!relative.startsWith('assets/')) return null;
  if (relative.split('/').some((part) => part === '..')) {
    throw new Error(`Invalid asset path traversal detected: ${raw}`);
  }

  return relative;
}

function collectHtmlFiles(rootDir) {
  const results = [];

  const walk = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        results.push(fullPath);
      }
    }
  };

  walk(rootDir);
  return results;
}

function collectAssetRefsFromHtml(html) {
  const refs = [];
  const attributePattern = /\b(?:src|href|poster|content)\s*=\s*(['"])(.*?)\1/gis;
  let match;

  while ((match = attributePattern.exec(html)) !== null) {
    refs.push(match[2]);
  }

  return refs;
}

function main() {
  if (!fs.existsSync(distRoot)) {
    throw new Error(`Missing dist directory: ${distRoot}`);
  }
  if (!fs.existsSync(distProductDataPath)) {
    throw new Error(`Missing dist product data payload: ${distProductDataPath}`);
  }

  const expectedAssets = new Set();

  for (const requiredPath of REQUIRED_ASSET_PATHS) {
    expectedAssets.add(requiredPath);
  }

  const productPayload = JSON.parse(fs.readFileSync(distProductDataPath, 'utf8'));
  if (!productPayload || !Array.isArray(productPayload.products)) {
    throw new Error('Invalid dist product payload: expected { products: [] }.');
  }

  for (const product of productPayload.products) {
    for (const field of PRODUCT_ASSET_FIELDS) {
      const normalized = normalizeAssetRef(product?.[field]);
      if (normalized) {
        expectedAssets.add(normalized);
      }
    }
  }

  const htmlFiles = collectHtmlFiles(distRoot);
  for (const htmlFile of htmlFiles) {
    const html = fs.readFileSync(htmlFile, 'utf8');
    for (const rawRef of collectAssetRefsFromHtml(html)) {
      const normalized = normalizeAssetRef(rawRef);
      if (normalized) {
        expectedAssets.add(normalized);
      }
    }
  }

  const missingAssets = [];
  for (const relAssetPath of expectedAssets) {
    const absoluteAssetPath = path.join(distRoot, relAssetPath);
    if (!fs.existsSync(absoluteAssetPath)) {
      missingAssets.push(relAssetPath);
    }
  }

  if (missingAssets.length > 0) {
    const preview = missingAssets.slice(0, 50).map((item) => ` - ${item}`).join('\n');
    throw new Error(
      `Asset contract validation failed: ${missingAssets.length} missing asset(s).\n${preview}`
    );
  }

  console.log(
    `Asset contract validation passed: ${expectedAssets.size} referenced asset path(s) exist in dist.`
  );
}

main();
