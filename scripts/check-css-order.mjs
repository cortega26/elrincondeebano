#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, '..');

const outputRoot = process.env.BUILD_OUTPUT_DIR
  ? path.resolve(projectRoot, process.env.BUILD_OUTPUT_DIR)
  : path.join(projectRoot, 'build');

const htmlFiles = new Set([path.join(outputRoot, 'index.html')]);

const excludedFiles = new Set(['404.html', 'navbar.html', 'footer.html', 'offline.html']);

const pagesDir = path.join(outputRoot, 'pages');
async function main() {
  try {
    const entries = await fs.readdir(pagesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.html') && !excludedFiles.has(entry.name)) {
        htmlFiles.add(path.join(pagesDir, entry.name));
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const expectedOrder = [
    /\/dist\/css\/critical\.min\.css(?:\?|$)/,
    /\/dist\/css\/bootstrap\.min\.css(?:\?|$)/,
    /\/dist\/css\/style\.min\.css(?:\?|$)/,
  ];

  let failures = 0;

  for (const filePath of htmlFiles) {
    let html;
    try {
      html = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.error(
          `❌ File not found for CSS order check: ${path.relative(projectRoot, filePath)}`
        );
        failures += 1;
        continue;
      }
      throw error;
    }
    const dom = new JSDOM(html);
    const links = [...dom.window.document.querySelectorAll('head link[rel="stylesheet"]')];
    const hrefs = links.map((link) => ({
      href: link.getAttribute('href') || '',
      media: link.getAttribute('media'),
      element: link,
    }));

    const matches = expectedOrder.map((pattern) => {
      const index = hrefs.findIndex(({ href }) => pattern.test(href));
      return { pattern: pattern.toString(), index, link: index >= 0 ? hrefs[index] : null };
    });
    const missing = matches.some(({ index }) => index === -1);
    const outOfOrder = matches.some(
      ({ index }, i) =>
        index !== -1 && matches.slice(0, i).some((prev) => prev.index !== -1 && prev.index > index)
    );
    const hasDeferredMedia = matches.some(({ link }) => link && link.media && link.media !== 'all');

    if (missing || outOfOrder || hasDeferredMedia) {
      failures += 1;
      const messages = [];
      if (missing) {
        messages.push('missing expected stylesheet reference');
      }
      if (outOfOrder) {
        messages.push('stylesheets out of order');
      }
      if (hasDeferredMedia) {
        messages.push('found non-default media attribute on critical styles');
      }
      console.error(`❌ ${path.relative(projectRoot, filePath)}: ${messages.join(', ')}`);
      console.error('  Found order:', hrefs.map(({ href }) => href).join(' -> '));
    }
  }

  if (failures > 0) {
    console.error(`CSS order check failed for ${failures} file(s).`);
    process.exit(1);
  }

  console.log('✅ CSS order consistent across HTML entry points.');
}

main().catch((error) => {
  console.error('CSS order check failed to run:', error);
  process.exit(1);
});
