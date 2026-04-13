'use strict';

const { readJson } = require('./repo-files.js');

function loadProductCatalog() {
  return readJson('data/product_data.json');
}

function findWebpBackedProduct(products = []) {
  return products.find((product) => /\.webp$/i.test(String(product?.image_path || ''))) || null;
}

function getWebpBackedProduct() {
  const productCatalog = loadProductCatalog();
  const product = findWebpBackedProduct(productCatalog.products || []);
  if (!product) {
    throw new Error(
      'Expected at least one product with a WebP image_path for OG compatibility coverage.'
    );
  }
  return product;
}

function getSharePreviewSampleProduct() {
  const productCatalog = loadProductCatalog();
  const products = productCatalog.products || [];
  const product = findWebpBackedProduct(products) || products[0] || null;
  if (!product) {
    throw new Error(
      'Expected at least one product in the catalog for share-preview contract coverage.'
    );
  }
  return product;
}

module.exports = {
  findWebpBackedProduct,
  getSharePreviewSampleProduct,
  getWebpBackedProduct,
  loadProductCatalog,
};
