import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function auditSEO() {
    console.log('🔍 Running SEO audit...\n');
    
    const results = {
        structuredData: false,
        sitemap: false,
        robotsTxt: false,
        productPages: 0,
        performanceOptimizations: false,
        issues: []
    };
    
    // Check structured data
    const indexPath = path.join(__dirname, '..', 'index.html');
    if (fs.existsSync(indexPath)) {
        const indexContent = fs.readFileSync(indexPath, 'utf8');
        if (indexContent.includes('application/ld+json')) {
            results.structuredData = true;
            console.log('✅ Structured data found in index.html');
        } else {
            results.issues.push('Missing structured data in index.html');
        }
    }
    
    // Check sitemap
    const sitemapPath = path.join(__dirname, '..', 'sitemap.xml');
    if (fs.existsSync(sitemapPath)) {
        results.sitemap = true;
        console.log('✅ sitemap.xml found');
    } else {
        results.issues.push('Missing sitemap.xml');
    }
    
    // Check robots.txt
    const robotsPath = path.join(__dirname, '..', 'robots.txt');
    if (fs.existsSync(robotsPath)) {
        results.robotsTxt = true;
        console.log('✅ robots.txt found');
    } else {
        results.issues.push('Missing robots.txt');
    }
    
    // Check product pages
    const productDir = path.join(__dirname, '..', 'productos');
    if (fs.existsSync(productDir)) {
        const productFiles = fs.readdirSync(productDir).filter(f => f.endsWith('.html'));
        results.productPages = productFiles.length;
        console.log(`✅ ${productFiles.length} product pages generated`);
    } else {
        results.issues.push('No product pages directory found');
    }
    
    // Check performance optimizations
    if (fs.existsSync(indexPath)) {
        const indexContent = fs.readFileSync(indexPath, 'utf8');
        if (indexContent.includes('preconnect') && indexContent.includes('dns-prefetch')) {
            results.performanceOptimizations = true;
            console.log('✅ Performance optimizations applied');
        } else {
            results.issues.push('Performance optimizations not applied');
        }
    }
    
    // Report issues
    console.log('\n📊 SEO Audit Summary:');
    console.log(`Structured Data: ${results.structuredData ? '✅' : '❌'}`);
    console.log(`Sitemap: ${results.sitemap ? '✅' : '❌'}`);
    console.log(`Robots.txt: ${results.robotsTxt ? '✅' : '❌'}`);
    console.log(`Product Pages: ${results.productPages} generated`);
    console.log(`Performance Opts: ${results.performanceOptimizations ? '✅' : '❌'}`);
    
    if (results.issues.length > 0) {
        console.log('\n⚠️  Issues found:');
        results.issues.forEach(issue => console.log(`   - ${issue}`));
    } else {
        console.log('\n🎉 All SEO optimizations are in place!');
    }
    
    return results;
}

// Run audit if called directly
if (process.argv[1] === __filename) {
    auditSEO();
}

export default auditSEO;
