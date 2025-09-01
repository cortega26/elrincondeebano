import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateSitemap() {
  const baseUrl = 'https://elrincondeebano.com';
  const currentDate = new Date().toISOString().split('T')[0];
  
  // Define all site pages with their priorities and update frequencies
  const staticPages = [
    { url: '/', priority: '1.0', changefreq: 'daily', lastmod: currentDate },
    { url: '/pages/aguas.html', priority: '0.8', changefreq: 'weekly', lastmod: currentDate },
    { url: '/pages/bebidas.html', priority: '0.8', changefreq: 'weekly', lastmod: currentDate },
    { url: '/pages/carnesyembutidos.html', priority: '0.8', changefreq: 'weekly', lastmod: currentDate },
    { url: '/pages/cervezas.html', priority: '0.8', changefreq: 'weekly', lastmod: currentDate },
    { url: '/pages/chocolates.html', priority: '0.8', changefreq: 'weekly', lastmod: currentDate },
    { url: '/pages/despensa.html', priority: '0.8', changefreq: 'weekly', lastmod: currentDate },
    { url: '/pages/energeticaseisotonicas.html', priority: '0.7', changefreq: 'weekly', lastmod: currentDate },
    { url: '/pages/espumantes.html', priority: '0.7', changefreq: 'weekly', lastmod: currentDate },
    { url: '/pages/juegos.html', priority: '0.6', changefreq: 'monthly', lastmod: currentDate },
    { url: '/pages/jugos.html', priority: '0.7', changefreq: 'weekly', lastmod: currentDate },
    { url: '/pages/lacteos.html', priority: '0.8', changefreq: 'weekly', lastmod: currentDate },
    { url: '/pages/limpiezayaseo.html', priority: '0.7', changefreq: 'weekly', lastmod: currentDate },
    { url: '/pages/llaveros.html', priority: '0.5', changefreq: 'monthly', lastmod: currentDate },
    { url: '/pages/mascotas.html', priority: '0.6', changefreq: 'weekly', lastmod: currentDate },
    { url: '/pages/piscos.html', priority: '0.7', changefreq: 'weekly', lastmod: currentDate },
    { url: '/pages/snacksdulces.html', priority: '0.7', changefreq: 'weekly', lastmod: currentDate },
    { url: '/pages/snackssalados.html', priority: '0.7', changefreq: 'weekly', lastmod: currentDate },
    { url: '/pages/vinos.html', priority: '0.8', changefreq: 'weekly', lastmod: currentDate }
  ];
  
  // Load product data and generate product page URLs
  const dataPath = path.join(__dirname, '..', '_products', 'product_data.json');
  let productPages = [];
  
  try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const products = data.products || data;
    
    productPages = products
      .filter(product => product.stock === true)
      .map(product => {
        const slug = product.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        
        return {
          url: `/productos/${slug}.html`,
          priority: '0.6',
          changefreq: 'daily',
          lastmod: currentDate
        };
      });
  } catch (error) {
    console.warn('Could not load product data for sitemap:', error.message);
  }
  
  // Combine all pages
  const allPages = [...staticPages, ...productPages];
  
  // Generate sitemap XML
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${allPages.map(page => `  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${page.lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  // Write sitemap.xml to root directory
  const sitemapPath = path.join(__dirname, '..', 'sitemap.xml');
  fs.writeFileSync(sitemapPath, sitemap);
  
  // Generate robots.txt
  const robotsTxt = `User-agent: *
Allow: /

# Disallow admin areas
Disallow: /admin-panel/
Disallow: /_products/

# Allow important resources
Allow: /assets/
Allow: /pages/

# Sitemap location
Sitemap: ${baseUrl}/sitemap.xml

# Crawl delay
Crawl-delay: 1`;

  const robotsPath = path.join(__dirname, '..', 'robots.txt');
  fs.writeFileSync(robotsPath, robotsTxt);
  
  console.log(`✅ Generated sitemap with ${allPages.length} URLs`);
  console.log('✅ Generated robots.txt');
}

// Run if called directly
if (process.argv[1] === __filename) {
  generateSitemap();
}

export default generateSitemap;
