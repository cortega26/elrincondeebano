import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetch } from 'undici';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'assets', 'fonts');

const GOOGLE_CSS =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Playfair+Display:wght@400;700&display=swap';

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

  // Split into blocks once to make matching reliable
  for (const t of targets) {
    const famEsc = t.family.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const re = new RegExp(
      `@font-face\\s*{[\\s\\S]*?font-family:\\s*['\"]${famEsc}['\"][\\s\\S]*?font-weight:\\s*${t.weight}[\\s\\S]*?unicode-range:[^}]*U\\+0000-00FF[\\s\\S]*?}`,
      'm'
    );
    const match = css.match(re);
    const block = match ? match[0] : null;
    if (!block) {
      console.warn(`No latin subset block for ${t.family} ${t.weight}`);
      continue;
    }
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
