import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { loadCategoryCatalog } = require('./utils/category-catalog.js');

const repoRoot = process.cwd();
const outputDir = path.join(repoRoot, 'assets', 'images', 'og', 'categories');
const width = 1200;
const height = 630;

const iconLibrary = {
  droplet: `
    <path d="M128 16C94 70 70 106 70 146c0 33 25 62 58 68 37 7 74-16 84-53 9-34-13-72-84-145z" />
    <circle cx="112" cy="154" r="18" fill="#ffffff" fill-opacity="0.35" />
  `,
  bottle: `
    <rect x="104" y="28" width="48" height="34" rx="10" />
    <rect x="88" y="62" width="80" height="150" rx="30" />
    <rect x="98" y="104" width="60" height="56" rx="12" fill="#ffffff" fill-opacity="0.35" />
  `,
  wine: `
    <path d="M70 30h116v18c0 44-30 92-58 104v38h36v26H92v-26h36v-38c-28-12-58-60-58-104V30z" />
    <rect x="92" y="30" width="72" height="30" fill="#ffffff" fill-opacity="0.28" />
  `,
  beer: `
    <rect x="72" y="64" width="112" height="140" rx="18" />
    <rect x="92" y="38" width="72" height="28" rx="12" />
    <path d="M184 88h24c18 0 30 12 30 30v32c0 18-12 30-30 30h-24z" fill="#ffffff" />
    <rect x="92" y="112" width="72" height="64" rx="10" fill="#ffffff" fill-opacity="0.3" />
  `,
  chocolate: `
    <rect x="64" y="52" width="128" height="160" rx="18" />
    <g fill="#ffffff" fill-opacity="0.28">
      <rect x="76" y="64" width="44" height="40" rx="8" />
      <rect x="128" y="64" width="44" height="40" rx="8" />
      <rect x="76" y="112" width="44" height="40" rx="8" />
      <rect x="128" y="112" width="44" height="40" rx="8" />
      <rect x="76" y="160" width="44" height="40" rx="8" />
      <rect x="128" y="160" width="44" height="40" rx="8" />
    </g>
  `,
  candy: `
    <circle cx="128" cy="128" r="56" />
    <path d="M38 108l42 20-42 20z" />
    <path d="M218 108l-42 20 42 20z" />
    <circle cx="128" cy="128" r="26" fill="#ffffff" fill-opacity="0.3" />
  `,
  chips: `
    <path d="M64 56h128l-8 160c-2 22-20 40-42 40h-36c-22 0-40-18-42-40z" />
    <path d="M78 100c18-10 82-10 100 0-4 24-14 36-50 36s-46-12-50-36z" fill="#ffffff" fill-opacity="0.35" />
  `,
  pantry: `
    <rect x="72" y="64" width="112" height="144" rx="20" />
    <rect x="88" y="40" width="80" height="30" rx="12" />
    <rect x="92" y="118" width="72" height="54" rx="10" fill="#ffffff" fill-opacity="0.35" />
  `,
  spray: `
    <path d="M88 64h56l12 24H88z" />
    <rect x="88" y="86" width="80" height="128" rx="26" />
    <path d="M156 70l32-14 10 18-34 16z" />
    <rect x="104" y="120" width="48" height="44" rx="10" fill="#ffffff" fill-opacity="0.35" />
  `,
  milk: `
    <path d="M88 52h80l20 30v134c0 16-12 28-28 28H96c-16 0-28-12-28-28V82z" />
    <path d="M88 52h80l-20-26H108z" />
    <rect x="108" y="122" width="40" height="54" rx="10" fill="#ffffff" fill-opacity="0.35" />
  `,
  bolt: `
    <path d="M140 32L82 132h48l-16 92 78-118h-52z" />
  `,
  key: `
    <circle cx="96" cy="120" r="44" />
    <circle cx="96" cy="120" r="18" fill="#ffffff" fill-opacity="0.35" />
    <rect x="140" y="112" width="80" height="20" rx="8" />
    <rect x="188" y="112" width="16" height="40" rx="6" />
  `,
  juice: `
    <rect x="84" y="50" width="88" height="156" rx="16" />
    <rect x="104" y="30" width="48" height="22" rx="8" />
    <rect x="120" y="18" width="12" height="44" rx="6" />
    <rect x="104" y="118" width="48" height="50" rx="10" fill="#ffffff" fill-opacity="0.35" />
  `,
  paw: `
    <circle cx="88" cy="84" r="18" />
    <circle cx="128" cy="64" r="18" />
    <circle cx="168" cy="84" r="18" />
    <circle cx="128" cy="100" r="20" />
    <path d="M84 170c0-28 22-50 44-50s44 22 44 50-18 50-44 50-44-22-44-50z" />
  `,
  dice: `
    <rect x="56" y="56" width="144" height="144" rx="26" />
    <circle cx="92" cy="92" r="12" fill="#ffffff" fill-opacity="0.35" />
    <circle cx="164" cy="92" r="12" fill="#ffffff" fill-opacity="0.35" />
    <circle cx="128" cy="128" r="12" fill="#ffffff" fill-opacity="0.35" />
    <circle cx="92" cy="164" r="12" fill="#ffffff" fill-opacity="0.35" />
    <circle cx="164" cy="164" r="12" fill="#ffffff" fill-opacity="0.35" />
  `,
  meat: `
    <rect x="48" y="72" width="160" height="128" rx="54" />
    <circle cx="176" cy="108" r="20" fill="#ffffff" fill-opacity="0.35" />
    <rect x="90" y="122" width="72" height="12" rx="6" fill="#ffffff" fill-opacity="0.35" />
  `,
  sparkle: `
    <path d="M128 36l20 44 44 20-44 20-20 44-20-44-44-20 44-20z" />
    <circle cx="188" cy="188" r="14" fill="#ffffff" fill-opacity="0.35" />
  `,
  pisco: `
    <rect x="96" y="32" width="64" height="36" rx="10" />
    <rect x="88" y="66" width="80" height="124" rx="28" />
    <rect x="168" y="130" width="48" height="72" rx="12" />
    <rect x="178" y="148" width="28" height="34" rx="8" fill="#ffffff" fill-opacity="0.35" />
  `,
};

const categoryThemes = {
  carnesyembutidos: { icon: 'meat', accent: '#7C2D2D', accent2: '#D9776A' },
  aguas: { icon: 'droplet', accent: '#0F5FA8', accent2: '#7EC8F2' },
  chocolates: { icon: 'chocolate', accent: '#5B2C25', accent2: '#C08A6B' },
  juegos: { icon: 'dice', accent: '#1E3A8A', accent2: '#93C5FD' },
  despensa: { icon: 'pantry', accent: '#6B4F2A', accent2: '#C7A26A' },
  bebidas: { icon: 'bottle', accent: '#0F766E', accent2: '#6EE7C7' },
  snacksdulces: { icon: 'candy', accent: '#B1365F', accent2: '#F6A7C1' },
  limpiezayaseo: { icon: 'spray', accent: '#1D4E89', accent2: '#9BD3F7' },
  mayoraseolimpieza: { icon: 'spray', accent: '#1D4E89', accent2: '#9BD3F7' },
  lacteos: { icon: 'milk', accent: '#3B6FB6', accent2: '#CFE6FF' },
  energeticaseisotonicas: { icon: 'bolt', accent: '#C2410C', accent2: '#FDBA74' },
  snackssalados: { icon: 'chips', accent: '#B45309', accent2: '#FCD34D' },
  llaveros: { icon: 'key', accent: '#334155', accent2: '#94A3B8' },
  jugos: { icon: 'juice', accent: '#C2410C', accent2: '#FAD08B' },
  mascotas: { icon: 'paw', accent: '#166534', accent2: '#86EFAC' },
  cervezas: { icon: 'beer', accent: '#92400E', accent2: '#FBBF24' },
  vinos: { icon: 'wine', accent: '#7F1D1D', accent2: '#F4A29B' },
  espumantes: { icon: 'sparkle', accent: '#2F855A', accent2: '#B7F7D0' },
  piscos: { icon: 'pisco', accent: '#0F766E', accent2: '#99F6E4' },
};

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapTitle(text, maxChars = 20, maxLines = 2) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1);
    const tail = lines.slice(maxLines - 1).join(' ');
    return [...head, tail];
  }
  return lines;
}

function buildSvg({ title, iconMarkup, accent, accent2 }) {
  const safeTitle = escapeXml(title);
  const titleLines = wrapTitle(safeTitle, 20, 2);
  const titleSize = titleLines.length > 1 ? 50 : 58;
  const lineHeight = titleSize + 10;
  const titleStartY = 230;
  const subtitleY = titleStartY + titleLines.length * lineHeight + 10;

  const titleText = titleLines
    .map((line, index) => {
      const y = titleStartY + index * lineHeight;
      return `<text x="110" y="${y}" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="${titleSize}" font-weight="700">${line}</text>`;
    })
    .join('');

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${accent}" />
          <stop offset="100%" stop-color="${accent2}" />
        </linearGradient>
        <radialGradient id="glow" cx="0.2" cy="0.1" r="0.9">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
        </radialGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#000000" flood-opacity="0.25" />
        </filter>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)" />
      <rect width="${width}" height="${height}" fill="url(#glow)" />
      <g opacity="0.2" fill="#ffffff">
        <circle cx="120" cy="90" r="70" />
        <circle cx="380" cy="560" r="120" />
        <circle cx="1060" cy="110" r="90" />
        <circle cx="980" cy="530" r="130" />
      </g>
      <rect x="70" y="120" width="620" height="390" rx="32" fill="#0B0B0B" fill-opacity="0.18" />
      ${titleText}
      <text x="110" y="${subtitleY}" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="500" opacity="0.9">El Rincon de Ebano</text>
      <g transform="translate(760 150) scale(1.25)" filter="url(#shadow)">
        <circle cx="128" cy="128" r="118" fill="#ffffff" fill-opacity="0.16" stroke="#ffffff" stroke-opacity="0.5" stroke-width="4" />
        <g fill="#ffffff">
          ${iconMarkup}
        </g>
      </g>
    </svg>
  `;
}

function loadCategories() {
  const data = loadCategoryCatalog();
  return Array.isArray(data.categories)
    ? data.categories.filter((category) => category && category.enabled !== false)
    : [];
}

function getTheme(slug) {
  const key = String(slug || '').toLowerCase();
  if (categoryThemes[key]) return categoryThemes[key];
  return { icon: 'pantry', accent: '#1F2937', accent2: '#6B7280' };
}

async function buildOgImage({ title, slug }) {
  const theme = getTheme(slug);
  const iconMarkup = iconLibrary[theme.icon] || iconLibrary.pantry;
  const svg = buildSvg({ title, iconMarkup, accent: theme.accent, accent2: theme.accent2 });
  const outputPath = path.join(outputDir, `${slug}.jpg`);
  await sharp(Buffer.from(svg))
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(outputPath);
  console.log(`Generated ${slug} (generic)`);
}

async function run() {
  fs.mkdirSync(outputDir, { recursive: true });

  const categories = loadCategories();
  const seen = new Set();

  for (const category of categories) {
    const slug = String(category.slug || category.id || '').trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const title = category.title || category.product_key || category.id || slug;
    await buildOgImage({ title, slug });
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
