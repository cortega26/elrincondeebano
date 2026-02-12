const fs = require('fs');
const path = require('path');
const { resolveFromOutput } = require('./utils/output-dir');

const DEFAULT_IMAGE = 'https://elrincondeebano.com/assets/images/web/logo.webp';

function resolveProductImage(product) {
  if (typeof product?.image_path === 'string' && product.image_path.trim()) {
    return product.image_path.trim();
  }

  if (typeof product?.image === 'string' && product.image.trim()) {
    return product.image.trim();
  }

  if (product?.image && typeof product.image === 'object') {
    if (typeof product.image.src === 'string' && product.image.src.trim()) {
      return product.image.src.trim();
    }
  }

  return DEFAULT_IMAGE;
}

function mapProductToStructuredData(product) {
  const name = typeof product?.name === 'string' ? product.name.trim() : '';
  if (!name) {
    return null;
  }

  const description = typeof product?.description === 'string' ? product.description.trim() : '';
  const brand = typeof product?.brand === 'string' && product.brand.trim() ? product.brand.trim() : 'Genérico';
  const price =
    typeof product?.price === 'number'
      ? product.price
      : Number.isFinite(Number(product?.price))
        ? Number(product.price)
        : 0;

  return {
    '@type': 'Product',
    name,
    image: resolveProductImage(product),
    description,
    brand,
    offers: {
      '@type': 'Offer',
      price,
      priceCurrency: 'CLP',
      availability: product?.stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };
}

function parseInlineProductPayload(html) {
  if (typeof html !== 'string' || !html.trim()) {
    return { hasPayload: false, products: null };
  }

  const match = html.match(/<script[^>]*id=["']product-data["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) {
    return { hasPayload: false, products: null };
  }

  const rawPayload = match[1].trim();
  if (!rawPayload) {
    return { hasPayload: true, products: [] };
  }

  try {
    const parsed = JSON.parse(rawPayload);
    if (Array.isArray(parsed?.initialProducts)) {
      return { hasPayload: true, products: parsed.initialProducts };
    }
    if (Array.isArray(parsed?.products)) {
      return { hasPayload: true, products: parsed.products };
    }
    return { hasPayload: true, products: [] };
  } catch (error) {
    console.warn(`[structured-data] Invalid inline payload in page: ${error.message}`);
    return { hasPayload: true, products: [] };
  }
}

function resolveProductsForPage(html, fallbackProducts = []) {
  const inline = parseInlineProductPayload(html);
  if (inline.hasPayload) {
    return Array.isArray(inline.products) ? inline.products : [];
  }
  return Array.isArray(fallbackProducts) ? fallbackProducts : [];
}

function generateStructuredData(products) {
  const sourceProducts = Array.isArray(products) ? products : [];
  const structuredProducts = sourceProducts.map(mapProductToStructuredData).filter(Boolean);

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Store',
        name: 'El Rincón de Ébano',
        image: 'https://elrincondeebano.com/assets/images/web/logo.webp',
        description: 'Un minimarket en la puerta de tu departamento',
        address: { '@type': 'PostalAddress', addressCountry: 'CL' },
        telephone: '+56951118901',
        url: 'http://www.elrincondeebano.com/',
      },
      ...structuredProducts,
    ],
  };

  return `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`;
}

function injectIntoFile(filePath, fallbackProducts = []) {
  let html = fs.readFileSync(filePath, 'utf8');
  if (html.includes('application/ld+json')) {
    return false;
  }

  const pageProducts = resolveProductsForPage(html, fallbackProducts);
  const scriptTag = generateStructuredData(pageProducts);

  if (html.includes('<!-- Structured Data -->')) {
    html = html.replace('<!-- Structured Data -->', scriptTag);
  } else {
    html = html.replace('</head>', `${scriptTag}\n</head>`);
  }
  fs.writeFileSync(filePath, html);
  return true;
}

function main() {
  const dataPath = path.join(__dirname, '..', 'data', 'product_data.json');
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const products = Array.isArray(raw.products) ? raw.products : Array.isArray(raw) ? raw : [];
  const files = [];
  const pagesDir = resolveFromOutput('pages');
  if (fs.existsSync(pagesDir)) {
    for (const file of fs.readdirSync(pagesDir)) {
      if (file.endsWith('.html')) {
        files.push(path.join(pagesDir, file));
      }
    }
  }

  files.forEach((file) => injectIntoFile(file, products));
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_IMAGE,
  resolveProductImage,
  mapProductToStructuredData,
  parseInlineProductPayload,
  resolveProductsForPage,
  generateStructuredData,
  injectIntoFile,
};
