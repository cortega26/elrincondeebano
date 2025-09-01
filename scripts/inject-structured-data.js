import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateStructuredData(products) {
  // Include ALL in-stock products instead of limiting to 20
  const structuredProducts = products
    .filter(product => product.stock === true) // Only in-stock products
    .map((product) => ({
      '@type': 'Product',
      name: product.name,
      image: `https://elrincondeebano.com/${product.image_path.replace(/^\//, '')}`,
      description: product.description,
      brand: product.brand || 'Genérico',
      category: product.category,
      sku: generateStableId(product), // Use existing generateStableId function
      offers: {
        '@type': 'Offer',
        price: product.discount ? (product.price - product.discount) : product.price,
        priceCurrency: 'CLP',
        availability: 'https://schema.org/InStock',
        priceValidUntil: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
        seller: {
          '@type': 'Organization',
          name: 'El Rincón de Ébano',
          telephone: '+56951118901',
          url: 'https://elrincondeebano.com'
        }
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.5',
        reviewCount: '1'
      }
    }));

  // Add category-specific structured data
  const categories = [...new Set(products.map(p => p.category))];
  const categoryStructuredData = categories.map(category => ({
    '@type': 'CollectionPage',
    name: `${category} - El Rincón de Ébano`,
    url: `https://elrincondeebano.com/pages/${category.toLowerCase().replace(/[^a-z0-9]/g, '')}.html`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.filter(p => p.category === category && p.stock).length
    }
  }));

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Store',
        name: 'El Rincón de Ébano',
        image: 'https://elrincondeebano.com/assets/images/web/logo.webp',
        description: 'Un minimarket en la puerta de tu departamento',
        address: { 
          '@type': 'PostalAddress', 
          addressCountry: 'CL',
          addressLocality: 'Santiago'
        },
        telephone: '+56951118901',
        url: 'https://elrincondeebano.com/',
        priceRange: '$500 - $15000',
        paymentAccepted: ['Efectivo', 'Transferencia Bancaria'],
        openingHours: 'Mo-Su 08:00-22:00'
      },
      ...structuredProducts,
      ...categoryStructuredData,
      {
        '@type': 'WebSite',
        name: 'El Rincón de Ébano',
        url: 'https://elrincondeebano.com/',
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://elrincondeebano.com/?search={search_term_string}',
          'query-input': 'required name=search_term_string'
        }
      }
    ]
  };

  return `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`;
}

// Add generateStableId function if it doesn't exist
function generateStableId(product) {
    const baseString = `${product.name}-${product.category}`.toLowerCase();
    let hash = 0;
    for (let i = 0; i < baseString.length; i++) {
        const char = baseString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return `pid-${Math.abs(hash)}`;
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

  const files = [path.join(rootDir, 'index.html')];
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
