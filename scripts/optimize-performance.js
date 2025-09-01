import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function addPerformanceOptimizations() {
    console.log('🚀 Adding Core Web Vitals optimizations...');
    
    // Performance hints to add to all HTML files
    const performanceHints = `
    <!-- Critical performance optimizations -->
    <link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
    <link rel="dns-prefetch" href="//www.googletagmanager.com">
    <link rel="dns-prefetch" href="//www.google-analytics.com">
    
    <!-- Preload critical resources -->
    <link rel="preload" href="/assets/css/critical.min.css" as="style">
    <link rel="preload" href="/assets/js/script.min.js" as="script">
    <link rel="preload" href="/assets/images/web/logo.webp" as="image" type="image/webp" fetchpriority="high">`;
    
    // Files to optimize
    const files = ['index.html'];
    
    // Add category pages
    const pagesDir = path.join(__dirname, '..', 'pages');
    if (fs.existsSync(pagesDir)) {
        const categoryPages = fs.readdirSync(pagesDir)
            .filter(f => f.endsWith('.html') && f !== 'navbar.html' && f !== 'footer.html')
            .map(f => `pages/${f}`);
        files.push(...categoryPages);
    }
    
    // Apply optimizations to each file
    files.forEach(file => {
        const filePath = path.join(__dirname, '..', file);
        if (!fs.existsSync(filePath)) return;
        
        let html = fs.readFileSync(filePath, 'utf8');
        
        // Add performance hints if not already present
        if (!html.includes('rel="preconnect"') && !html.includes('dns-prefetch')) {
            html = html.replace('</head>', `${performanceHints}\n</head>`);
        }
        
        // Optimize font loading with font-display: swap
        html = html.replace(
            /family=Inter:wght@400;700&family=Playfair\+Display:wght@400;700&display=swap/g,
            'family=Inter:wght@400;700&family=Playfair+Display:wght@400;700&display=swap'
        );
        
        // Add loading="lazy" to images that aren't critical
        html = html.replace(
            /<img(?![^>]*loading=)([^>]*class="[^"]*(?:card-img-top|product-image))/g,
            '<img loading="lazy"$1'
        );
        
        // Add width/height attributes to prevent CLS (where missing)
        html = html.replace(
            /<img([^>]*src="[^"]*logo\.webp"[^>]*)>/g,
            '<img$1 width="30" height="30">'
        );
        
        fs.writeFileSync(filePath, html);
    });
    
    console.log(`✅ Applied performance optimizations to ${files.length} files`);
}

function generateEnhancedCriticalCSS() {
    console.log('🎨 Generating enhanced critical CSS...');
    
    const criticalCSS = `/* Critical CSS for Core Web Vitals */
/* Prevent CLS with skeleton loading */
.loading-skeleton {
    background: linear-gradient(90deg, #f0f0f0 25%, transparent 37%, #f0f0f0 63%);
    background-size: 400% 100%;
    animation: loading 1.4s ease-in-out infinite;
    height: 200px;
    border-radius: 8px;
}

@keyframes loading {
    0% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}

/* Optimize font loading */
@font-face {
    font-family: 'Inter';
    font-display: swap;
}

@font-face {
    font-family: 'Playfair Display';
    font-display: swap;
}

/* Critical layout styles */
.navbar-brand img {
    width: 30px;
    height: 30px;
    object-fit: contain;
}

.hero-section {
    padding: 2rem 0;
    min-height: 200px;
}

/* Product card optimizations */
.card {
    transition: transform 0.2s ease;
    height: 100%;
}

.card-img-top {
    height: 200px;
    object-fit: contain;
    width: 100%;
}

/* Price display */
.precio-descuento {
    font-weight: bold;
    color: #28a745;
    font-size: 1.1em;
}

.precio-original .tachado {
    text-decoration: line-through;
    color: #6c757d;
}

/* Notification system for updates */
.notification-toast {
    position: fixed;
    top: 80px;
    right: 20px;
    background: white;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 1060;
    max-width: 350px;
    border-left: 4px solid #007bff;
    font-family: 'Inter', sans-serif;
}

.notification-actions {
    margin-top: 12px;
    display: flex;
    gap: 8px;
}

.primary-action {
    background: #007bff;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
}

.secondary-action {
    background: transparent;
    color: #6c757d;
    border: 1px solid #dee2e6;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
}

/* Accessibility improvements */
@media (prefers-reduced-motion: reduce) {
    .loading-skeleton {
        animation: none;
    }
    
    .card {
        transition: none;
    }
}

/* Mobile optimizations */
@media (max-width: 768px) {
    .hero-section {
        padding: 1rem 0;
        min-height: 150px;
    }
    
    .notification-toast {
        right: 10px;
        left: 10px;
        max-width: none;
    }
}`;

    const outputPath = path.join(__dirname, '..', 'assets', 'css', 'critical-enhanced.min.css');
    fs.writeFileSync(outputPath, criticalCSS);
    
    console.log('✅ Generated enhanced critical CSS');
}

function updateServiceWorkerConfig() {
    console.log('⚡ Updating service worker for better performance...');
    
    const swPath = path.join(__dirname, '..', 'service-worker.js');
    if (!fs.existsSync(swPath)) {
        console.warn('⚠️  Service worker not found, skipping SW optimizations');
        return;
    }
    
    let swContent = fs.readFileSync(swPath, 'utf8');
    
    // Add product pages to cache list
    const productPagesComment = '        // Individual product pages will be cached dynamically';
    
    if (!swContent.includes(productPagesComment)) {
        // Find the staticAssets array and add a comment
        swContent = swContent.replace(
            /(\s+)(staticAssets:\s*\[)/,
            `$1$2\n        // Core pages and assets$1`
        );
    }
    
    fs.writeFileSync(swPath, swContent);
    console.log('✅ Updated service worker configuration');
}

// Run optimizations
if (process.argv[1] === __filename) {
    addPerformanceOptimizations();
    generateEnhancedCriticalCSS();
    updateServiceWorkerConfig();
}

export {
    addPerformanceOptimizations,
    generateEnhancedCriticalCSS,
    updateServiceWorkerConfig
};
