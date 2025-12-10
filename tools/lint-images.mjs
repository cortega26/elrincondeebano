import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

const repoRoot = process.cwd();
const htmlDirs = [repoRoot, path.join(repoRoot, 'pages')];
const cssDir = path.join(repoRoot, 'assets', 'css');

function findFiles(dir, exts) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((e) => {
    const res = path.join(dir, e.name);
    if (e.isDirectory()) return findFiles(res, exts);
    return exts.includes(path.extname(e.name)) ? [res] : [];
  });
}

function lintHtml(file, errors) {
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'));
  const imgs = dom.window.document.querySelectorAll('img');
  imgs.forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (src.includes('/assets/images/originals/')) {
      errors.push(`${file}: image points to originals ${src}`);
    }
    if (!img.getAttribute('width') || !img.getAttribute('height')) {
      errors.push(`${file}: <img> missing width/height`);
    }
    if (src.includes('/assets/images/variants/')) {
      if (!img.getAttribute('srcset') || !img.getAttribute('sizes')) {
        errors.push(`${file}: <img> missing srcset/sizes`);
      }
    }
  });
}

function lintCss(file, errors) {
  const css = fs.readFileSync(file, 'utf8');
  if (css.includes('/assets/images/originals/')) {
    errors.push(`${file}: references originals`);
  }
}

function run() {
  if (process.env.SKIP_IMAGE_OPT === '1') {
    console.log('Skipping image lint');
    return;
  }
  const errors = [];
  for (const dir of htmlDirs) {
    findFiles(dir, ['.html']).forEach((f) => lintHtml(f, errors));
  }
  findFiles(cssDir, ['.css']).forEach((f) => lintCss(f, errors));
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
}

run();
