// Follow-up (Auditoría 9 / plan 119): the dist ships full-size AVIF
// originals that no HTML references (cards use the variant srcsets; the
// JSON-LD references the .webp originals). This step prunes dist assets
// not referenced by any built page, then reports the freed space. Runs
// after the Astro build, before the asset contract validation (which only
// requires referenced files to exist).
'use strict';

import { readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const DIST_ROOT = join(REPO_ROOT, 'astro-poc', 'dist');

function collectHtmlFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectHtmlFiles(full));
    else if (entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}

function collectDataReferencedAssets() {
  const referenced = new Set();
  const dataPath = join(DIST_ROOT, 'data', 'product_data.json');
  if (!statSync(dataPath).isFile()) return referenced;
  const payload = JSON.parse(readFileSync(dataPath, 'utf8'));
  const fields = ['image_path', 'image_avif_path', 'thumbnail_path'];
  for (const product of payload.products ?? []) {
    for (const field of fields) {
      const raw = product?.[field];
      if (typeof raw === 'string' && raw.startsWith('assets/')) {
        referenced.add(raw);
      }
    }
  }
  return referenced;
}

function collectReferencedAssets() {
  const referenced = new Set();
  for (const htmlFile of collectHtmlFiles(DIST_ROOT)) {
    const html = readFileSync(htmlFile, 'utf8');

    // Attribute refs (src/href/srcset/content) — the HTML encodes spaces
    // as %20, so refs are decoded before comparing with on-disk names
    // (same normalization the asset contract applies).
    const normalizeRef = (raw) => {
      try {
        // Strip any ?v=... query (cache-busters) — the asset contract
        // resolves refs via URL().pathname, which drops the query too.
        const withoutQuery = raw.split('?')[0];
        const decoded = decodeURIComponent(withoutQuery).replace(/\\/g, '/');
        return decoded.replace(/^\/+/, '');
      } catch {
        return null;
      }
    };

    for (const match of html.matchAll(
      /\b(?:src|href|poster|content|srcset)\s*=\s*(["'])([^"']*assets\/images\/[^"']+)\1/gis
    )) {
      let ref = match[2];
      // Handles '/assets/images/...' and full URLs
      // ('https://host/assets/images/...', e.g. og meta content), plus
      // srcset values with multiple entries and width descriptors
      // ('logo-40.avif 40w, logo-80.avif 80w').
      const marker = '/assets/images/';
      let searchFrom = 0;
      let idx = ref.indexOf(marker, searchFrom);
      while (idx >= 0) {
        const rest = ref.slice(idx);
        // The path ends at whitespace (descriptor), quote, comma or ')'.
        const end = rest.search(/[\s,)"']/);
        const candidate = end >= 0 ? rest.slice(0, end) : rest;
        const normalized = normalizeRef(candidate);
        if (normalized) referenced.add(normalized);
        searchFrom = idx + marker.length;
        idx = ref.indexOf(marker, searchFrom);
      }
    }

    // JSON-LD product schema refs — relative paths without a leading slash
    // ("image":"assets/images/<cat>/<file>"). These are the SEO contract
    // for the full-size originals; the prune must keep them.
    for (const match of html.matchAll(/["']image["']\s*:\s*["'](assets\/images\/[^"']+)["']/g)) {
      const normalized = normalizeRef(match[1]);
      if (normalized) referenced.add(normalized);
    }
  }
  return referenced;
}

async function run() {
  const htmlRefs = collectReferencedAssets();
  const dataRefs = collectDataReferencedAssets();
  const referenced = new Set([...htmlRefs, ...dataRefs]);
  void htmlRefs;
  void dataRefs;
  const imagesRoot = join(DIST_ROOT, 'assets', 'images');
  let removed = 0;
  let freed = 0;

  for (const category of readdirSync(imagesRoot, { withFileTypes: true })) {
    if (!category.isDirectory()) continue;
    const categoryPath = join(imagesRoot, category.name);
    for (const file of readdirSync(categoryPath, { withFileTypes: true })) {
      if (!file.isFile()) continue;
      const rel = `assets/images/${category.name}/${file.name}`;
      if (referenced.has(rel)) continue;
      const absolute = join(categoryPath, file.name);
      freed += statSync(absolute).size;
      unlinkSync(absolute);
      removed += 1;
    }
  }

  console.log(
    `[prune-images] removed ${removed} unreferenced image(s) from dist (${(freed / 1048576).toFixed(1)} MB freed).`
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
