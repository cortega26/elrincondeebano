import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_ORIGIN = 'https://www.elrincondeebano.com';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const sitemapPath = path.join(distRoot, 'sitemap.xml');

function walkHtmlFiles(dir, list = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkHtmlFiles(fullPath, list);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) {
      list.push(fullPath);
    }
  }
  return list;
}

function toPathname(htmlFile) {
  const relative = path.relative(distRoot, htmlFile).replace(/\\/g, '/');
  if (relative === 'index.html') {
    return '/';
  }
  if (relative.endsWith('/index.html')) {
    return `/${relative.slice(0, -'index.html'.length)}`;
  }
  return `/${relative}`;
}

function isIndexableHtml(htmlFile) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  return !/<meta\s+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html);
}

const htmlFiles = walkHtmlFiles(distRoot);
const routes = htmlFiles
  .filter((htmlFile) => isIndexableHtml(htmlFile))
  .map(toPathname)
  .filter((pathname) => pathname !== '/404.html');
const uniqueRoutes = [...new Set(routes)].sort((a, b) => a.localeCompare(b, 'en'));

const xmlLines = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...uniqueRoutes.map((pathname) => `  <url><loc>${SITE_ORIGIN}${pathname}</loc></url>`),
  '</urlset>',
];

fs.writeFileSync(sitemapPath, `${xmlLines.join('\n')}\n`, 'utf8');
console.log(`Generated sitemap with ${uniqueRoutes.length} URLs at ${sitemapPath}`);
