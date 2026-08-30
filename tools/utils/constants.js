'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO_ROOT = path.resolve(__dirname, '../..');

// Original widths from product-mapper.js and gap-fill etc — single source per plan 156.
const PRODUCT_IMAGE_WIDTHS = Object.freeze([200, 320, 400, 480, 640]);
const HERO_WIDTHS = Object.freeze([200, 320, 400, 480, 640]);
const HERO_BASE_WIDTH = 320;
const PRODUCT_IMAGE_SIZES = '(max-width: 575px) 50vw, (max-width: 991px) 45vw, 280px';
const GAP_FILL_WIDTHS = Object.freeze([200, 400, 600, 800, 1200]);
const GAP_FILL_EXTENSIONS = Object.freeze(['webp', 'avif']);
const GENERATE_IMAGE_WIDTHS = Object.freeze([200, 400, 600, 800, 1200, 1600, 2000]);

// OG / category pipeline constants
const OG_WIDTH = 1200;
const OG_HEIGHT = 1200;
const OG_TEMPLATE_VERSION = 'v3';
const OG_JPG_QUALITY = 88;
const HOME_OG_QUALITY = 95;
const HOME_OG_SIZE = 1200;

// Sharp defaults for logo / AVIF etc
const SUPPORTED_RASTER_EXTENSIONS = new Set(['.avif', '.webp', '.png', '.jpg', '.jpeg']);
const CRITICAL_UI_ASSETS = Object.freeze([
  'assets/images/web/logo.webp',
  'assets/images/web/404.webp',
]);

const CFIMG_THUMB = Object.freeze({ fit: 'cover', quality: 75, format: 'auto', dpr: 1 });

function normalizeAssetPath(assetPath) {
  if (typeof assetPath !== 'string') {
    return '';
  }
  return assetPath.trim().replace(/^\/+/, '');
}

function supportsAvifConversion(assetPath) {
  const normalized = normalizeAssetPath(assetPath);
  if (!normalized) {
    return false;
  }
  return SUPPORTED_RASTER_EXTENSIONS.has(path.extname(normalized).toLowerCase());
}

function deriveAvifPath(assetPath) {
  const normalized = normalizeAssetPath(assetPath);
  if (!normalized) {
    return '';
  }
  if (!supportsAvifConversion(normalized)) {
    return '';
  }
  const extension = path.extname(normalized);
  if (extension.toLowerCase() === '.avif') {
    return normalized;
  }
  return normalized.slice(0, -extension.length) + '.avif';
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeBufferIfChanged(targetPath, nextBuffer) {
  if (fs.existsSync(targetPath)) {
    const current = fs.readFileSync(targetPath);
    if (current.equals(nextBuffer)) {
      return false;
    }
  }
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, nextBuffer);
  return true;
}

function writeTextIfChanged(targetPath, nextText) {
  const nextBuffer = Buffer.from(nextText, 'utf8');
  if (fs.existsSync(targetPath)) {
    const current = fs.readFileSync(targetPath, 'utf8');
    if (current === nextText) {
      return false;
    }
    const currentBuf = fs.readFileSync(targetPath);
    if (currentBuf.equals(nextBuffer)) {
      return false;
    }
  }
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, nextBuffer);
  return true;
}

function copyIfChanged(sourcePath, targetPath) {
  const sourceBytes = fs.readFileSync(sourcePath);
  if (fs.existsSync(targetPath)) {
    const targetBytes = fs.readFileSync(targetPath);
    if (Buffer.compare(sourceBytes, targetBytes) === 0) {
      return false;
    }
  }
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, sourceBytes);
  return true;
}

function fileSha256(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function resolveRepoRoot(override) {
  if (override && String(override).trim()) {
    return path.resolve(String(override).trim());
  }
  return REPO_ROOT;
}

function resolveFromRepo(...segments) {
  return path.join(REPO_ROOT, ...segments);
}

module.exports = {
  REPO_ROOT,
  PRODUCT_IMAGE_WIDTHS,
  HERO_WIDTHS,
  HERO_BASE_WIDTH,
  PRODUCT_IMAGE_SIZES,
  GAP_FILL_WIDTHS,
  GAP_FILL_EXTENSIONS,
  GENERATE_IMAGE_WIDTHS,
  OG_WIDTH,
  OG_HEIGHT,
  OG_TEMPLATE_VERSION,
  OG_JPG_QUALITY,
  HOME_OG_QUALITY,
  HOME_OG_SIZE,
  SUPPORTED_RASTER_EXTENSIONS,
  CRITICAL_UI_ASSETS,
  CFIMG_THUMB,
  normalizeAssetPath,
  supportsAvifConversion,
  deriveAvifPath,
  ensureDir,
  writeBufferIfChanged,
  writeTextIfChanged,
  copyIfChanged,
  fileSha256,
  resolveRepoRoot,
  resolveFromRepo,
};
