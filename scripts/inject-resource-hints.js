const fs = require('fs');
const path = require('path');

function generateResourceHints() {
  return `    <!-- Performance Resource Hints -->
    <link rel="dns-prefetch" href="//fonts.googleapis.com">
    <link rel="dns-prefetch" href="//fonts.gstatic.com">
    <link rel="dns-prefetch" href="//cdn.jsdelivr.net">
    <link rel="dns-prefetch" href="//www.googletagmanager.com">
    <link rel="dns-prefetch" href="//cdnjs.cloudflare.com">
    
    <!-- Preload critical assets -->
    <link rel="preload" href="/assets/css/critical.min.css" as="style" fetchpriority="high">
    <link rel="preload" href="/assets/images/web/logo.webp" as="image" type="image/webp" fetchpriority="high">`;
}

function injectResourceHints(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');
  
  // Skip if already has our resource hints
  if (html.includes('<!-- Performance Resource Hints -->')) {
    return false; // No changes made
  }

  // Find a good place to inject - after existing preconnects but before title
  const preconnectPattern = /(<link rel="preconnect"[^>]*>\s*)+/g;
  const matches = [...html.matchAll(preconnectPattern)];
  
  if (matches.length > 0) {
    // Insert after the last preconnect
    const lastMatch = matches[matches.length - 1];
    const insertPosition = lastMatch.index + lastMatch[0].length;
    
    html = html.slice(0, insertPosition) + 
           '\n' + generateResourceHints() + '\n' + 
           html.slice(insertPosition);
  } else {
    // Fallback: insert before title tag
    html = html.replace(/<title>/, generateResourceHints() + '\n\n    <title>');
  }

  fs.writeFileSync(filePath, html, 'utf8');
  return true; // Changes made
}

function main() {
  const rootDir = path.join(__dirname, '..');
  let processedCount = 0;
  let modifiedCount = 0;
  
  try {
    // Process main index.html
    const indexPath = path.join(rootDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      if (injectResourceHints(indexPath)) {
        modifiedCount++;
      }
      processedCount++;
    }

    // Process all pages in /pages/ directory
    const pagesDir = path.join(rootDir, 'pages');
    if (fs.existsSync(pagesDir)) {
      const pageFiles = fs.readdirSync(pagesDir)
        .filter(file => file.endsWith('.html'))
        .filter(file => !file.includes('navbar') && !file.includes('footer')); // Skip components
      
      pageFiles.forEach(file => {
        const filePath = path.join(pagesDir, file);
        if (injectResourceHints(filePath)) {
          modifiedCount++;
        }
        processedCount++;
      });
    }

    console.log(`✅ Resource hints processed`);
    console.log(`📊 Files checked: ${processedCount}, Modified: ${modifiedCount}`);
    
    if (modifiedCount > 0) {
      console.log(`🚀 Performance hints added! Pages should load slightly faster now.`);
    } else {
      console.log(`ℹ️ Resource hints already present in all files.`);
    }
    
  } catch (error) {
    console.error('❌ Error injecting resource hints:', error.message);
    // Don't throw - we don't want to break the build
  }
}

if (require.main === module) {
  main();
}

module.exports = { injectResourceHints };
