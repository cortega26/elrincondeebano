import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(projectRoot, '..');

const sourceProductsPath = path.join(repoRoot, 'data', 'product_data.json');
const sourceCategoriesPath = path.join(repoRoot, 'data', 'category_registry.json');
const targetProductsPath = path.join(projectRoot, 'src', 'data', 'products.json');
const targetCategoriesPath = path.join(projectRoot, 'src', 'data', 'categories.json');
const targetPublicProductDataPath = path.join(projectRoot, 'public', 'data', 'product_data.json');
const sourceRobotsPath = path.join(repoRoot, 'robots.txt');
const sourceManifestPath = path.join(repoRoot, 'app.webmanifest');
const sourceServiceWorkerPath = path.join(repoRoot, 'service-worker.js');
const targetRobotsPath = path.join(projectRoot, 'public', 'robots.txt');
const targetManifestPath = path.join(projectRoot, 'public', 'app.webmanifest');
const targetServiceWorkerPath = path.join(projectRoot, 'public', 'service-worker.js');

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function copyJson(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source JSON: ${sourcePath}`);
  }

  ensureDirFor(targetPath);
  const payload = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

function copyFile(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source file: ${sourcePath}`);
  }
  ensureDirFor(targetPath);
  fs.copyFileSync(sourcePath, targetPath);
}

function validateProductsPayload(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.products)) {
    throw new Error('Invalid product payload: expected an object with products array.');
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

    if (typeof product.image_path === 'string') {
      const imagePath = product.image_path.trim();
      if (imagePath.startsWith('../') || imagePath.includes('..\\')) {
        throw new Error(`Invalid product image_path in products[${index}]: path traversal not allowed.`);
      }
    }

    if (typeof product.image_avif_path === 'string' && product.image_avif_path.trim()) {
      const avifPath = product.image_avif_path.trim();
      if (avifPath.startsWith('../') || avifPath.includes('..\\')) {
        throw new Error(`Invalid product image_avif_path in products[${index}]: path traversal not allowed.`);
      }
    }
  });
}

function validateCategoryPayload(payload) {
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

function validateProductCategoryMapping(productsPayload, categoriesPayload) {
  const categoryKeys = new Set(
    (categoriesPayload.categories || []).map((category) => String(category?.key || '').trim()).filter(Boolean)
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

const products = copyJson(sourceProductsPath, targetProductsPath);
const categories = copyJson(sourceCategoriesPath, targetCategoriesPath);
validateProductsPayload(products);
validateCategoryPayload(categories);
validateProductCategoryMapping(products, categories);
copyJson(sourceProductsPath, targetPublicProductDataPath);
copyFile(sourceRobotsPath, targetRobotsPath);
copyFile(sourceManifestPath, targetManifestPath);
copyFile(sourceServiceWorkerPath, targetServiceWorkerPath);

const productCount = Array.isArray(products.products) ? products.products.length : 0;
const categoryCount = Array.isArray(categories.categories) ? categories.categories.length : 0;

console.log(
  `Synced Astro POC assets: ${productCount} products, ${categoryCount} categories, plus legacy public contract files.`
);
