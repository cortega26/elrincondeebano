const fs = require('fs');
const path = require('path');
const { rootDir } = require('./output-dir');

const DATA_PATH = path.join(rootDir, 'data', 'product_data.json');

function readProductData() {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  return JSON.parse(raw);
}

function generateStableId(product) {
  const baseString = `${product.name}-${product.category}`.toLowerCase();
  let hash = 0;
  for (let i = 0; i < baseString.length; i += 1) {
    const charCode = baseString.charCodeAt(i);
    hash = (hash << 5) - hash + charCode;
    hash &= hash;
  }
  return `pid-${Math.abs(hash)}`;
}

function computeDiscountMeta(product) {
  const price = Number(product.price) || 0;
  const discount = Number(product.discount) || 0;
  const discountedPrice = Math.max(price - discount, 0);
  // Plan 195: canonical INTEGER formula for build-time payloads — matches
  // astro product-card-helpers discountPercentInt by contract (separate
  // runtimes cannot share the implementation; keep the formulas identical).
  // The admin list intentionally shows two decimals (admin shared/discount.ts).
  const percent = price > 0 ? Math.round((discount / price) * 100) : 0;
  return {
    discountedPrice,
    discountPercent: percent,
    isDiscounted: discount > 0,
  };
}

module.exports = {
  DATA_PATH,
  readProductData,
  generateStableId,
  computeDiscountMeta,
};
