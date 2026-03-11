import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { validateProductDataContract } = require('../../tools/utils/product-contract.js');
const { getKnownCategoryKeys } = require('../../tools/validate-category-registry.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_REPO_ROOT = path.resolve(DEFAULT_PROJECT_ROOT, '..');
const ALLOWED_PRODUCT_ASSET_PREFIXES = ['assets/images/'];
const PRODUCT_ASSET_FIELDS = ['image_path', 'image_avif_path'];

export function createSyncPaths({
  projectRoot = DEFAULT_PROJECT_ROOT,
  repoRoot = DEFAULT_REPO_ROOT,
} = {}) {
  return {
    projectRoot,
    repoRoot,
    sourceProductsPath: path.join(repoRoot, 'data', 'product_data.json'),
    sourceCategoriesPath: path.join(repoRoot, 'data', 'category_registry.json'),
    sourceAssetsPath: path.join(repoRoot, 'assets'),
    sourceRobotsPath: path.join(repoRoot, 'robots.txt'),
    sourceManifestPath: path.join(repoRoot, 'app.webmanifest'),
    sourceServiceWorkerPath: path.join(repoRoot, 'service-worker.js'),
    sourceOfflinePath: path.join(repoRoot, 'static', 'offline.html'),
    targetProductsPath: path.join(projectRoot, 'src', 'data', 'products.json'),
    targetCategoriesPath: path.join(projectRoot, 'src', 'data', 'categories.json'),
    targetPublicProductDataPath: path.join(projectRoot, 'public', 'data', 'product_data.json'),
    targetPublicAssetsPath: path.join(projectRoot, 'public', 'assets'),
    targetRobotsPath: path.join(projectRoot, 'public', 'robots.txt'),
    targetManifestPath: path.join(projectRoot, 'public', 'app.webmanifest'),
    targetServiceWorkerPath: path.join(projectRoot, 'public', 'service-worker.js'),
    targetOfflinePath: path.join(projectRoot, 'public', 'pages', 'offline.html'),
  };
}

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeFileIfChanged(targetPath, nextContent) {
  const currentContent = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : null;
  if (currentContent === nextContent) {
    return false;
  }
  fs.writeFileSync(targetPath, nextContent, 'utf8');
  return true;
}

function copyJson(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source JSON: ${sourcePath}`);
  }

  ensureDirFor(targetPath);
  const payload = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  writeFileIfChanged(targetPath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

function writeJson(targetPath, payload) {
  ensureDirFor(targetPath);
  writeFileIfChanged(targetPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function copyFile(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source file: ${sourcePath}`);
  }
  ensureDirFor(targetPath);
  if (fs.existsSync(targetPath)) {
    const sourceBuffer = fs.readFileSync(sourcePath);
    const targetBuffer = fs.readFileSync(targetPath);
    if (sourceBuffer.equals(targetBuffer)) {
      return;
    }
  }
  fs.copyFileSync(sourcePath, targetPath);
}

function syncDirectory(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Missing source directory: ${sourceDir}`);
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    force: true,
    errorOnExist: false,
  });
}

export function validateCatalogImageAssetPath(rawValue, { fieldName, index } = {}) {
  if (typeof rawValue !== 'string') {
    throw new Error(`Invalid product ${fieldName} in products[${index}]: expected a string.`);
  }

  const normalized = rawValue.trim().replace(/^\/+/, '');
  if (!normalized) {
    return;
  }

  if (/^https?:\/\//i.test(normalized)) {
    throw new Error(
      `Invalid product ${fieldName} in products[${index}]: external URLs are not allowed.`
    );
  }

  if (normalized.includes('..') || normalized.includes('\\')) {
    throw new Error(
      `Invalid product ${fieldName} in products[${index}]: path traversal not allowed.`
    );
  }

  if (!ALLOWED_PRODUCT_ASSET_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    throw new Error(
      `Invalid product ${fieldName} in products[${index}]: expected path under assets/images/.`
    );
  }
}

export function validateProductsPayload(payload, { knownCategoryKeys } = {}) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.products)) {
    throw new Error('Invalid product payload: expected an object with products array.');
  }

  const contractResult = validateProductDataContract(payload, { knownCategoryKeys });
  if (!contractResult.isValid) {
    throw new Error(`Invalid product payload:\n${contractResult.errors.join('\n')}`);
  }

  const requiredFields = [
    'name',
    'description',
    'price',
    'discount',
    'stock',
    'category',
    'image_path',
    'order',
    'is_archived',
  ];

  payload.products.forEach((product, index) => {
    for (const field of requiredFields) {
      if (!(field in product)) {
        throw new Error(`Invalid product payload: missing "${field}" in products[${index}].`);
      }
    }

    for (const fieldName of PRODUCT_ASSET_FIELDS) {
      const fieldValue = product?.[fieldName];
      if (typeof fieldValue === 'string' && fieldValue.trim()) {
        validateCatalogImageAssetPath(fieldValue, { fieldName, index });
      }
    }
  });
}

export function createPublicProductsPayload(payload) {
  const publicPayload = {
    version: payload?.version || '',
    last_updated: payload?.last_updated || '',
    products: Array.isArray(payload?.products)
      ? payload.products.map((product) => ({
          name: product.name,
          description: product.description,
          price: product.price,
          discount: product.discount,
          stock: product.stock,
          category: product.category,
          image_path: product.image_path,
          image_avif_path: product.image_avif_path,
          order: product.order,
          is_archived: product.is_archived,
        }))
      : [],
  };

  return publicPayload;
}

export function validateCategoryPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid category payload: expected an object.');
  }
  if (!Array.isArray(payload.categories) || !Array.isArray(payload.nav_groups)) {
    throw new Error('Invalid category payload: expected categories[] and nav_groups[].');
  }

  const slugSet = new Set();
  payload.categories.forEach((category, index) => {
    if (!category?.key || !category?.slug) {
      throw new Error(`Invalid category payload: categories[${index}] must define key and slug.`);
    }
    const normalizedSlug = String(category.slug).trim().toLowerCase();
    if (!normalizedSlug) {
      throw new Error(`Invalid category payload: categories[${index}] has empty slug.`);
    }
    if (slugSet.has(normalizedSlug)) {
      throw new Error(`Invalid category payload: duplicate slug "${normalizedSlug}".`);
    }
    slugSet.add(normalizedSlug);
  });
}

export function validateProductCategoryMapping(productsPayload, categoriesPayload) {
  const categoryKeys = new Set(
    (categoriesPayload.categories || [])
      .map((category) => String(category?.key || '').trim())
      .filter(Boolean)
  );

  productsPayload.products.forEach((product, index) => {
    const categoryKey = String(product?.category || '').trim();
    if (!categoryKey || !categoryKeys.has(categoryKey)) {
      throw new Error(
        `Invalid product/category mapping: products[${index}] references unknown category "${categoryKey}".`
      );
    }
  });
}

export function runSync(options = {}) {
  const {
    sourceProductsPath,
    sourceCategoriesPath,
    sourceAssetsPath,
    sourceRobotsPath,
    sourceManifestPath,
    sourceServiceWorkerPath,
    sourceOfflinePath,
    targetProductsPath,
    targetCategoriesPath,
    targetPublicProductDataPath,
    targetPublicAssetsPath,
    targetRobotsPath,
    targetManifestPath,
    targetServiceWorkerPath,
    targetOfflinePath,
  } = createSyncPaths(options);

  const products = copyJson(sourceProductsPath, targetProductsPath);
  const categories = copyJson(sourceCategoriesPath, targetCategoriesPath);

  validateCategoryPayload(categories);
  const knownCategoryKeys = getKnownCategoryKeys(categories);
  validateProductsPayload(products, { knownCategoryKeys });
  validateProductCategoryMapping(products, categories);

  writeJson(targetPublicProductDataPath, createPublicProductsPayload(products));
  syncDirectory(sourceAssetsPath, targetPublicAssetsPath);
  copyFile(sourceRobotsPath, targetRobotsPath);
  copyFile(sourceManifestPath, targetManifestPath);
  copyFile(sourceServiceWorkerPath, targetServiceWorkerPath);
  copyFile(sourceOfflinePath, targetOfflinePath);

  const productCount = Array.isArray(products.products) ? products.products.length : 0;
  const categoryCount = Array.isArray(categories.categories) ? categories.categories.length : 0;

  console.log(
    `Synced Astro storefront assets: ${productCount} products, ${categoryCount} categories, plus legacy public contract files.`
  );
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runSync();
}
