// SEO metadata + structured data (migrated/adapted from csp.js)

async function loadProductData() {
  try {
    const version = localStorage.getItem('productDataVersion');
    const url = version ? `/_products/product_data.json?v=${encodeURIComponent(version)}` : '/_products/product_data.json';
    const response = await fetch(url, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
    if (!response.ok) return null;
    const data = await response.json();
    const arr = Array.isArray(data?.products) ? data.products : (Array.isArray(data) ? data : []);
    const map = {};
    arr.forEach((p) => {
      const key = p.id || String(p.name) + '-' + String(p.category);
      map[key] = p;
    });
    return map;
  } catch (e) {
    console.error('[modules/seo] Error loading product data:', e);
    return null;
  }
}

export async function injectStructuredData() {
  try {
    const map = await loadProductData();
    if (!map) return;
    const products = Object.values(map);
    const structuredProducts = products.slice(0, 20).map((p) => ({
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

    const scriptEl = document.createElement('script');
    scriptEl.type = 'application/ld+json';
    if (window && window.__CSP_NONCE__) {
      scriptEl.setAttribute('nonce', window.__CSP_NONCE__);
    }
    scriptEl.textContent = JSON.stringify(structuredData);
    document.head.appendChild(scriptEl);
  } catch (e) {
    console.error('[modules/seo] Error generating structured data:', e);
  }
}

export function injectSeoMetadata() {
  try {
    if (!document.querySelector('link[rel="canonical"]')) {
      const link = document.createElement('link');
      link.rel = 'canonical';
      link.href = location.origin + location.pathname;
      document.head.appendChild(link);
    }
    if (!document.querySelector('meta[name="description"]')) {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = 'El Rincón de Ébano - Minimarket con delivery instantáneo.';
      document.head.appendChild(meta);
    }
  } catch (e) {
    console.warn('[modules/seo] injectSeoMetadata error:', e);
  }
}
