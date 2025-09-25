import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetch } from 'undici';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'assets', 'fonts');

const GOOGLE_CSS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Playfair+Display:wght@400;700&display=swap';

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(dest, buf);
}

async function main() {
  await fs.promises.mkdir(outDir, { recursive: true });
  const res = await fetch(GOOGLE_CSS, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Failed to fetch Google Fonts CSS: ${res.status}`);
  const css = await res.text();

  // Very small parser: find one woff2 URL per family/weight (latin subset preferred)
  const targets = [
    { family: 'Inter', weight: '400', file: 'inter-400.woff2' },
    { family: 'Inter', weight: '700', file: 'inter-700.woff2' },
    { family: 'Playfair Display', weight: '400', file: 'playfair-400.woff2' },
    { family: 'Playfair Display', weight: '700', file: 'playfair-700.woff2' },
  ];

  for (const t of targets) {
    // Tolerant search: locate a @font-face block that mentions the family and weight, then pick the first woff2 URL.
    const fam = t.family.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const blockRe = new RegExp(`@font-face\\s*{[\\s\\S]*?font-family:\\s*['\"]?${fam}['\"]?;[\\s\\S]*?font-weight:\\s*${t.weight}[\\s\\S]*?}`, 'm');
    const blockMatch = css.match(blockRe);
    if (!blockMatch) {
      console.warn(`No @font-face block found for ${t.family} ${t.weight}`);
      continue;
    }
    const block = blockMatch[0];
    const urlMatch = block.match(/url\(([^)]+\.woff2)\)/i);
    if (!urlMatch) {
      console.warn(`No woff2 URL inside block for ${t.family} ${t.weight}`);
      continue;
    }
    const url = urlMatch[1].replace(/\u0026/g, '&');
    const dest = path.join(outDir, t.file);
    console.log(`Downloading ${t.family} ${t.weight} -> ${t.file}`);
    await download(url, dest);
  }
  console.log('Fonts downloaded to assets/fonts');
}

main().catch((e) => { console.error(e); process.exit(1); });
