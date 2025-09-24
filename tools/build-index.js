const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const ROOT_DIR = path.join(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT_DIR, 'templates', 'index.ejs');
const DATA_PATH = path.join(ROOT_DIR, 'data', 'product_data.json');
const OUTPUT_PATH = path.join(ROOT_DIR, 'index.html');

const CFIMG_THUMB = { fit: 'cover', quality: 82, format: 'auto' };

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function cfimg(imgPath, opts = {}) {
  const normalized = imgPath.startsWith('/') ? imgPath : `/${imgPath}`;
  const encoded = normalized.split('/').map(segment => encodeURIComponent(segment)).join('/');
  const params = Object.entries(opts)
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
  return `/cdn-cgi/image/${params}${encoded}`;
}

function generateStableId(product) {
  const baseString = `${product.name}-${product.category}`.toLowerCase();
  let hash = 0;
  for (let i = 0; i < baseString.length; i += 1) {
    const charCode = baseString.charCodeAt(i);
    hash = ((hash << 5) - hash) + charCode;
    hash &= hash;
  }
  return `pid-${Math.abs(hash)}`;
}

function buildImageMeta(imagePath) {
  const normalized = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  const src = cfimg(normalized, { ...CFIMG_THUMB, width: 400 });
  const widths = [200, 400, 800];
  const srcset = widths
    .map(width => `${cfimg(normalized, { ...CFIMG_THUMB, width })} ${width}w`)
    .join(', ');
  return { src, srcset };
}

function computeDiscountMeta(product) {
  const price = Number(product.price) || 0;
  const discount = Number(product.discount) || 0;
  const discountedPrice = Math.max(price - discount, 0);
  const percent = price > 0 ? Math.round((discount / price) * 100) : 0;
  return {
    discountedPrice,
    discountPercent: percent,
    isDiscounted: discount > 0
  };
}

function safeJsonStringify(payload) {
  return JSON.stringify(payload)
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function enrichProduct(product, index) {
  const id = product.id || generateStableId(product);
  const order = typeof product.order === 'number' ? product.order : index;
  const image = buildImageMeta(product.image_path || '');
  const discountMeta = computeDiscountMeta(product);
  return {
    ...product,
    id,
    originalIndex: order,
    image,
    ...discountMeta
  };
}

const INITIAL_RENDER_COUNT = 12;

function mapProductForInline(product) {
  const {
    image,
    discountedPrice,
    discountPercent,
    isDiscounted,
    originalIndex,
    ...rest
  } = product;
  return {
    ...rest,
    originalIndex,
    discounted_price: discountedPrice,
    discount_percent: discountPercent,
    is_discounted: isDiscounted,
    image
  };
}

function build() {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const productData = readJson(DATA_PATH);
  const sortedProducts = [...(productData.products || [])]
    .map((product, index) => ({ product, index }))
    .sort((a, b) => {
      const orderA = typeof a.product.order === 'number' ? a.product.order : a.index;
      const orderB = typeof b.product.order === 'number' ? b.product.order : b.index;
      return orderA - orderB;
    })
    .map(({ product }, index) => enrichProduct(product, index));

  const availableProducts = sortedProducts.filter(product => product.stock);

  const initialProducts = availableProducts.slice(0, INITIAL_RENDER_COUNT);

  const inlinePayload = safeJsonStringify({
    version: productData.version || null,
    totalProducts: availableProducts.length,
    initialProducts: initialProducts.map(mapProductForInline)
  });

  const html = ejs.render(template, {
    products: initialProducts,
    totalProducts: availableProducts.length,
    inlinePayload
  }, { rmWhitespace: false, filename: TEMPLATE_PATH });

  fs.writeFileSync(OUTPUT_PATH, html);
}

build();
