const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const templatePath = path.join(__dirname, '..', 'templates', 'index.ejs');
const template = fs.readFileSync(templatePath, 'utf8');

const sampleProducts = [
  {
    id: 'pid-1',
    name: 'Producto destacado',
    description: 'Descripción del producto destacado',
    price: 1990,
    discountedPrice: 1990,
    discountPercent: 0,
    isDiscounted: false,
    stock: true,
    image: {
      src: '/cdn-cgi/image/fit=cover,width=400/sample.webp',
      srcset: [
        '/cdn-cgi/image/fit=cover,width=200/sample.webp 200w',
        '/cdn-cgi/image/fit=cover,width=400/sample.webp 400w',
        '/cdn-cgi/image/fit=cover,width=800/sample.webp 800w'
      ].join(', ')
    }
  },
  {
    id: 'pid-2',
    name: 'Producto secundario',
    description: 'Descripción del producto secundario',
    price: 1490,
    discountedPrice: 1490,
    discountPercent: 0,
    isDiscounted: false,
    stock: true,
    image: {
      src: '/cdn-cgi/image/fit=cover,width=400/sample-2.webp',
      srcset: [
        '/cdn-cgi/image/fit=cover,width=200/sample-2.webp 200w',
        '/cdn-cgi/image/fit=cover,width=400/sample-2.webp 400w'
      ].join(', ')
    }
  }
];

const html = ejs.render(
  template,
  {
    products: sampleProducts,
    totalProducts: sampleProducts.length,
    inlinePayload: '{}'
  },
  { filename: templatePath, rmWhitespace: false }
);

const { document } = new JSDOM(html).window;

const lcpLink = document.querySelector('link[rel="preload"][as="image"][fetchpriority="high"][href="/cdn-cgi/image/fit=cover,width=400/sample.webp"]');
assert(lcpLink, 'Expected preload link for the LCP image');
assert.strictEqual(lcpLink.getAttribute('imagesrcset'), sampleProducts[0].image.srcset);
assert.strictEqual(
  lcpLink.getAttribute('imagesizes'),
  '(min-width: 1200px) 25vw, (min-width: 992px) 33vw, (min-width: 576px) 50vw, 100vw'
);

const productImages = document.querySelectorAll('.product-thumb');
assert.strictEqual(productImages.length, 2, 'Expected two product thumbnails');

const firstImage = productImages[0];
assert.strictEqual(firstImage.getAttribute('loading'), 'eager', 'First product must load eagerly');
assert.strictEqual(firstImage.getAttribute('fetchpriority'), 'high', 'First product must request high fetch priority');

const secondImage = productImages[1];
assert.strictEqual(secondImage.getAttribute('loading'), 'lazy', 'Subsequent products should remain lazy-loaded');
assert.strictEqual(secondImage.getAttribute('fetchpriority'), 'auto', 'Subsequent products should use auto fetch priority');

console.log('buildIndex.lcp.test.js passed');
