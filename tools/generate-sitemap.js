const fs = require('fs');
const path = require('path');
const {
  resolveFromOutput,
  ensureDir,
} = require('./utils/output-dir');

function generateSitemap() {
  const baseUrl = 'https://elrincondeebano.com';
  const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  
  // Static pages (high priority)
  const staticPages = [
    { url: '', priority: '1.0', changefreq: 'daily' }, // homepage
    { url: '/404.html', priority: '0.1', changefreq: 'yearly' }
  ];

  // Category pages (medium-high priority)
  const categoryPages = [
    'aguas', 'bebidas', 'carnesyembutidos', 'cervezas', 'chocolates',
    'despensa', 'energeticaseisotonicas', 'espumantes', 'juegos', 'jugos',
    'lacteos', 'limpiezayaseo', 'llaveros', 'mascotas', 'piscos',
    'snacksdulces', 'snackssalados', 'software', 'vinos'
  ].map(category => ({
    url: `/pages/${category}.html`,
    priority: '0.8',
    changefreq: 'weekly'
  }));

  // Combine all URLs
  const allPages = [...staticPages, ...categoryPages];

  // Generate XML
  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

  allPages.forEach(page => {
    sitemap += `  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>
`;
  });

  sitemap += `</urlset>`;

  return sitemap;
}

function main() {
  try {
    const sitemapContent = generateSitemap();
    const sitemapPath = resolveFromOutput('sitemap.xml');
    ensureDir(path.dirname(sitemapPath));

    fs.writeFileSync(sitemapPath, sitemapContent, 'utf8');
    console.log('✅ Sitemap generated successfully at sitemap.xml');
    
    // Also log some stats
    const urlCount = (sitemapContent.match(/<url>/g) || []).length;
    console.log(`📊 Generated sitemap with ${urlCount} URLs`);
    
  } catch (error) {
    console.error('❌ Error generating sitemap:', error.message);
    // Don't throw - we don't want to break the build if sitemap fails
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateSitemap };
