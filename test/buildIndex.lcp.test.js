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
        '/cdn-cgi/image/fit=cover,width=800/sample.webp 800w',
      ].join(', '),
      sizes: '(min-width: 1200px) 280px, (min-width: 992px) 240px, (min-width: 576px) 45vw, 80vw',
      avif: {
        src: '/cdn-cgi/image/fit=cover,width=400,format=avif/sample.avif',
        srcset: [
          '/cdn-cgi/image/fit=cover,width=200,format=avif/sample.avif 200w',
          '/cdn-cgi/image/fit=cover,width=400,format=avif/sample.avif 400w',
          '/cdn-cgi/image/fit=cover,width=800,format=avif/sample.avif 800w',
        ].join(', '),
      },
    },
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
        '/cdn-cgi/image/fit=cover,width=400/sample-2.webp 400w',
      ].join(', '),
      sizes: '(min-width: 1200px) 280px, (min-width: 992px) 240px, (min-width: 576px) 45vw, 80vw',
    },
  },
];

const html = ejs.render(
  template,
  {
    products: sampleProducts,
    totalProducts: sampleProducts.length,
    inlinePayload: '{}',
    preloadFonts: [],
  },
  { filename: templatePath, rmWhitespace: false }
);

const { document } = new JSDOM(html).window;

const preloadLinks = Array.from(
  document.querySelectorAll('link[rel="preload"][as="image"][fetchpriority="high"]')
);
const lcpLink = preloadLinks.find(
  (link) => link.getAttribute('imagesrcset') === sampleProducts[0].image.avif.srcset
);
assert(lcpLink, 'Expected preload link for the LCP image');
assert.strictEqual(lcpLink.getAttribute('href'), sampleProducts[0].image.avif.src);
const preloadType = lcpLink.getAttribute('type');
assert.strictEqual(preloadType && preloadType.replace(/"/g, ''), 'image/avif');
assert.strictEqual(
  lcpLink.getAttribute('imagesizes'),
  '(min-width: 1200px) 25vw, (min-width: 992px) 33vw, (min-width: 576px) 50vw, 100vw'
);

const productPictures = document.querySelectorAll('picture');
assert.strictEqual(productPictures.length, 2, 'Expected two picture wrappers');
const firstPicture = productPictures[0];
const firstAvifSource = firstPicture.querySelector('source[type="image/avif"]');
assert(firstAvifSource, 'Expected AVIF source element for first product');
assert.strictEqual(firstAvifSource.getAttribute('srcset'), sampleProducts[0].image.avif.srcset);
const secondPicture = productPictures[1];
assert.strictEqual(
  secondPicture.querySelector('source[type="image/avif"]'),
  null,
  'Second product should not render AVIF source when unavailable'
);

const productImages = document.querySelectorAll('.product-thumb');
assert.strictEqual(productImages.length, 2, 'Expected two product thumbnails');

const firstImage = productImages[0];
assert.strictEqual(firstImage.getAttribute('loading'), 'eager', 'First product must load eagerly');
assert.strictEqual(
  firstImage.getAttribute('fetchpriority'),
  'high',
  'First product must request high fetch priority'
);
assert.strictEqual(firstImage.getAttribute('sizes'), sampleProducts[0].image.sizes);
assert.strictEqual(firstImage.getAttribute('srcset'), sampleProducts[0].image.srcset);

const secondImage = productImages[1];
assert.strictEqual(
  secondImage.getAttribute('loading'),
  'lazy',
  'Subsequent products should remain lazy-loaded'
);
assert.strictEqual(
  secondImage.getAttribute('fetchpriority'),
  'auto',
  'Subsequent products should use auto fetch priority'
);

console.log('buildIndex.lcp.test.js passed');
