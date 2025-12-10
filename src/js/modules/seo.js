// SEO metadata + structured data (migrated/adapted from csp.js)

const PRODUCT_DATA_GLOBAL_KEY = '__PRODUCT_DATA__';
const INLINE_PRODUCT_DATA_ID = 'product-data';

function getSharedProducts() {
  try {
    if (typeof window === 'undefined') return null;
    const payload = window[PRODUCT_DATA_GLOBAL_KEY];
    if (payload && Array.isArray(payload.products)) {
      return payload.products;
    }
  } catch (e) {
    console.warn('[modules/seo] Unable to read shared product data:', e);
  }
  return null;
}

function persistSharedProducts(products, metadata = {}) {
  if (typeof window === 'undefined' || !Array.isArray(products)) {
    return;
  }
  const existing = window[PRODUCT_DATA_GLOBAL_KEY] || {};
  window[PRODUCT_DATA_GLOBAL_KEY] = {
    ...existing,
    products,
    version: metadata.version ?? existing.version ?? null,
    updatedAt: metadata.updatedAt || Date.now(),
    source: metadata.source || existing.source || 'seo',
  };
}

function createProductMap(products = []) {
  const map = {};
  products.forEach((p) => {
    const key = p.id || String(p.name) + '-' + String(p.category);
    map[key] = p;
  });
  return map;
}

function markStructuredDataInjected() {
  if (typeof window === 'undefined') return;
  const payload = window[PRODUCT_DATA_GLOBAL_KEY] || {};
  if (payload.structuredDataInjected) {
    return;
  }
  window[PRODUCT_DATA_GLOBAL_KEY] = {
    ...payload,
    structuredDataInjected: true,
  };
}

function readInlineProductPayload() {
  try {
    if (typeof document === 'undefined') return null;
    const el = document.getElementById(INLINE_PRODUCT_DATA_ID);
    if (!el || !el.textContent) return null;
    const parsed = JSON.parse(el.textContent);
    if (Array.isArray(parsed.products)) return parsed.products;
    if (Array.isArray(parsed.initialProducts)) return parsed.initialProducts;
  } catch (error) {
    console.warn('[modules/seo] Unable to parse inline product payload:', error);
  }
  return null;
}

async function loadProductData() {
  try {
    const inline = readInlineProductPayload();
    if (inline?.length) {
      persistSharedProducts(inline, { source: 'seo-inline' });
      return createProductMap(inline);
    }
    const sharedProducts = getSharedProducts();
    if (sharedProducts) {
      return createProductMap(sharedProducts);
    }

    const version = localStorage.getItem('productDataVersion');
    const url = version
      ? `/data/product_data.json?v=${encodeURIComponent(version)}`
      : '/data/product_data.json';
    const response = await fetch(url, {
      cache: 'default',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const arr = Array.isArray(data?.products) ? data.products : Array.isArray(data) ? data : [];
    persistSharedProducts(arr, {
      version: data?.version || version || null,
      source: 'seo-fallback',
    });
    return createProductMap(arr);
  } catch (e) {
    console.error('[modules/seo] Error loading product data:', e);
    return null;
  }
}

export async function injectStructuredData() {
  try {
    if (document.querySelector('script[type="application/ld+json"]')) {
      markStructuredDataInjected();
      return;
    }
    const sharedPayload = typeof window !== 'undefined' ? window[PRODUCT_DATA_GLOBAL_KEY] : null;
    if (sharedPayload?.structuredDataInjected) {
      return;
    }
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
          contactPoint: {
            '@type': 'ContactPoint',
            telephone: '+56-951118901',
            contactType: 'customer service',
          },
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
    markStructuredDataInjected();
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
