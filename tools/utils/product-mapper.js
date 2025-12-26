const fs = require('fs');
const path = require('path');
const { rootDir } = require('./output-dir');

const DATA_PATH = path.join(rootDir, 'data', 'product_data.json');
const CFIMG_THUMB = { fit: 'cover', quality: 75, format: 'auto', dpr: 1 };
const PRODUCT_IMAGE_WIDTHS = [200, 320, 400];
const HERO_WIDTHS = [200, 320, 400];
const HERO_BASE_WIDTH = 320;
const PRODUCT_IMAGE_SIZES = '(max-width: 575px) 200px, (max-width: 991px) 45vw, 280px';

function shouldDisableCfRewrite() {
  const disableFlag = process.env.CFIMG_DISABLE;
  if (typeof disableFlag === 'string') {
    const normalized = disableFlag.toLowerCase();
    if (['1', 'true', 'yes'].includes(normalized)) {
      return true;
    }
  }

  const enableFlag = process.env.CFIMG_ENABLE;
  if (typeof enableFlag === 'string') {
    const normalized = enableFlag.toLowerCase();
    if (['1', 'true', 'yes'].includes(normalized)) {
      return false;
    }
  }

  // Default to disabling rewrite for static hosting unless explicitly enabled
  return true;
}

function cfimg(imgPath, opts = {}) {
  const normalized = imgPath.startsWith('/') ? imgPath : `/${imgPath}`;
  if (shouldDisableCfRewrite()) {
    return normalized;
  }
  const encoded = normalized
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const params = Object.entries(opts)
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
  return `/cdn-cgi/image/${params}${encoded}`;
}

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
  const percent = price > 0 ? Math.round((discount / price) * 100) : 0;
  return {
    discountedPrice,
    discountPercent: percent,
    isDiscounted: discount > 0,
  };
}

function buildSrcset(imagePath, widths = HERO_WIDTHS, extraOpts = {}) {
  const normalized = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  return widths
    .map((width) => `${cfimg(normalized, { ...CFIMG_THUMB, width, ...extraOpts })} ${width}w`)
    .join(', ');
}

function buildImageMeta(imagePath, avifPath) {
  const normalized = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  const src = cfimg(normalized, { ...CFIMG_THUMB, width: HERO_BASE_WIDTH });
  const srcset = buildSrcset(imagePath, PRODUCT_IMAGE_WIDTHS);
  let avif = null;
  if (avifPath) {
    const normalizedAvif = avifPath.startsWith('/') ? avifPath : `/${avifPath}`;
    avif = {
      src: cfimg(normalizedAvif, { ...CFIMG_THUMB, width: HERO_BASE_WIDTH, format: 'avif' }),
      srcset: buildSrcset(avifPath, PRODUCT_IMAGE_WIDTHS, { format: 'avif' }),
    };
  }
  return { src, srcset, avif, sizes: PRODUCT_IMAGE_SIZES };
}

function enrichProduct(product, index) {
  const id = product.id || generateStableId(product);
  const order = typeof product.order === 'number' ? product.order : index;
  const image = buildImageMeta(product.image_path || '', product.image_avif_path || '');
  const discountMeta = computeDiscountMeta(product);
  return {
    ...product,
    id,
    originalIndex: order,
    image,
    ...discountMeta,
  };
}

function sortAndEnrichProducts(products = []) {
  return [...products]
    .map((product, index) => ({ product, index }))
    .sort((a, b) => {
      const orderA = typeof a.product.order === 'number' ? a.product.order : a.index;
      const orderB = typeof b.product.order === 'number' ? b.product.order : b.index;
      return orderA - orderB;
    })
    .map(({ product }, index) => enrichProduct(product, index));
}

function mapProductForInline(product) {
  const { image, discountedPrice, discountPercent, isDiscounted, originalIndex, ...rest } = product;
  return {
    ...rest,
    originalIndex,
    discounted_price: discountedPrice,
    discount_percent: discountPercent,
    is_discounted: isDiscounted,
    image,
  };
}

function safeJsonStringify(payload) {
  return JSON.stringify(payload)
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

module.exports = {
  DATA_PATH,
  CFIMG_THUMB,
  readProductData,
  sortAndEnrichProducts,
  mapProductForInline,
  safeJsonStringify,
  cfimg,
  shouldDisableCfRewrite,
};
