const fs = require('fs');
const path = require('path');
const { resolveFromOutput } = require('./utils/output-dir');

const LOGO_PRELOAD_PATH =
  '/cdn-cgi/image/fit=cover,quality=82,format=auto,width=64/assets/images/web/logo.webp';
const SCRIPT_PRELOAD_PATH = '/dist/js/script.min.js';

function generateResourceHints() {
  return `    <!-- Performance Resource Hints -->
    <link rel="dns-prefetch" href="//fonts.googleapis.com">
    <link rel="dns-prefetch" href="//fonts.gstatic.com">
    <link rel="dns-prefetch" href="//cdn.jsdelivr.net">
    <link rel="dns-prefetch" href="//cdnjs.cloudflare.com">

    <!-- Preload critical assets -->
    <link rel="preload" href="/dist/css/critical.min.css" as="style" fetchpriority="high">
    <link rel="preload" href="${LOGO_PRELOAD_PATH}" as="image" type="image/webp" fetchpriority="high">
    <link rel="modulepreload" href="${SCRIPT_PRELOAD_PATH}">`;
}

function injectResourceHints(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  const cleanedHtml = html.replace(
    /\s*<link rel="dns-prefetch" href="\/\/www\.googletagmanager\.com">\s*/g,
    '\n'
  );
  if (cleanedHtml !== html) {
    html = cleanedHtml;
    modified = true;
  }

  // Skip if already has our resource hints
  if (html.includes('<!-- Performance Resource Hints -->')) {
    if (modified) {
      fs.writeFileSync(filePath, html, 'utf8');
    }
    return modified; // reflect whether cleanup occurred
  }

  // Find a good place to inject - after existing preconnects but before title
  const preconnectPattern = /(<link rel="preconnect"[^>]*>\s*)+/g;
  const matches = [...html.matchAll(preconnectPattern)];

  if (matches.length > 0) {
    // Insert after the last preconnect
    const lastMatch = matches[matches.length - 1];
    const insertPosition = lastMatch.index + lastMatch[0].length;

    html =
      html.slice(0, insertPosition) +
      '\n' +
      generateResourceHints() +
      '\n' +
      html.slice(insertPosition);
    modified = true;
  } else {
    // Fallback: insert before title tag
    html = html.replace(/<title>/, generateResourceHints() + '\n\n    <title>');
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, html, 'utf8');
  }
  return modified; // Indicate whether the file was updated
}

function main() {
  let processedCount = 0;
  let modifiedCount = 0;

  try {
    // Process main index.html
    const indexPath = resolveFromOutput('index.html');
    if (fs.existsSync(indexPath)) {
      if (injectResourceHints(indexPath)) {
        modifiedCount++;
      }
      processedCount++;
    }

    // Process all pages in /pages/ directory
    const pagesDir = resolveFromOutput('pages');
    if (fs.existsSync(pagesDir)) {
      const pageFiles = fs
        .readdirSync(pagesDir)
        .filter((file) => file.endsWith('.html'))
        .filter((file) => !file.includes('navbar') && !file.includes('footer')); // Skip components

      pageFiles.forEach((file) => {
        const filePath = path.join(pagesDir, file);
        if (injectResourceHints(filePath)) {
          modifiedCount++;
        }
        processedCount++;
      });
    }

    console.log('✅ Resource hints processed');
    console.log(`📊 Files checked: ${processedCount}, Modified: ${modifiedCount}`);

    if (modifiedCount > 0) {
      console.log('🚀 Performance hints added! Pages should load slightly faster now.');
    } else {
      console.log('ℹ️ Resource hints already present in all files.');
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
