import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

const repoRoot = process.cwd();
const htmlDirs = [repoRoot, path.join(repoRoot, 'pages')];
const cssDir = path.join(repoRoot, 'assets', 'css');
const varRoot = '/assets/images/variants';

const defaultWidths = [200, 400, 600, 800, 1200, 1600, 2000];
const thumbWidths = [200, 400, 600];
const heroWidths = [1200, 1600, 2000];

function findFiles(dir, exts) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap(e => {
    const res = path.join(dir, e.name);
    if (e.isDirectory()) return findFiles(res, exts);
    return exts.includes(path.extname(e.name)) ? [res] : [];
  });
}

function buildSrcset(base, ext, widths) {
  return widths.map(w => `${varRoot}/${base}-${w}.${ext} ${w}w`).join(', ');
}

function rewriteHtml(file) {
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'));
  const { document } = dom.window;
  document.querySelectorAll('img[src*="/assets/images/originals/"]').forEach(img => {
    const src = img.getAttribute('src');
    const rel = src.replace('/assets/images/originals/', '');
    const base = rel.replace(/\.[^./]+$/, '');
    const origExt = path.extname(rel).slice(1);
    const w = parseInt(img.getAttribute('width') || '0', 10);
    const h = parseInt(img.getAttribute('height') || '0', 10);
    let widths = defaultWidths;
    let sizes = '(min-width:768px) 100vw, 100vw';
    if (w === 200 && h === 200) {
      widths = thumbWidths;
      sizes = '(min-width:768px) 200px, 33vw';
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
    }
    if (img.hasAttribute('data-hero')) {
      widths = heroWidths;
      sizes = '100vw';
      img.setAttribute('fetchpriority', 'high');
      img.removeAttribute('loading');
      const preload = document.createElement('link');
      const avifSet = buildSrcset(base, 'avif', widths);
      preload.setAttribute('rel', 'preload');
      preload.setAttribute('as', 'image');
      preload.setAttribute('href', `${varRoot}/${base}-${widths[widths.length - 1]}.avif`);
      preload.setAttribute('imagesrcset', avifSet);
      preload.setAttribute('imagesizes', sizes);
      document.head.appendChild(preload);
    }
    const picture = document.createElement('picture');
    const avif = document.createElement('source');
    avif.setAttribute('type', 'image/avif');
    avif.setAttribute('srcset', buildSrcset(base, 'avif', widths));
    avif.setAttribute('sizes', sizes);
    const webp = document.createElement('source');
    webp.setAttribute('type', 'image/webp');
    webp.setAttribute('srcset', buildSrcset(base, 'webp', widths));
    webp.setAttribute('sizes', sizes);
    img.setAttribute('src', `${varRoot}/${base}-${widths[0]}.${origExt}`);
    img.setAttribute('srcset', buildSrcset(base, origExt, widths));
    img.setAttribute('sizes', sizes);
    picture.appendChild(avif);
    picture.appendChild(webp);
    picture.appendChild(img.cloneNode(true));
    img.replaceWith(picture);
  });
  fs.writeFileSync(file, dom.serialize());
}

function rewriteCss(file) {
  let css = fs.readFileSync(file, 'utf8');
  css = css.replace(/url\((['"])?\/assets\/images\/originals\/(.+?)\.(jpe?g|png)\1\)/g, (_m, q, name, ext) => {
    const base = name;
    return `image-set(url(${varRoot}/${base}-800.avif) type('image/avif'), url(${varRoot}/${base}-800.webp) type('image/webp'), url(${varRoot}/${base}-800.${ext}) type('image/${ext === 'png' ? 'png' : 'jpeg'}'))`;
  });
  fs.writeFileSync(file, css);
}

function run() {
  if (process.env.SKIP_IMAGE_OPT === '1') {
    console.log('Skipping image rewrite');
    return;
  }
  for (const dir of htmlDirs) {
    const files = findFiles(dir, ['.html']);
    files.forEach(rewriteHtml);
  }
  const cssFiles = findFiles(cssDir, ['.css']);
  cssFiles.forEach(rewriteCss);
}

run();
