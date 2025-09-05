const fs = require('fs');
const path = require('path');

function generateStructuredData(products) {
  // CHANGED: Remove the .slice(0, 20) limit to include ALL products
  // OLD: const structuredProducts = products.slice(0, 20).map((p) => ({
  const structuredProducts = products.map((p) => ({
    '@type': 'Product',
    name: p.name,
    image: p.image_path,
    description: p.description,
    brand: p.brand || 'Genérico',
    offers: {
      '@type': 'Offer',
      price: p.price,
      priceCurrency: 'CLP',
      availability: p.stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  }));

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

function injectIntoFile(filePath, scriptTag) {
  let html = fs.readFileSync(filePath, 'utf8');
  if (html.includes('application/ld+json')) return; // already has structured data
  if (html.includes('<!-- Structured Data -->')) {
    html = html.replace('<!-- Structured Data -->', scriptTag);
  } else {
    html = html.replace('</head>', `${scriptTag}\n</head>`);
  }
  fs.writeFileSync(filePath, html);
}

async function main() {
  const rootDir = path.join(__dirname, '..');
  const dataPath = path.join(rootDir, '_products', 'product_data.json');
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const products = Array.isArray(raw.products) ? raw.products : Array.isArray(raw) ? raw : [];
  const scriptTag = generateStructuredData(products);

  // Skip injecting structured data into the index page; handled at runtime by csp.js
  const files = [];
  const pagesDir = path.join(rootDir, 'pages');
  if (fs.existsSync(pagesDir)) {
    for (const file of fs.readdirSync(pagesDir)) {
      if (file.endsWith('.html')) {
        files.push(path.join(pagesDir, file));
      }
    }
  }

  files.forEach((file) => injectIntoFile(file, scriptTag));
}

main();